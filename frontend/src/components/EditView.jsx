import React from 'react';

const EditView = ({
  menu,
  categories,
  isNewCategory,
  setIsNewCategory,
  addForm,
  setAddForm,
  addNewItem,
  editItem,
  setEditItem,
  editForm,
  setEditForm,
  saveEdit,
  deleteItem,
  toggleOutOfStock
}) => {
  return (
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
                  <td data-label="Category">
                    {editItem === item.id ? <input className="search-box" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} /> : item.category}
                  </td>
                  <td data-label="Name">
                    {editItem === item.id ? <input className="search-box" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /> : item.name}
                  </td>
                  <td data-label="Price">
                    {editItem === item.id ? <input className="search-box" type="number" value={editForm.price} onChange={e => setEditForm({ ...editForm, price: e.target.value })} /> : `₹${item.price}`}
                  </td>
                  <td data-label="Availability">
                    {editItem === item.id ? (
                      <span style={{ color: editForm.out_of_stock ? '#EF4444' : '#10B981', fontWeight: 'bold' }}>{editForm.out_of_stock ? 'Out of Stock' : 'In Stock'}</span>
                    ) : (
                      <button className={`btn-secondary ${item.out_of_stock ? 'danger-outline' : ''}`} style={item.out_of_stock ? { borderColor: '#EF4444', color: '#EF4444' } : { borderColor: '#10B981', color: '#10B981' }} onClick={() => toggleOutOfStock(item)}>
                        {item.out_of_stock ? "Mark as In Stock" : "Mark Out of Stock"}
                      </button>
                    )}
                  </td>
                  <td data-label="Action">
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
  );
};

export default EditView;
