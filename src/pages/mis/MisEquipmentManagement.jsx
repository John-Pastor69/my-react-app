import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, addDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../Firebase';
import "../../styles/mis/MisEquipmentManagement.scss";

// Helper function to get real-time date and time
const getCurrentDateTime = () => {
  return new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const [currentUser, setCurrentUser] = useState(null);

// Add this completely new auth listener below your state variables:
useEffect(() => {
  const unsubscribeAuth = auth.onAuthStateChanged((user) => setCurrentUser(user));
  return () => unsubscribeAuth();
}, []);

const MisEquipmentManagement = ({ currentUserRole }) => {
  // --- FIRESTORE STATES ---
  const [equipmentData, setEquipmentData] = useState([]);
  const [reservationsData, setReservationsData] = useState([]);

  // --- SEARCH STATE ---
  const [searchQuery, setSearchQuery] = useState('');

  // --- MODAL STATES ---
  const [editingItem, setEditingItem] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    sku: '',
    quantity: '',
    status: 'Available'
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // --- LIVE LISTEN TO FIRESTORE COLLECTIONS ---
  useEffect(() => {
    if (!currentUser) return; // Added safeguard

    // 1. Listen to Equipments
    const unsubEquipments = onSnapshot(collection(db, 'equipments'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEquipmentData(list);
      setSelectedIds((prev) => prev.filter((id) => list.some((item) => item.id === id)));
    }, (error) => console.error('Failed to load equipment:', error));

    // 2. Listen to Reservations for real-time dynamic reserved counts
    const unsubReservations = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReservationsData(list);
    }, (error) => console.error('Failed to load reservations:', error));

    return () => {
      unsubEquipments();
      unsubReservations();
    };
  }, [currentUser]);

  // --- DYNAMICALLY CALCULATE RESERVED AND AVAILABLE COUNTS ---
  const mappedEquipmentData = equipmentData.map(item => {
    let reservedCount = 0;
    
    // Sum all active reservations for this specific equipment ID
    reservationsData.forEach(res => {
      const statusLower = (res.status || '').toLowerCase().trim();
      if (statusLower !== 'rejected' && statusLower !== 'cancelled') {
        if (res.selectedEquip && res.selectedEquip[item.id]) {
          reservedCount += Number(res.selectedEquip[item.id]);
        }
      }
    });

    const total = Number(item.totalCount) || 0;
    let availableCount = Math.max(0, total - reservedCount);

    // If status is manually set to Unavailable, treat available count as 0 for metrics and summary
    if (item.status === 'Unavailable') {
      availableCount = 0;
    }

    const effectiveStatus = availableCount === 0 ? 'Unavailable' : (item.status || 'Available');
    const effectiveStatusClass = effectiveStatus === 'Unavailable' ? 'status-unavailable' : 'status-available';

    return {
      ...item,
      status: effectiveStatus,
      statusClass: effectiveStatusClass,
      computedReserved: reservedCount,
      computedAvailable: availableCount
    };
  });

  // --- ACTION HANDLERS ---
  const handleAddClick = () => {
    setNewItem({ name: '', sku: '', quantity: '', status: 'Available' });
    setIsAddingNew(true);
  };

  const toggleSelectAll = (e) => {
    setSelectedIds(e.target.checked ? filteredData.map((item) => item.id) : []);
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setIsConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => batch.delete(doc(db, 'equipments', id)));
      await batch.commit();
      
      setSelectedIds([]);
      setIsConfirmingDelete(false);
      
    } catch (error) {
      console.error('Failed to delete equipment:', error);
    }
  };

  const handleEditClick = (item) => {
    setEditingItem({ 
      ...item, 
      adjustment: 0 
    });
  };

  // Save changes to Firestore
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    
    // The adjustment applies to the BASE inventory (totalCount)
    const adjTotal = parseInt(editingItem.adjustment, 10) || 0;
    const newTotal = Math.max(0, (Number(editingItem.totalCount) || 0) + adjTotal);
    
    // Automatically re-compute available based on the true real-time reservations
    let newAvailable = Math.max(0, newTotal - editingItem.computedReserved);
    let status = editingItem.status;

    // Auto-switch to Unavailable if stock drops to 0
    if (newAvailable === 0) {
      status = 'Unavailable';
    }

    let statusClass = status === 'Unavailable' ? 'status-unavailable' : 'status-available';

    try {
      // Sync the true availableCount back to DB so other files see the correct number
      await updateDoc(doc(db, 'equipments', editingItem.id), {
        totalCount: newTotal,
        availableCount: status === 'Unavailable' ? 0 : newAvailable,
        status: status,
        statusClass: statusClass,
        lastUpdated: getCurrentDateTime()
      });
      setEditingItem(null); 
    } catch (error) {
      console.error('Failed to update equipment:', error);
    }
  };

  // Save new equipment to Firestore
  const handleSaveNewEquipment = async (e) => {
    e.preventDefault();
    let newAvailable = Number(newItem.quantity) || 0;
    let status = newItem.status;
    let newReserved = 0;

    if (newAvailable === 0) {
      status = 'Unavailable';
    }

    const newTotal = newAvailable + newReserved;
    let statusClass = status === 'Unavailable' ? 'status-unavailable' : 'status-available';

    try {
      await addDoc(collection(db, 'equipments'), {
        name: newItem.name.trim() || 'Untitled Equipment',
        sku: newItem.sku.trim() || `SKU: NEW-${Date.now().toString().slice(-4)}`,
        availableCount: status === 'Unavailable' ? 0 : newAvailable,
        totalCount: newTotal,
        status: status,
        statusClass,
        lastUpdated: getCurrentDateTime()
      });
      setIsAddingNew(false);
    } catch (error) {
      console.error('Failed to add equipment to Firestore:', error);
    }
  };

  // --- FILTERING LOGIC (Uses Mapped Data) ---
  const filteredData = mappedEquipmentData.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      (item.name && item.name.toLowerCase().includes(query)) || 
      (item.sku && item.sku.toLowerCase().includes(query))
    );
  });

  // --- METRIC CALCULATIONS ---
  const totalAvailableUnits = mappedEquipmentData.reduce((acc, curr) => acc + curr.computedAvailable, 0);
  const totalReservedUnits = mappedEquipmentData.reduce((acc, curr) => acc + curr.computedReserved, 0);

  // --- ROLE ACCESS CHECK ---
  const allowedRoles = ['mis', 'mis admin', 'building admin'];
  if (!currentUserRole || !allowedRoles.includes(currentUserRole.toLowerCase().trim())) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

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
            <span className="label">Reserved</span>
            <span className="count">{totalReservedUnits}</span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="table-container">
        <div className="table-controls">
          <div className="controls-left">
            <h2>Equipment Inventory</h2>
            <p>{equipmentData.length} total items listed</p>
          </div>

          <div className="controls-right">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="Search equipment..." 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                }}
              />
            </div>
            <button
              className="btn-danger"
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0}
            >
              🗑️ Delete{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
            </button>
            <button className="btn-primary" onClick={handleAddClick}>+ Add Equipment</button>
          </div>
        </div>

        {/* Equipment Table */}
        <div className="table-scroll-wrapper">
        <table className="equipment-table">
          <thead>
            <tr>
              <th className="checkbox-col">
                <input
                  type="checkbox"
                  checked={filteredData.length > 0 && filteredData.every((item) => selectedIds.includes(item.id))}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>EQUIPMENT NAME</th>
              <th>AVAILABLE</th>
              <th>RESERVED</th>
              <th>STATUS</th>
              <th>LAST UPDATED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state-cell">
                  <div className="empty-state">
                    <span className="empty-state-icon">📦</span>
                    <p className="empty-state-title">{searchQuery ? 'No matching equipment found' : 'No equipment yet'}</p>
                    <p className="empty-state-subtitle">{searchQuery ? 'Try adjusting your search query.' : 'Add your first item to start tracking inventory.'}</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((item) => (
                <tr key={item.id}>
                  <td className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelectOne(item.id)}
                    />
                  </td>
                  <td>
                    <div className="item-name-cell">
                      <div>
                        <div className="item-title">{item.name}</div>
                        <div className="item-sku">{item.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td className="font-semibold">{item.computedAvailable}</td>
                  <td className="font-semibold">{item.computedReserved}</td>
                  <td>
                    <span className={`status-badge ${item.statusClass}`}>{item.status}</span>
                  </td>
                  <td className="text-muted">{item.lastUpdated}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn" onClick={() => handleEditClick(item)}>
                        ✏️ Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        <div className="table-pagination">
          <span className="pagination-text">
            {filteredData.length === 0
              ? 'No equipment items to show'
              : `Showing all ${filteredData.length} equipment items`}
          </span>
        </div>
      </div>

      {/* Local Edit Modal Popup */}
      {editingItem && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>Edit {editingItem.name}</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Status</label>
                <select
                  value={editingItem.status}
                  onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
                >
                  <option value="Available">Available</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>

              {/* 1st Field: Current Available Display */}
              <div className="form-group">
                <label>Current Available</label>
                <input
                  type="number"
                  value={editingItem.computedAvailable}
                  readOnly
                  style={{
                    border: '1px solid #E2E8F0', 
                    borderRadius: '6px', 
                    padding: '9px 12px', 
                    textAlign: 'center', 
                    fontWeight: 600, 
                    fontSize: '15px',
                    background: '#F8FAFC',
                    color: '#1E293B',
                    width: '100%',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* 2nd Field: Add / Deduct Quantity (Adjusts Base Total Inventory) */}
              <div className="form-group">
                <label>Add / Deduct Total Inventory</label>
                <input
                  type="number"
                  value={editingItem.adjustment !== undefined ? editingItem.adjustment : 0}
                  onChange={(e) => {
                    const adj = e.target.value;
                    const adjTotal = parseInt(adj, 10) || 0;
                    const newTotal = Math.max(0, (Number(editingItem.totalCount) || 0) + adjTotal);
                    const newAvailable = Math.max(0, newTotal - editingItem.computedReserved);
                    setEditingItem({
                      ...editingItem,
                      adjustment: adj,
                      status: newAvailable === 0 ? 'Unavailable' : 'Available'
                    });
                  }}
                  style={{
                    border: '1px solid #E2E8F0', 
                    borderRadius: '6px', 
                    padding: '9px 12px', 
                    textAlign: 'center', 
                    fontWeight: 600, 
                    fontSize: '15px',
                    background: '#FFFFFF',
                    color: '#1E293B',
                    width: '100%',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* 3rd Field: Current Reserved Display */}
              <div className="form-group">
                <label>Current Reserved (Automated)</label>
                <input
                  type="number"
                  value={editingItem.computedReserved}
                  readOnly
                  style={{
                    border: '1px solid #E2E8F0', 
                    borderRadius: '6px', 
                    padding: '9px 12px', 
                    textAlign: 'center', 
                    fontWeight: 600, 
                    fontSize: '15px',
                    background: '#F8FAFC',
                    color: '#1E293B',
                    width: '100%',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
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
                <label>Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={newItem.quantity}
                  onChange={(e) => {
                    const qty = e.target.value;
                    setNewItem({
                      ...newItem,
                      quantity: qty,
                      status: (qty !== '' && Number(qty) === 0) ? 'Unavailable' : 'Available'
                    });
                  }}
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

      {/* Delete Confirmation Modal */}
      {isConfirmingDelete && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''}?</h3>
            <p className="confirm-text">This can't be undone.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setIsConfirmingDelete(false)}>Cancel</button>
              <button type="button" className="btn-danger-solid" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MisEquipmentManagement;