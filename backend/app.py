import sys
import os
from flask import Flask, request, jsonify, send_from_directory, send_file
from werkzeug.exceptions import HTTPException
from flask_cors import CORS
import json
import math
import pandas as pd
import traceback
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None
import webbrowser
from threading import Timer
import io
from urllib.request import urlopen
from pymongo import MongoClient, ASCENDING, ReturnDocument
from bson import ObjectId
from bson.errors import InvalidId
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader


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
    if isinstance(e, HTTPException):
        return e
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
MENU_PATH = os.path.join(app_data_dir, 'menu.json') if getattr(sys, 'frozen', False) else os.path.abspath(os.path.join(base_dir, '../menu.json'))

MONGODB_URI = os.environ.get('MONGODB_URI')
MONGODB_DB = os.environ.get('MONGODB_DB', '').strip()

def get_mongo_db():
    if not MONGODB_URI:
        raise RuntimeError('MONGODB_URI is not set. Configure it in the environment.')
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    if MONGODB_DB:
        return client[MONGODB_DB]
    try:
        default_db = client.get_default_database()
        if default_db is not None:
            return default_db
    except Exception:
        pass
    return client['CAIRO_CREAMERY']

mongo_db = get_mongo_db()
menu_col = mongo_db['menu']
sales_col = mongo_db['sales']
counters_col = mongo_db['counters']

def init_db():
    menu_col.create_index([('category', ASCENDING), ('name', ASCENDING)])
    sales_col.create_index([('timestamp', ASCENDING)])
    counters_col.create_index([('name', ASCENDING)], unique=True)
    
    # Init menu if empty
    if menu_col.estimated_document_count() == 0:
        if os.path.exists(MENU_PATH):
            with open(MENU_PATH, 'r', encoding='utf-8') as f:
                raw_menu = json.load(f)
                category = "General"
                docs = []
                for row in raw_menu:
                    col0 = row.get('Menu Price List')
                    col1 = row.get('Unnamed: 1')
                    col2 = row.get('Unnamed: 2')
                    
                    if isinstance(col0, str) and (col1 is None or (isinstance(col1, float) and math.isnan(col1))):
                        category = col0.strip(' .0123456789')
                    elif isinstance(col1, str) and (isinstance(col2, (int, float)) and not math.isnan(col2)):
                        docs.append({
                            "category": category,
                            "name": col1,
                            "price": float(col2),
                            "out_of_stock": 0
                        })
                if docs:
                    menu_col.insert_many(docs)
        else:
            # Insert some defaults if menu.json not found
            menu_col.insert_many([
                {"category": "Default", "name": "Coffee", "price": 100, "out_of_stock": 0},
                {"category": "Default", "name": "Tea", "price": 50, "out_of_stock": 0},
            ])

init_db()

def serialize_menu_item(doc):
    return {
        "id": str(doc.get("_id")),
        "category": doc.get("category"),
        "name": doc.get("name"),
        "price": doc.get("price", 0),
        "out_of_stock": doc.get("out_of_stock", 0),
    }

def serialize_sale(doc):
    ts = doc.get("timestamp")
    return {
        "id": str(doc.get("_id")),
        "invoice_no": doc.get("invoice_no"),
        "items": doc.get("items", []),
        "total": doc.get("total", 0),
        "timestamp": ts.isoformat() if isinstance(ts, datetime) else ts,
    }

def get_ist_tz():
    if ZoneInfo is not None:
        try:
            return ZoneInfo("Asia/Kolkata")
        except Exception:
            pass
    return timezone(timedelta(hours=5, minutes=30))

IST_TZ = get_ist_tz()

def now_ist():
    return datetime.now(timezone.utc).astimezone(IST_TZ)

def to_ist(dt):
    if not isinstance(dt, datetime):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST_TZ)

def parse_date_param(date_str):
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except Exception:
        return None

def ist_range_to_utc(start_date, end_date_exclusive):
    start_ist = datetime.combine(start_date, datetime.min.time(), tzinfo=IST_TZ)
    end_ist = datetime.combine(end_date_exclusive, datetime.min.time(), tzinfo=IST_TZ)
    return start_ist.astimezone(timezone.utc), end_ist.astimezone(timezone.utc)

def get_next_invoice_no():
    doc = counters_col.find_one_and_update(
        {"name": "invoice_no"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )
    return int(doc.get("value", 1))

@app.route('/api/menu', methods=['GET'])
def get_menu():
    items = list(menu_col.find().sort([('category', ASCENDING), ('name', ASCENDING)]))
    return jsonify([serialize_menu_item(item) for item in items])

@app.route('/api/menu', methods=['POST'])
def add_menu_item():
    data = request.get_json()
    category = data.get('category', 'General')
    name = data.get('name')
    try:
        price = float(data.get('price', 0))
    except (ValueError, TypeError):
        price = 0.0
    
    result = menu_col.insert_one({
        "category": category,
        "name": name,
        "price": price,
        "out_of_stock": 0
    })
    return jsonify({"status": "success", "id": str(result.inserted_id)})

@app.route('/api/menu/<item_id>', methods=['PUT'])
def update_menu_item(item_id):
    data = request.get_json()
    category = data.get('category')
    name = data.get('name')
    try:
        price = float(data.get('price', 0))
    except (ValueError, TypeError):
        price = 0.0
    out_of_stock = data.get('out_of_stock', 0)

    try:
        oid = ObjectId(item_id)
    except InvalidId:
        return jsonify({"error": "Invalid item id"}), 400

    menu_col.update_one(
        {"_id": oid},
        {"$set": {"category": category, "name": name, "price": price, "out_of_stock": out_of_stock}}
    )
    return jsonify({"status": "success"})

@app.route('/api/menu/<item_id>', methods=['DELETE'])
def delete_menu_item(item_id):
    try:
        oid = ObjectId(item_id)
    except InvalidId:
        return jsonify({"error": "Invalid item id"}), 400

    menu_col.delete_one({"_id": oid})
    return jsonify({"status": "success"})

@app.route('/api/sales', methods=['POST'])
def save_sale():
    data = request.json
    items = data.get('items', [])
    total = data.get('total', 0)

    invoice_no = get_next_invoice_no()

    sales_col.insert_one({
        "invoice_no": invoice_no,
        "items": items,
        "total": total,
        "timestamp": datetime.now(timezone.utc)
    })
    
    # Save to Excel
    try:
        excel_path = os.path.join(WRITABLE_DIR, 'Sales_Report.xlsx')
        timestamp = now_ist()
        rows = []
        for it in items:
            qty = float(it.get('qty', 0) or 0)
            price = float(it.get('price', 0) or 0)
            rows.append({
                "Invoice No": invoice_no,
                "Time": timestamp.strftime('%Y-%m-%d %I:%M:%S %p'),
                "Item Name": it.get('name', ''),
                "Qty": qty,
                "Price": price,
                "Line Total": price * qty
            })
        # Add total row at the bottom of this invoice
        total_qty = sum([float(it.get('qty', 0) or 0) for it in items])
        rows.append({
            "Invoice No": invoice_no,
            "Time": timestamp.strftime('%Y-%m-%d %I:%M:%S %p'),
            "Item Name": "TOTAL",
            "Qty": total_qty,
            "Price": "",
            "Line Total": float(total)
        })
        # Empty line after each invoice block
        rows.append({
            "Invoice No": "",
            "Time": "",
            "Item Name": "",
            "Qty": "",
            "Price": "",
            "Line Total": ""
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
    ist_now = now_ist()
    start_date = ist_now.date()
    end_date = start_date + timedelta(days=1)
    start_utc, end_utc = ist_range_to_utc(start_date, end_date)
    sales = list(sales_col.find({"timestamp": {"$gte": start_utc, "$lt": end_utc}}))
    return jsonify([serialize_sale(s) for s in sales])

@app.route('/api/report/range', methods=['GET'])
def get_report_range():
    start = request.args.get('start')
    end = request.args.get('end')
    start_date = parse_date_param(start)
    end_date = parse_date_param(end)
    if not start_date or not end_date:
        return jsonify({"error": "Invalid date range"}), 400

    end_date = end_date + timedelta(days=1)
    start_utc, end_utc = ist_range_to_utc(start_date, end_date)
    sales = list(sales_col.find({"timestamp": {"$gte": start_utc, "$lt": end_utc}}))
    return jsonify([serialize_sale(s) for s in sales])

@app.route('/api/report/export', methods=['GET'])
def export_excel():
    start = request.args.get('start')
    end = request.args.get('end')
    start_date = parse_date_param(start)
    end_date = parse_date_param(end)
    if not start_date or not end_date:
        return jsonify({"error": "Invalid date range"}), 400

    end_date = end_date + timedelta(days=1)
    start_utc, end_utc = ist_range_to_utc(start_date, end_date)
    sales = list(sales_col.find({"timestamp": {"$gte": start_utc, "$lt": end_utc}}).sort("timestamp", ASCENDING))

    rows = []
    for s in sales:
        items = s.get("items", [])
        ts = to_ist(s.get("timestamp"))
        time_str = ts.strftime('%Y-%m-%d %I:%M:%S %p') if isinstance(ts, datetime) else str(ts)
        for it in items:
            qty = float(it.get('qty', 0) or 0)
            price = float(it.get('price', 0) or 0)
            rows.append({
                "Invoice No": s.get("invoice_no"),
                "Time": time_str,
                "Item Name": it.get('name', ''),
                "Qty": qty,
                "Price": price,
                "Line Total": price * qty
            })
        # Total row at the bottom of each invoice
        total_qty = sum([float(it.get('qty', 0) or 0) for it in items])
        rows.append({
            "Invoice No": s.get("invoice_no"),
            "Time": time_str,
            "Item Name": "TOTAL",
            "Qty": total_qty,
            "Price": "",
            "Line Total": float(s.get("total", 0))
        })
        # Empty line after each invoice block
        rows.append({
            "Invoice No": "",
            "Time": "",
            "Item Name": "",
            "Qty": "",
            "Price": "",
            "Line Total": ""
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
    receipt_width = 58 * mm
    min_height = 120 * mm
    line_height = 5 * mm

    # Calculate extra lines needed for wrapping
    extra_lines = 0
    max_chars_per_line = 18
    for it in items:
        name = f"{it.get('category', '')} - {it.get('name', '')}" if it.get('category') else str(it.get('name', ''))
        if len(name) > max_chars_per_line:
            extra_lines += 1

    dynamic_height = 70 * mm + ((len(items) + extra_lines) * line_height) + 20 * mm
    receipt_height = max(min_height, dynamic_height)

    c = canvas.Canvas(buffer, pagesize=(receipt_width, receipt_height))
    width, height = receipt_width, receipt_height

    def draw_dashed_line(y_pos):
        c.setDash(2, 2)
        c.line(4 * mm, y_pos, width - 4 * mm, y_pos)
        c.setDash()

    y = height - 8 * mm

    # Logo (optional)
    logo_paths = [
        os.path.join(app_data_dir, 'logo.jpeg'),
        os.path.abspath(os.path.join(base_dir, '../logo.jpeg')),
        os.path.abspath(os.path.join(base_dir, '../frontend/public/logo.jpeg')),
    ]
    logo_path = next((p for p in logo_paths if os.path.exists(p)), None)
    logo_drawn = False
    if logo_path:
        try:
            logo = ImageReader(logo_path)
            c.drawImage(
                logo,
                (width - 12 * mm) / 2,
                y - 12 * mm,
                12 * mm,
                12 * mm,
                preserveAspectRatio=True,
                mask='auto'
            )
            y -= 15 * mm
            logo_drawn = True
        except Exception:
            pass

    if not logo_drawn:
        logo_urls = []
        if request.host_url:
            logo_urls.append(request.host_url.rstrip('/') + '/logo.jpeg')
        env_frontend = os.environ.get('FRONTEND_BASE_URL') or os.environ.get('VITE_FRONTEND_URL')
        if env_frontend:
            logo_urls.append(env_frontend.rstrip('/') + '/logo.jpeg')

        for url in logo_urls:
            try:
                with urlopen(url, timeout=3) as resp:
                    data = resp.read()
                logo = ImageReader(io.BytesIO(data))
                c.drawImage(
                    logo,
                    (width - 12 * mm) / 2,
                    y - 12 * mm,
                    12 * mm,
                    12 * mm,
                    preserveAspectRatio=True,
                    mask='auto'
                )
                y -= 15 * mm
                logo_drawn = True
                break
            except Exception:
                continue

    y -= 0.03 * height
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(width / 2, y, "CAIRO CREAMERY")
    y -= 6 * mm
    c.setFont("Helvetica", 7)
    c.drawCentredString(width / 2, y, "No 37, Box Food Street, OMR")
    y -= 3.5 * mm
    c.drawCentredString(width / 2, y, "Kazhipattur, near Sipcot IT park,")
    y -= 3.5 * mm
    c.drawCentredString(width / 2, y, "Siruseri, Chennai, Tamil Nadu")
    y -= 3.5 * mm
    c.drawCentredString(width / 2, y, "603103")
    y -= 4 * mm
    if timestamp:
        c.drawCentredString(width / 2, y, str(timestamp))
        y -= 4.5 * mm

    draw_dashed_line(y)
    y -= 5 * mm

    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(4 * mm, y, "Item")
    c.drawRightString(width - 22 * mm, y, "Qty")
    c.drawRightString(width - 4 * mm, y, "Price")
    y -= 4 * mm

    c.setFont("Helvetica", 7.5)
    for it in items:
        # Construct item name with Category - Name format
        full_name = f"{it.get('category', '')} - {it.get('name', '')}" if it.get('category') else str(it.get('name', ''))
        qty = str(it.get('qty', ''))
        price = float(it.get('price', 0)) * float(it.get('qty', 0))

        if len(full_name) > max_chars_per_line:
            # Try to wrap smartly by finding a hyphen or space
            split_idx = max_chars_per_line
            for i in range(max_chars_per_line, 0, -1):
                if full_name[i] in ['-', ' ']:
                    split_idx = i + 1
                    break

            line1 = full_name[:split_idx].strip()
            line2 = full_name[split_idx:split_idx+max_chars_per_line].strip() # wrap to max 2 lines

            # If line1 doesn't end with hyphen and we break middle of word, add hyphen
            if split_idx == max_chars_per_line and not line1.endswith('-'):
                 line1 = line1[:-1] + '-'
                 line2 = full_name[split_idx-1:split_idx-1+max_chars_per_line].strip()

            c.drawString(4 * mm, y, line1)
            c.drawRightString(width - 22 * mm, y, qty)
            c.drawRightString(width - 4 * mm, y, f"Rs. {price:.2f}")
            y -= line_height
            c.drawString(4 * mm, y, "  " + line2)
            y -= line_height
        else:
            c.drawString(4 * mm, y, full_name)
            c.drawRightString(width - 22 * mm, y, qty)
            c.drawRightString(width - 4 * mm, y, f"Rs. {price:.2f}")
            y -= line_height

    y -= 1.5 * mm
    draw_dashed_line(y)
    y -= 5 * mm

    c.setFont("Helvetica-Bold", 8)
    c.drawString(4 * mm, y, "Grand Total:")
    c.drawRightString(width - 4 * mm, y, f"Rs. {float(total):.2f}")
    y -= 6 * mm

    c.setFont("Helvetica-Oblique", 7)
    c.drawCentredString(width / 2, y, "Thank You! Visit Again")

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
