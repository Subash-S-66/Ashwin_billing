import sys
import os
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import sqlite3
import json
import math
import pandas as pd
import traceback
from datetime import datetime
import webbrowser
from threading import Timer
import io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm


if getattr(sys, 'frozen', False):
    # PyInstaller creates a temp folder and stores path in _MEIPASS
    base_dir = sys._MEIPASS
    app_data_dir = os.path.dirname(sys.executable) # Where the .exe is running from
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    app_data_dir = os.path.dirname(os.path.abspath(__file__))

static_folder = os.path.join(base_dir, 'dist') if getattr(sys, 'frozen', False) else os.path.abspath(os.path.join(base_dir, '../frontend/dist'))

app = Flask(__name__, static_folder=static_folder, static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.errorhandler(Exception)
def handle_exception(e):
    print("!!! SERVER ERROR !!!")
    print(traceback.format_exc())
    return jsonify({"error": str(e)}), 500

@app.before_request
def log_request_info():
    if request.path.startswith('/api'):
        print(f"API Request: {request.method} {request.path}")
        data = request.get_json(silent=True)
        if data:
            print(f"Payload: {data}")

def get_writable_dir():
    # Vercel serverless filesystem is read-only except /tmp
    if os.environ.get('VERCEL'):
        return '/tmp'
    return app_data_dir

WRITABLE_DIR = get_writable_dir()
DB_PATH = os.path.join(WRITABLE_DIR, 'billing.db')
MENU_PATH = os.path.join(app_data_dir, 'menu.json') if getattr(sys, 'frozen', False) else os.path.abspath(os.path.join(base_dir, '../menu.json'))

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            items_json TEXT,
            total REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS menu (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            name TEXT,
            price REAL,
            out_of_stock INTEGER DEFAULT 0
        )
    ''')
    conn.commit()
    
    # Init menu if empty
    c.execute('SELECT COUNT(*) FROM menu')
    if c.fetchone()[0] == 0:
        if os.path.exists(MENU_PATH):
            with open(MENU_PATH, 'r', encoding='utf-8') as f:
                raw_menu = json.load(f)
                category = "General"
                for row in raw_menu:
                    col0 = row.get('Menu Price List')
                    col1 = row.get('Unnamed: 1')
                    col2 = row.get('Unnamed: 2')
                    
                    if isinstance(col0, str) and (col1 is None or (isinstance(col1, float) and math.isnan(col1))):
                        category = col0.strip(' .0123456789')
                    elif isinstance(col1, str) and (isinstance(col2, (int, float)) and not math.isnan(col2)):
                        c.execute('INSERT INTO menu (category, name, price, out_of_stock) VALUES (?, ?, ?, 0)', (category, col1, col2))
            conn.commit()
        else:
            # Insert some defaults if menu.json not found
            c.execute('INSERT INTO menu (category, name, price, out_of_stock) VALUES (?, ?, ?, 0)', ("Default", "Coffee", 100))
            c.execute('INSERT INTO menu (category, name, price, out_of_stock) VALUES (?, ?, ?, 0)', ("Default", "Tea", 50))
            conn.commit()
    conn.close()

init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/menu', methods=['GET'])
def get_menu():
    conn = get_db_connection()
    items = conn.execute('SELECT * FROM menu ORDER BY category ASC, name ASC').fetchall()
    conn.close()
    return jsonify([dict(item) for item in items])

@app.route('/api/menu', methods=['POST'])
def add_menu_item():
    data = request.get_json()
    category = data.get('category', 'General')
    name = data.get('name')
    try:
        price = float(data.get('price', 0))
    except (ValueError, TypeError):
        price = 0.0
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('INSERT INTO menu (category, name, price, out_of_stock) VALUES (?, ?, ?, 0)', (category, name, price))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/menu/<int:item_id>', methods=['PUT'])
def update_menu_item(item_id):
    data = request.get_json()
    category = data.get('category')
    name = data.get('name')
    try:
        price = float(data.get('price', 0))
    except (ValueError, TypeError):
        price = 0.0
    out_of_stock = data.get('out_of_stock', 0)
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('UPDATE menu SET category=?, name=?, price=?, out_of_stock=? WHERE id=?', (category, name, price, out_of_stock, item_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/menu/<int:item_id>', methods=['DELETE'])
def delete_menu_item(item_id):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('DELETE FROM menu WHERE id=?', (item_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/sales', methods=['POST'])
def save_sale():
    data = request.json
    items = data.get('items', [])
    items_json = json.dumps(items)
    total = data.get('total', 0)
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('INSERT INTO sales (items_json, total) VALUES (?, ?)', (items_json, total))
    conn.commit()
    conn.close()
    
    # Save to Excel
    try:
        excel_path = os.path.join(WRITABLE_DIR, 'Sales_Report.xlsx')
        timestamp = datetime.now()
        date_str = timestamp.strftime('%Y-%m-%d')
        time_str = timestamp.strftime('%I:%M %p')
        day_str = timestamp.strftime('%A')
        
        rows = []
        for item in items:
            rows.append({
                'Food Name': item['name'],
                'Amount': item['price'] * item['qty'],
                'date_date_timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S')
            })
            
        df_new = pd.DataFrame(rows)
        
        if os.path.exists(excel_path):
            df_existing = pd.read_excel(excel_path)
            df_existing = df_existing.dropna(how='all')
            df_combined = pd.concat([df_existing, df_new], ignore_index=True)
            df_combined.to_excel(excel_path, index=False)
        else:
            df_new.to_excel(excel_path, index=False)
    except Exception as e:
        print(f"Excel save error: {e}")

    return jsonify({"status": "success"})

@app.route('/api/report/daily', methods=['GET'])
def get_daily_report():
    conn = get_db_connection()
    today = datetime.now().strftime('%Y-%m-%d')
    sales = conn.execute('SELECT * FROM sales WHERE date(timestamp) = ?', (today,)).fetchall()
    conn.close()
    
    return jsonify([{
        "id": s["id"],
        "items": json.loads(s["items_json"]),
        "total": s["total"],
        "timestamp": s["timestamp"]
    } for s in sales])

@app.route('/api/report/range', methods=['GET'])
def get_report_range():
    start = request.args.get('start')
    end = request.args.get('end')
    conn = get_db_connection()
    sales = conn.execute('SELECT * FROM sales WHERE date(timestamp) BETWEEN ? AND ?', (start, end)).fetchall()
    conn.close()
    return jsonify([{
        "id": s["id"],
        "items": json.loads(s["items_json"]),
        "total": s["total"],
        "timestamp": s["timestamp"]
    } for s in sales])

@app.route('/api/report/export', methods=['GET'])
def export_excel():
    start = request.args.get('start')
    end = request.args.get('end')
    conn = get_db_connection()
    sales = conn.execute('SELECT * FROM sales WHERE date(timestamp) BETWEEN ? AND ?', (start, end)).fetchall()
    conn.close()
    
    rows = []
    for s in sales:
        items = json.loads(s["items_json"])
        for it in items:
            rows.append({
                "Food Name": it["name"],
                "Amount": it["price"] * it["qty"],
                "date_date_timestamp": s["timestamp"]
            })
    
    df = pd.DataFrame(rows)
    
    # Use BytesIO to serve the file from memory without saving to server disk
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    filename = f"Report_{start}_to_{end}.xlsx"
    return send_file(
        output,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@app.route('/api/receipt/pdf', methods=['POST'])
def receipt_pdf():
    data = request.get_json() or {}
    items = data.get('items', [])
    total = data.get('total', 0)
    timestamp = data.get('timestamp', '')

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 20 * mm
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, y, "CAIRO CREAMERY")
    y -= 8 * mm
    c.setFont("Helvetica", 9)
    c.drawCentredString(width / 2, y, "No 37, Box Food Street, OMR Kazhipattur, near Sipcot IT park, Siruseri, Chennai, Tamil Nadu 603103")
    y -= 6 * mm
    if timestamp:
        c.drawCentredString(width / 2, y, str(timestamp))
        y -= 8 * mm
    c.line(15 * mm, y, width - 15 * mm, y)
    y -= 8 * mm

    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Item")
    c.drawString(120 * mm, y, "Qty")
    c.drawRightString(width - 20 * mm, y, "Price")
    y -= 6 * mm
    c.setFont("Helvetica", 10)

    for it in items:
        name = str(it.get('name', ''))
        qty = str(it.get('qty', ''))
        price = float(it.get('price', 0)) * float(it.get('qty', 0))
        c.drawString(20 * mm, y, name[:35])
        c.drawString(120 * mm, y, qty)
        c.drawRightString(width - 20 * mm, y, f"{price:.2f}")
        y -= 6 * mm
        if y < 25 * mm:
            c.showPage()
            y = height - 20 * mm
            c.setFont("Helvetica", 10)

    y -= 4 * mm
    c.line(15 * mm, y, width - 15 * mm, y)
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(width - 20 * mm, y, f"Grand Total: {float(total):.2f}")

    c.showPage()
    c.save()
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name="receipt.pdf",
        mimetype='application/pdf'
    )


@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_routes(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

def open_browser():
    webbrowser.open_new('http://localhost:5000/')

if __name__ == '__main__':
    Timer(1.5, open_browser).start()
    from waitress import serve
    print("Serving on http://0.0.0.0:5000")
    serve(app, host='0.0.0.0', port=5000)
