import React, { useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';

const BillingView = ({
  menu,
  cart,
  search,
  setSearch,
  selectedCategory,
  setSelectedCategory,
  categories,
  addToCart,
  updateQty,
  checkout,
  total
}) => {
  const filteredMenu = useMemo(() => {
    return menu.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || m.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [menu, search, selectedCategory]);

  return (
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
                <span className="item-name">{item.category} - {item.name}</span>
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
                  <span className="name">{item.category} - {item.name}</span>
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
  );
};

export default BillingView;
