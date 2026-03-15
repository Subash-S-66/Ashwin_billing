# Cairo Creamery Billing System

A complete billing and inventory management system for Cairo Creamery, featuring a React frontend and a Flask backend.

## Prerequisites

Before moving to the new system, ensure you have the following installed:
- **Python**: Version 3.10 or higher.
- **Node.js**: Version 18 or higher (for frontend development/building).
- **Git**: (Optional) For version control.

## Installation & Setup

### 1. Backend Setup

The backend handles the API, database (SQLite), and Excel report generation.

1. Open a terminal in the project root:
   ```bash
   cd backend
   ```
2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```
3. Activate the virtual environment:
   - **Windows**: `.\venv\Scripts\activate`
   - **Mac/Linux**: `source venv/bin/activate`
4. Install dependencies:
   ```bash
   pip install -r ../requirements.txt
   ```

### 2. Frontend Setup

The frontend is built with React and Vite.

1. Open a terminal in the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the frontend for production:
   ```bash
   npm run build
   ```
   *This creates a `dist` folder which the backend will serve.*

---

## Running the Application

### Production Mode (Recommended)
This runs the backend server, which also serves the frontend on the same port (`5000`).

1. Ensure the frontend is built (Step 2.3 above).
2. Start the backend:
   ```bash
   cd backend
   .\venv\Scripts\python.exe app.py
   ```
3. Open your browser and go to: `http://localhost:5000`

### Development Mode
If you want to make changes to the code:

1. **Start Backend**: Run `python app.py` in the `backend` folder.
2. **Start Frontend**: Run `npm run dev` in the `frontend` folder.
3. Access the dev site at: `http://localhost:5173`

---

## Key Files & Folders

- **`backend/app.py`**: The main Flask server.
- **`backend/billing.db`**: SQLite database storing sales records.
- **`backend/Sales_Report.xlsx`**: Excel file updated automatically after every order.
- **`menu.json`**: Current menu data (initialized from `Menu_Price_List.xlsx`).
- **`logo.jpeg`**: Company logo used in the app and on printed receipts.

## Troubleshooting

- **Image not showing**: Ensure `logo.jpeg` is present in the root and also in `frontend/public/`.
- **Port Conflict**: If port `5000` is in use, you can change it at the bottom of `backend/app.py`.
- **Database Error**: If `billing.db` is locked, ensure no other process (like a DB browser) is using it.
