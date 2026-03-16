import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ShoppingCart, Printer, Clock, FileText, Plus, Minus, Trash2 } from 'lucide-react';

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
  const [showPrintModal, setShowPrintModal] = useState(false);
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
      setLastBill({
        items: [...cart],
        total,
        timestamp: new Date().toLocaleString()
      });
      setShowPrintModal(true);
      setCart([]);
    } catch (e) {
      alert('Error saving sale');
    }
  };

  const handlePrint = (doPrint) => {
    setShowPrintModal(false);
    if (doPrint) {
      generateReceiptPdf(lastBill);
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
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'receipt.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      }
    } catch (e) {
      alert('Failed to generate PDF');
    }
  };

  const fetchReport = async () => {
    const res = await axios.get(`${API_BASE}/report/daily`);
    setReport(res.data);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    setView('report');
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

  const filteredMenu = menu.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || m.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
        {view === 'billing' ? (
          <div className="billing-view">
            <div className="menu-section">
              <div className="menu-header">
                <h2>Menu Items</h2>
                <input
                  type="text"
                  placeholder="Search item..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="search-box"
                />
              </div>

              <div className="category-tabs no-print">
                <button
                  className={`tab-btn ${selectedCategory === 'All' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('All')}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    className={`tab-btn ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="menu-grid">
                {filteredMenu.map(item => (
                  <div key={item.id} className={`menu-card ${item.out_of_stock ? 'out-of-stock-card' : ''}`} onClick={() => addToCart(item)}>
                    {item.out_of_stock ? <div className="out-of-stock-text">OUT OF STOCK</div> : null}
                    <div className="card-content">
                      {selectedCategory === 'All' && <span className="item-category">{item.category}</span>}
                      <span className="item-name">{item.name}</span>
                      <span className="item-price">₹{item.price}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="cart-section printable">
              <h2>Current Order</h2>
              <div className="cart-items">
                {cart.length === 0 ? (
                  <div className="empty-cart">No items in cart</div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="cart-item">
                      <div className="item-details">
                        <span className="name">{item.name}</span>
                        <span className="price">₹{item.price * item.qty}</span>
                      </div>
                      <div className="qty-controls no-print">
                        <button onClick={() => updateQty(item.id, -1)}><Minus size={16} /></button>
                        <span>{item.qty}</span>
                        <button onClick={() => updateQty(item.id, 1)}><Plus size={16} /></button>
                      </div>
                      <div className="print-only">
                        Qty: {item.qty}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="cart-summary">
                <div className="total-row">
                  <span>Grand Total:</span>
                  <span>₹{total.toFixed(2)}</span>
                </div>
                <div className="action-buttons no-print">
                  <button className="btn-primary" onClick={checkout}>Confirm Order</button>
                </div>
              </div>
            </div>
          </div>
        ) : view === 'report' ? (
          <div className="report-view">
            <h2>Daily Sales Report</h2>
            <div className="report-summary">
              <div className="summary-card">
                <h3>Total Sales</h3>
                <p>₹{report.reduce((sum, s) => sum + s.total, 0).toFixed(2)}</p>
              </div>
              <div className="summary-card">
                <h3>Orders</h3>
                <p>{report.length}</p>
              </div>
              <div className="summary-card date-filter no-print">
                <h3>Filter Dates</h3>
                <div className="flex-row" style={{ gap: '10px', marginTop: '10px' }}>
                  <input type="date" className="search-box" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  <input type="date" className="search-box" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  <button className="btn-primary" onClick={fetchRangeReport}>Filter</button>
                </div>
              </div>
              <div className="flex-row no-print" style={{ gap: '10px' }}>
                <button className="btn-secondary" onClick={downloadExcel} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <FileText size={18} /> Download Excel
                </button>
                <button className="btn-primary" onClick={() => window.print()}>Print Report</button>
              </div>
            </div>

            <div className="table-container">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Invoice ID</th>
                    <th>Time</th>
                    <th>Items Details</th>
                    <th>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map(sale => (
                      <td>#{sale.invoice_no ?? sale.id}</td>
                      <td>#{sale.id}</td>
                      <td>{new Date(sale.timestamp).toLocaleTimeString()}</td>
                      <td>{sale.items.map(i => `${i.name} (x${i.qty})`).join(', ')}</td>
                      <td>₹{sale.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  {report.length === 0 && (
                    <tr><td colSpan="4" className="text-center">No sales yet today.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="edit-view">
            <h2>Edit Menu Items</h2>
            <div className="add-item-form">
              <h3>Add New Item</h3>
              <form onSubmit={addNewItem} className="form-group flex-row">
                <select
                  value={isNewCategory ? '__NEW__' : addForm.category}
                  onChange={e => {
                    if (e.target.value === '__NEW__') {
                      setIsNewCategory(true);
                      setAddForm({ ...addForm, category: '' });
                    } else {
                      setIsNewCategory(false);
                      setAddForm({ ...addForm, category: e.target.value });
                    }
                  }}
                  className="search-box"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  {categories.length === 0 && <option value="General">General</option>}
                  <option value="__NEW__">+ Add New Section</option>
                </select>
                {isNewCategory && (
                  <input type="text" placeholder="New Category Name" value={addForm.category} onChange={e => setAddForm({ ...addForm, category: e.target.value })} required className="search-box" />
                )}
                <input type="text" placeholder="Item Name" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} required className="search-box" />
                <input type="number" placeholder="Price" value={addForm.price} onChange={e => setAddForm({ ...addForm, price: e.target.value })} required className="search-box" />
                <button type="submit" className="btn-primary">Add Item</button>
              </form>
            </div>

            <div className="edit-items-list">
              <h3>Existing Items</h3>
              <div className="table-container">
                <table className="report-table">
                  <thead><tr><th>Category</th><th>Name</th><th>Price</th><th>Availability</th><th>Action</th></tr></thead>
                  <tbody>
                    {menu.map(item => (
                      <tr key={item.id}>
                        <td>
                          {editItem === item.id ? <input className="search-box" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} /> : item.category}
                        </td>
                        <td>
                          {editItem === item.id ? <input className="search-box" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /> : item.name}
                        </td>
                        <td>
                          {editItem === item.id ? <input className="search-box" type="number" value={editForm.price} onChange={e => setEditForm({ ...editForm, price: e.target.value })} /> : `₹${item.price}`}
                        </td>
                        <td>
                          {editItem === item.id ? (
                            <span style={{ color: editForm.out_of_stock ? '#EF4444' : '#10B981', fontWeight: 'bold' }}>{editForm.out_of_stock ? 'Out of Stock' : 'In Stock'}</span>
                          ) : (
                            <button className={`btn-secondary ${item.out_of_stock ? 'danger-outline' : ''}`} style={item.out_of_stock ? { borderColor: '#EF4444', color: '#EF4444' } : { borderColor: '#10B981', color: '#10B981' }} onClick={() => toggleOutOfStock(item)}>
                              {item.out_of_stock ? "Mark as In Stock" : "Mark Out of Stock"}
                            </button>
                          )}
                        </td>
                        <td>
                          {editItem === item.id ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button className="btn-primary" onClick={() => saveEdit(item.id, editForm)}>Save</button>
                              <button className="btn-secondary" onClick={() => setEditItem(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button className="btn-secondary" onClick={() => { setEditItem(item.id); setEditForm({ ...item }); }}>Edit</button>
                              <button className="btn-secondary" style={{ borderColor: '#EF4444', color: '#EF4444' }} onClick={() => deleteItem(item.id)}>Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {showPrintModal && (
        <div className="modal-overlay no-print">
          <div className="modal-content text-center">
            <h3>Order Confirmed!</h3>
            <p>Would you like to print the bill?</p>
            <div className="flex-row" style={{ marginTop: '20px' }}>
              <button className="btn-primary" onClick={() => handlePrint(true)}>Yes, Print</button>
              <button className="btn-secondary" onClick={() => handlePrint(false)}>No, Thanks</button>
            </div>
          </div>
        </div>
      )}

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
                  <td className="text-left">{item.name}</td>
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
