import React, { useState, useEffect, Suspense, lazy } from 'react';
import axios from 'axios';
import './App.css';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Lazy loading the views
const BillingView = lazy(() => import('./components/BillingView'));
const ReportView = lazy(() => import('./components/ReportView'));
const EditView = lazy(() => import('./components/EditView'));

const getApiBase = () => {
  const envBase = import.meta.env.VITE_API_BASE;
  if (envBase && envBase.trim() !== '') {
    return envBase.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:5000/api`;
  }
  return `${window.location.origin}/api`;
};
const API_BASE = getApiBase();
console.log("Using API_BASE:", API_BASE);

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => {
    const result = reader.result || '';
    const base64 = result.toString().split(',')[1] || '';
    resolve(base64);
  };
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

function App() {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('billing');
  const [report, setReport] = useState([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', price: '', category: '' });
  const [addForm, setAddForm] = useState({ name: '', price: '', category: 'General' });
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [lastBill, setLastBill] = useState(null);

  // Group menu items by category
  const categories = [...new Set(menu.map(i => i.category))];

  useEffect(() => {
    const initFetch = async () => {
      console.log("Component mounted, fetching menu...");
      try {
        const res = await axios.get(`${API_BASE}/menu`);
        console.log("Menu fetched:", res.data);
        setMenu(res.data);
        if (res.data.length > 0) {
          const cats = [...new Set(res.data.map(i => i.category))];
          setAddForm(prev => ({ ...prev, category: cats[0] }));
        }
      } catch (err) {
        console.error("Initial fetch failed:", err);
        alert("Failed to connect to backend at " + API_BASE + ". Please ensure the server is running.");
      }
    };
    initFetch();
  }, []);

  const addToCart = (item) => {
    if (item.out_of_stock) return;
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        return { ...i, qty: Math.max(0, i.qty + delta) };
      }
      return i;
    }).filter(i => i.qty > 0));
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

  const checkout = async () => {
    if (cart.length === 0) return;
    try {
      await axios.post(`${API_BASE}/sales`, { items: cart, total });
      const currentBill = {
        items: [...cart],
        total,
        timestamp: new Date().toLocaleString()
      };
      setLastBill(currentBill);
      setCart([]);

      // Auto-print immediately after confirming order
      generateReceiptPdf(currentBill);

    } catch (e) {
      alert('Error saving sale');
    }
  };

  const generateReceiptPdf = async (bill) => {
    if (!bill) return;
    try {
      const res = await axios.post(`${API_BASE}/receipt/pdf`, {
        items: bill.items,
        total: bill.total,
        timestamp: bill.timestamp
      }, { responseType: 'blob' });
      const pdfBlob = new Blob([res.data], { type: 'application/pdf' });

      if (Capacitor.isNativePlatform()) {
        const base64 = await blobToBase64(pdfBlob);
        const safeStamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `receipt-${safeStamp}.pdf`;
        const saved = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents,
          recursive: true
        });
        await Share.share({
          title: 'Receipt',
          text: 'Receipt PDF',
          url: saved.uri
        });
      } else {
        const blobUrl = URL.createObjectURL(pdfBlob);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = blobUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          setTimeout(() => {
            iframe.focus();
            iframe.contentWindow.print();
          }, 100);
        };
      }
    } catch (e) {
      alert('Failed to generate PDF');
    }
  };

  const fetchReport = async () => {
    try {
      const res = await axios.get(`${API_BASE}/report/daily`);
      setReport(res.data);
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate(new Date().toISOString().split('T')[0]);
      setView('report');
    } catch (e) {
      alert("Failed to fetch daily report");
    }
  };

  const fetchRangeReport = async () => {
    try {
      const res = await axios.get(`${API_BASE}/report/range?start=${startDate}&end=${endDate}`);
      setReport(res.data);
    } catch (e) {
      alert("Failed to fetch report");
    }
  };

  const downloadExcel = () => {
    window.open(`${API_BASE}/report/export?start=${startDate}&end=${endDate}`);
  };

  const saveEdit = async (id, updatedItem) => {
    try {
      await axios.put(`${API_BASE}/menu/${id}`, updatedItem);
      const res = await axios.get(`${API_BASE}/menu`);
      setMenu(res.data);
      setEditItem(null);
    } catch (err) {
      alert("Failed to save changes: " + (err.response?.data?.error || err.message));
    }
  };

  const addNewItem = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/menu`, addForm);
      const res = await axios.get(`${API_BASE}/menu`);
      const newMenu = res.data;
      setMenu(newMenu);
      const cats = [...new Set(newMenu.map(i => i.category))];
      setAddForm({ name: '', price: '', category: cats[0] || 'General' });
      setIsNewCategory(false);
      alert("Item added successfully!");
    } catch (err) {
      alert("Failed to add item: " + (err.response?.data?.error || err.message));
    }
  };

  const deleteItem = async (id) => {
    if (window.confirm("Are you sure you want to delete this menu item?")) {
      try {
        await axios.delete(`${API_BASE}/menu/${id}`);
        const res = await axios.get(`${API_BASE}/menu`);
        setMenu(res.data);
        const cats = [...new Set(res.data.map(i => i.category))];
        if (!cats.includes(selectedCategory) && selectedCategory !== 'All') {
          setSelectedCategory('All');
        }
      } catch (err) {
        alert("Failed to delete item: " + (err.response?.data?.error || err.message));
      }
    }
  };

  const toggleOutOfStock = async (item) => {
    try {
      const updatedItem = { ...item, out_of_stock: item.out_of_stock ? 0 : 1 };
      await axios.put(`${API_BASE}/menu/${item.id}`, updatedItem);
      const res = await axios.get(`${API_BASE}/menu`);
      setMenu(res.data);
    } catch (err) {
      alert("Failed to update status: " + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="nav-brand">
          <img src="/logo.jpeg" alt="Logo" className="nav-logo no-print" onError={(e) => e.target.style.display = 'none'} />
          <h1>Cairo Creamery</h1>
        </div>
        <div className="nav-links">
          <button onClick={() => setView('billing')} className={view === 'billing' ? 'active' : ''}>Billing</button>
          <button onClick={fetchReport} className={view === 'report' ? 'active' : ''}>Daily Report</button>
          <button onClick={() => setView('edit')} className={view === 'edit' ? 'active' : ''}>Edit Menu</button>
        </div>
      </nav>

      <main className="main-content">
        <Suspense fallback={<div style={{ textAlign: 'center', padding: '2rem' }}>Loading view...</div>}>
          {view === 'billing' ? (
            <BillingView
              menu={menu}
              cart={cart}
              search={search}
              setSearch={setSearch}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              categories={categories}
              addToCart={addToCart}
              updateQty={updateQty}
              checkout={checkout}
              total={total}
            />
          ) : view === 'report' ? (
            <ReportView
              report={report}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              fetchRangeReport={fetchRangeReport}
              downloadExcel={downloadExcel}
            />
          ) : (
            <EditView
              menu={menu}
              categories={categories}
              isNewCategory={isNewCategory}
              setIsNewCategory={setIsNewCategory}
              addForm={addForm}
              setAddForm={setAddForm}
              addNewItem={addNewItem}
              editItem={editItem}
              setEditItem={setEditItem}
              editForm={editForm}
              setEditForm={setEditForm}
              saveEdit={saveEdit}
              deleteItem={deleteItem}
              toggleOutOfStock={toggleOutOfStock}
            />
          )}
        </Suspense>
      </main>

      {lastBill && (
        <div className="receipt-container print-only">
          <div className="receipt-header">
            <img src="/logo.jpeg" alt="Logo" className="receipt-logo" />
            <h2>CAIRO CREAMERY</h2>
            <p className="address">No 37, Box Food Street, OMR Kazhipattur, near Sipcot IT park, Siruseri, Chennai, Tamil Nadu 603103</p>
            <p className="timestamp">{lastBill.timestamp}</p>
          </div>
          <div className="receipt-divider"></div>
          <table className="receipt-table-bill">
            <thead>
              <tr>
                <th className="text-left">Item</th>
                <th>Qty</th>
                <th className="text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {lastBill.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="text-left">{item.category} - {item.name}</td>
                  <td>{item.qty}</td>
                  <td className="text-right">₹{(item.price * item.qty).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="receipt-divider"></div>
          <div className="receipt-total">
            <span>Grand Total:</span>
            <span>₹{lastBill.total.toFixed(2)}</span>
          </div>
          <div className="receipt-footer">
            <p>Thank You! Visit Again</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
