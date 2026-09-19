import React, { useState } from 'react';
import '../styles/mis/MisEquipmentManagement.scss';

const EquipmentManagement = () => {
  // Initial local state for equipment inventory
  const [equipmentData, setEquipmentData] = useState([
    { id: 1, name: 'Projector (4K)', sku: 'SKU: AV-001', icon: '🖥️', category: 'AV Equipment', quantity: 12, availableCount: 8, totalCount: 12, status: 'Available', statusClass: 'status-available', lastUpdated: 'Nov 12, 2023' },
    { id: 2, name: 'Laptop (Dell XPS)', sku: 'SKU: CP-014', icon: '💻', category: 'Computing', quantity: 30, availableCount: 0, totalCount: 30, status: 'In Use', statusClass: 'status-in-use', lastUpdated: 'Nov 10, 2023' },
    { id: 3, name: 'PA Sound System', sku: 'SKU: AU-007', icon: '🔊', category: 'Audio', quantity: 6, availableCount: 0, totalCount: 6, status: 'Maintenance', statusClass: 'status-maintenance', lastUpdated: 'Nov 8, 2023' },
    { id: 4, name: 'DSLR Camera Kit', sku: 'SKU: IM-003', icon: '📷', category: 'Imaging', quantity: 8, availableCount: 5, totalCount: 8, status: 'Available', statusClass: 'status-available', lastUpdated: 'Nov 11, 2023' },
    { id: 5, name: 'Whiteboard (Mobile)', sku: 'SKU: FU-019', icon: '📋', category: 'Furniture', quantity: 15, availableCount: 3, totalCount: 15, status: 'In Use', statusClass: 'status-in-use', lastUpdated: 'Nov 13, 2023' },
    { id: 6, name: 'Laser Printer (A3)', sku: 'SKU: OF-022', icon: '🖨️', category: 'Office', quantity: 4, availableCount: 0, totalCount: 4, status: 'Maintenance', statusClass: 'status-maintenance', lastUpdated: 'Nov 7, 2023' },
    { id: 7, name: 'Video Conference Kit', sku: 'SKU: VC-009', icon: '📹', category: 'AV Equipment', quantity: 10, availableCount: 6, totalCount: 10, status: 'Available', statusClass: 'status-available', lastUpdated: 'Nov 14, 2023' }
  ]);

  // Modal State for Editing
  const [editingItem, setEditingItem] = useState(null);

  // Modal state + form fields for adding new equipment
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    sku: '',
    category: '',
    totalCount: '',
    status: 'Available'
  });

  const handleAddClick = () => {
    setNewItem({ name: '', sku: '', category: '', totalCount: '', status: 'Available' });
    setIsAddingNew(true);
  };

  // Helper to open edit modal
  const handleEditClick = (item) => {
    setEditingItem({ ...item });
  };

  // Helper to decrease available units directly from table
  const handleDecreaseAvailable = (id) => {
    setEquipmentData((prevData) =>
      prevData.map((item) => {
        if (item.id === id && item.availableCount > 0) {
          const newAvailable = item.availableCount - 1;
          const newStatus = newAvailable === 0 ? 'In Use' : item.status;
          const newStatusClass = newAvailable === 0 ? 'status-in-use' : item.statusClass;

          return {
            ...item,
            availableCount: newAvailable,
            status: newStatus,
            statusClass: newStatusClass,
            lastUpdated: 'Just now'
          };
        }
        return item;
      })
    );
  };

  // Save changes from Edit Modal
  const handleSaveEdit = (e) => {
    e.preventDefault();

    let updatedClass = 'status-available';
    if (editingItem.status === 'In Use') updatedClass = 'status-in-use';
    if (editingItem.status === 'Maintenance') updatedClass = 'status-maintenance';
    if (editingItem.status === 'Unavailable') updatedClass = 'status-unavailable';

    setEquipmentData((prevData) =>
      prevData.map((item) =>
        item.id === editingItem.id
          ? {
              ...editingItem,
              availableCount: Number(editingItem.availableCount),
              totalCount: Number(editingItem.totalCount),
              statusClass: updatedClass,
              lastUpdated: 'Just now'
            }
          : item
      )
    );

    setEditingItem(null); // Close modal
  };

  // Save a brand new equipment item
  const handleSaveNewEquipment = (e) => {
    e.preventDefault();

    let statusClass = 'status-available';
    if (newItem.status === 'In Use') statusClass = 'status-in-use';
    if (newItem.status === 'Maintenance') statusClass = 'status-maintenance';
    if (newItem.status === 'Unavailable') statusClass = 'status-unavailable';

    const total = Number(newItem.totalCount) || 0;
    // A brand new item starts fully available, unless it's already In Use/Maintenance
    const available = (newItem.status === 'Available') ? total : 0;

    const nextId = equipmentData.length > 0
      ? Math.max(...equipmentData.map((item) => item.id)) + 1
      : 1;

    const itemToAdd = {
      id: nextId,
      name: newItem.name.trim() || 'Untitled Equipment',
      sku: newItem.sku.trim() || `SKU: NEW-${nextId}`,
      category: newItem.category.trim() || 'Uncategorized',
      quantity: total,
      availableCount: available,
      totalCount: total,
      status: newItem.status,
      statusClass,
      lastUpdated: 'Just now'
    };

    setEquipmentData((prevData) => [...prevData, itemToAdd]);
    setIsAddingNew(false);
  };

  // Dynamic summary metrics calculation
  const totalAvailableUnits = equipmentData.reduce((acc, curr) => acc + curr.availableCount, 0);
  const totalInUseUnits = equipmentData.reduce((acc, curr) => acc + (curr.totalCount - curr.availableCount), 0);

  return (
    <div className="equipment-management-content">
      {/* Top Metric Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Available</span>
            <span className="count">{totalAvailableUnits}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="label">In Use</span>
            <span className="count">{totalInUseUnits}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Maintenance</span>
            <span className="count">10</span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="table-container">
        <div className="table-controls">
          <div className="controls-left">
            <h2>Equipment Inventory</h2>
            <p>{equipmentData.length} total items listed across all categories</p>
          </div>

          <div className="controls-right">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input type="text" placeholder="Search equipment..." />
            </div>
            <button className="btn-secondary">⚙ Filter</button>
            <button className="btn-secondary">📥 Export</button>
            <button className="btn-primary" onClick={handleAddClick}>+ Add Equipment</button>
          </div>
        </div>

        {/* Equipment Table */}
        <table className="equipment-table">
          <thead>
            <tr>
              <th className="checkbox-col"><input type="checkbox" /></th>
              <th>EQUIPMENT NAME</th>
              <th>CATEGORY</th>
              <th>QUANTITY</th>
              <th>AVAILABLE</th>
              <th>STATUS</th>
              <th>LAST UPDATED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {equipmentData.map((item) => (
              <tr key={item.id}>
                <td className="checkbox-col"><input type="checkbox" /></td>
                <td>
                  <div className="item-name-cell">
                    <div>
                      <div className="item-title">{item.name}</div>
                      <div className="item-sku">{item.sku}</div>
                    </div>
                  </div>
                </td>
                <td><span className="category-tag">{item.category}</span></td>
                <td className="font-semibold">{item.quantity} units</td>
                <td className="font-semibold">{item.availableCount} / {item.totalCount}</td>
                <td>
                  <span className={`status-badge ${item.statusClass}`}>{item.status}</span>
                </td>
                <td className="text-muted">{item.lastUpdated}</td>
                <td>
                  <div className="action-buttons">
                    <button className="action-btn" onClick={() => handleEditClick(item)}>
                      ✏ Edit
                    </button>
                    <button
                      className="action-btn borrow-btn"
                      onClick={() => handleDecreaseAvailable(item.id)}
                      disabled={item.availableCount === 0}
                    >
                      ➖ Use
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Table Footer */}
        <div className="table-pagination">
          <span className="pagination-text">Showing 1 to {equipmentData.length} of 160 equipment items</span>
          <div className="pagination-buttons">
            <button className="page-btn" disabled>Prev</button>
            <button className="page-btn active">1</button>
            <button className="page-btn">2</button>
            <button className="page-btn">3</button>
            <span className="dots">...</span>
            <button className="page-btn">23</button>
            <button className="page-btn">Next</button>
          </div>
        </div>
      </div>

      {/* Local Edit Modal Popup */}
      {editingItem && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Edit {editingItem.name}</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Status</label>
                <select
                  value={editingItem.status}
                  onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
                >
                  <option value="Available">Available</option>
                  <option value="In Use">In Use</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>

              <div className="form-group">
                <label>Available Units</label>
                <input
                  type="number"
                  value={editingItem.availableCount}
                  onChange={(e) => setEditingItem({ ...editingItem, availableCount: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Total Units</label>
                <input
                  type="number"
                  value={editingItem.totalCount}
                  onChange={(e) => setEditingItem({ ...editingItem, totalCount: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setEditingItem(null)}>Cancel</button>
                <button type="submit" className="btn-save">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Equipment Modal */}
      {isAddingNew && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add Equipment</h3>
            <form onSubmit={handleSaveNewEquipment}>
              <div className="form-group">
                <label>Equipment Name</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="e.g. Ring Light Kit"
                  required
                />
              </div>

              <div className="form-group">
                <label>SKU</label>
                <input
                  type="text"
                  value={newItem.sku}
                  onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                  placeholder="e.g. SKU: AV-020"
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <input
                  type="text"
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  placeholder="e.g. AV Equipment"
                  required
                />
              </div>

              <div className="form-group">
                <label>Total Units</label>
                <input
                  type="number"
                  min="0"
                  value={newItem.totalCount}
                  onChange={(e) => setNewItem({ ...newItem, totalCount: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={newItem.status}
                  onChange={(e) => setNewItem({ ...newItem, status: e.target.value })}
                >
                  <option value="Available">Available</option>
                  <option value="In Use">In Use</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setIsAddingNew(false)}>Cancel</button>
                <button type="submit" className="btn-save">Add Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// This exact line is required for React.lazy() to work
export default EquipmentManagement;