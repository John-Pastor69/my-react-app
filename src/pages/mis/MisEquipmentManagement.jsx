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

const MisEquipmentManagement = ({ currentUserRole }) => {
  const [currentUser, setCurrentUser] = useState(null);

  // ==========================================
  // 1. EQUIPMENT STATES & HANDLERS
  // ==========================================
  const [equipmentData, setEquipmentData] = useState([]);
  const [reservationsData, setReservationsData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [editingItem, setEditingItem] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', sku: '', quantity: '', status: 'Available' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // ==========================================
  // 2. UTILITIES STATES & HANDLERS (NEW)
  // ==========================================
  const [utilitiesData, setUtilitiesData] = useState([]);
  const [utilitySearchQuery, setUtilitySearchQuery] = useState('');
  
  const [editingUtility, setEditingUtility] = useState(null);
  const [isAddingUtility, setIsAddingUtility] = useState(false);
  const [newUtility, setNewUtility] = useState({ name: '', sku: '', status: 'Available' });
  const [selectedUtilityIds, setSelectedUtilityIds] = useState([]);
  const [isConfirmingUtilityDelete, setIsConfirmingUtilityDelete] = useState(false);

  // --- AUTH LISTENER ---
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribeAuth();
  }, []);

  // --- LIVE LISTEN TO FIRESTORE COLLECTIONS ---
  useEffect(() => {
    if (!currentUser) return;

    // Listen to Equipments
    const unsubEquipments = onSnapshot(collection(db, 'equipments'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEquipmentData(list);
      setSelectedIds((prev) => prev.filter((id) => list.some((item) => item.id === id)));
    }, (error) => console.error('Failed to load equipment:', error));

    // Listen to Reservations
    const unsubReservations = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReservationsData(list);
    }, (error) => console.error('Failed to load reservations:', error));

    // Listen to Utilities (NEW)
    const unsubUtilities = onSnapshot(collection(db, 'utilities'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUtilitiesData(list);
      setSelectedUtilityIds((prev) => prev.filter((id) => list.some((item) => item.id === id)));
    }, (error) => console.error('Failed to load utilities:', error));

    return () => {
      unsubEquipments();
      unsubReservations();
      unsubUtilities();
    };
  }, [currentUser]);

  // --- MAP & CALCULATE EQUIPMENT ---
  const mappedEquipmentData = equipmentData.map(item => {
    let reservedCount = 0;
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

    if (item.status === 'Unavailable') availableCount = 0;

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

  // --- MAP UTILITIES (NEW) ---
  const mappedUtilitiesData = utilitiesData.map(item => {
    const effectiveStatusClass = item.status === 'Unavailable' ? 'status-unavailable' : 
                                 item.status === 'Maintenance' ? 'status-maintenance' : 'status-available';
    return { ...item, statusClass: effectiveStatusClass };
  });

  // --- EQUIPMENT ACTION HANDLERS ---
  const handleAddClick = () => { setNewItem({ name: '', sku: '', quantity: '', status: 'Available' }); setIsAddingNew(true); };
  const toggleSelectAll = (e) => setSelectedIds(e.target.checked ? filteredData.map((item) => item.id) : []);
  const toggleSelectOne = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]);
  const handleDeleteSelected = () => { if (selectedIds.length > 0) setIsConfirmingDelete(true); };
  
  const confirmDelete = async () => {
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => batch.delete(doc(db, 'equipments', id)));
      await batch.commit();
      setSelectedIds([]);
      setIsConfirmingDelete(false);
    } catch (error) { console.error('Failed to delete equipment:', error); }
  };

  const handleEditClick = (item) => setEditingItem({ ...item, adjustment: 0 });

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    const adjTotal = parseInt(editingItem.adjustment, 10) || 0;
    const newTotal = Math.max(0, (Number(editingItem.totalCount) || 0) + adjTotal);
    let newAvailable = Math.max(0, newTotal - editingItem.computedReserved);
    let status = editingItem.status;
    if (newAvailable === 0) status = 'Unavailable';
    let statusClass = status === 'Unavailable' ? 'status-unavailable' : 'status-available';

    try {
      await updateDoc(doc(db, 'equipments', editingItem.id), {
        totalCount: newTotal,
        availableCount: status === 'Unavailable' ? 0 : newAvailable,
        status: status,
        statusClass: statusClass,
        lastUpdated: getCurrentDateTime()
      });
      setEditingItem(null); 
    } catch (error) { console.error('Failed to update equipment:', error); }
  };

  const handleSaveNewEquipment = async (e) => {
    e.preventDefault();
    let newAvailable = Number(newItem.quantity) || 0;
    let status = newItem.status;
    if (newAvailable === 0) status = 'Unavailable';
    const newTotal = newAvailable;
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
    } catch (error) { console.error('Failed to add equipment to Firestore:', error); }
  };

  // --- UTILITY ACTION HANDLERS (NEW) ---
  const handleAddUtilityClick = () => { setNewUtility({ name: '', sku: '', status: 'Available' }); setIsAddingUtility(true); };
  const toggleSelectAllUtilities = (e) => setSelectedUtilityIds(e.target.checked ? filteredUtilities.map((item) => item.id) : []);
  const toggleSelectOneUtility = (id) => setSelectedUtilityIds((prev) => prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]);
  const handleDeleteSelectedUtilities = () => { if (selectedUtilityIds.length > 0) setIsConfirmingUtilityDelete(true); };

  const confirmDeleteUtility = async () => {
    try {
      const batch = writeBatch(db);
      selectedUtilityIds.forEach((id) => batch.delete(doc(db, 'utilities', id)));
      await batch.commit();
      setSelectedUtilityIds([]);
      setIsConfirmingUtilityDelete(false);
    } catch (error) { console.error('Failed to delete utility:', error); }
  };

  const handleEditUtilityClick = (item) => setEditingUtility(item);

  const handleSaveEditUtility = async (e) => {
    e.preventDefault();
    if (!editingUtility) return;
    let statusClass = editingUtility.status === 'Unavailable' ? 'status-unavailable' : 
                      editingUtility.status === 'Maintenance' ? 'status-maintenance' : 'status-available';
    try {
      await updateDoc(doc(db, 'utilities', editingUtility.id), {
        status: editingUtility.status,
        statusClass: statusClass,
        lastUpdated: getCurrentDateTime()
      });
      setEditingUtility(null); 
    } catch (error) { console.error('Failed to update utility:', error); }
  };

  const handleSaveNewUtility = async (e) => {
    e.preventDefault();
    let status = newUtility.status;
    let statusClass = status === 'Unavailable' ? 'status-unavailable' : 
                      status === 'Maintenance' ? 'status-maintenance' : 'status-available';
    try {
      await addDoc(collection(db, 'utilities'), {
        name: newUtility.name.trim() || 'Untitled Utility',
        sku: newUtility.sku.trim() || `UTIL-${Date.now().toString().slice(-4)}`,
        status: status,
        statusClass,
        lastUpdated: getCurrentDateTime()
      });
      setIsAddingUtility(false);
    } catch (error) { console.error('Failed to add utility to Firestore:', error); }
  };

  // --- FILTERING ---
  const filteredData = mappedEquipmentData.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (item.name && item.name.toLowerCase().includes(query)) || (item.sku && item.sku.toLowerCase().includes(query));
  });

  const filteredUtilities = mappedUtilitiesData.filter((item) => {
    const query = utilitySearchQuery.toLowerCase();
    return (item.name && item.name.toLowerCase().includes(query)) || (item.sku && item.sku.toLowerCase().includes(query));
  });

  // --- METRIC CALCULATIONS ---
  const totalAvailableUnits = mappedEquipmentData.reduce((acc, curr) => acc + curr.computedAvailable, 0);
  const totalReservedUnits = mappedEquipmentData.reduce((acc, curr) => acc + curr.computedReserved, 0);

  // --- ROLE ACCESS CHECK ---
  const normalizedCurrentUserRole = (currentUserRole || '').toLowerCase().trim().replace(/_/g, ' ');
  const allowedRoles = ['mis', 'mis admin', 'building admin', 'super admin'];
  if (!normalizedCurrentUserRole || !allowedRoles.includes(normalizedCurrentUserRole)) {
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
            <span className="label">Available Equipment</span>
            <span className="count">{totalAvailableUnits}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Reserved Equipment</span>
            <span className="count">{totalReservedUnits}</span>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* 1. EQUIPMENT TABLE CONTAINER */}
      {/* ========================================== */}
      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <div className="table-controls">
          <div className="controls-left">
            <h2>Equipment</h2>
            <p>{equipmentData.length} total items listed</p>
          </div>
          <div className="controls-right">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input 
                type="text" placeholder="Search equipment..." 
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="btn-danger" onClick={handleDeleteSelected} disabled={selectedIds.length === 0}>
              🗑️ Delete{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
            </button>
            <button className="btn-primary" onClick={handleAddClick}>+ Add Equipment</button>
          </div>
        </div>

        <div className="table-scroll-wrapper">
        <table className="equipment-table">
          <thead>
            <tr>
              <th className="checkbox-col">
                <input type="checkbox" checked={filteredData.length > 0 && filteredData.every((item) => selectedIds.includes(item.id))} onChange={toggleSelectAll} />
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
                    <p className="empty-state-subtitle">Add your first item to start tracking inventory.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((item) => (
                <tr key={item.id}>
                  <td className="checkbox-col">
                    <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelectOne(item.id)} />
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
                  <td><span className={`status-badge ${item.statusClass}`}>{item.status}</span></td>
                  <td className="text-muted">{item.lastUpdated}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn" onClick={() => handleEditClick(item)}>✏️ Edit</button>
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
            {filteredData.length === 0 ? 'No equipment items to show' : `Showing all ${filteredData.length} equipment items`}
          </span>
        </div>
      </div>

      {/* ========================================== */}
      {/* 2. UTILITIES TABLE CONTAINER (NEW) */}
      {/* ========================================== */}
      <div className="table-container">
        <div className="table-controls">
          <div className="controls-left">
            <h2>Utility</h2>
            <p>{utilitiesData.length} total utilities listed</p>
          </div>
          <div className="controls-right">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input 
                type="text" placeholder="Search utilities..." 
                value={utilitySearchQuery} onChange={(e) => setUtilitySearchQuery(e.target.value)}
              />
            </div>
            <button className="btn-danger" onClick={handleDeleteSelectedUtilities} disabled={selectedUtilityIds.length === 0}>
              🗑️ Delete{selectedUtilityIds.length > 0 ? ` (${selectedUtilityIds.length})` : ''}
            </button>
            <button className="btn-primary" onClick={handleAddUtilityClick}>+ Add Utility</button>
          </div>
        </div>

        <div className="table-scroll-wrapper">
        <table className="equipment-table">
          <thead>
            <tr>
              <th className="checkbox-col">
                <input type="checkbox" checked={filteredUtilities.length > 0 && filteredUtilities.every((item) => selectedUtilityIds.includes(item.id))} onChange={toggleSelectAllUtilities} />
              </th>
              <th>UTILITY NAME</th>
              <th>STATUS</th>
              <th>LAST UPDATED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredUtilities.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state-cell">
                  <div className="empty-state">
                    <span className="empty-state-icon">⚡</span>
                    <p className="empty-state-title">{utilitySearchQuery ? 'No matching utilities found' : 'No utilities yet'}</p>
                    <p className="empty-state-subtitle">Add your first utility to start tracking.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredUtilities.map((item) => (
                <tr key={item.id}>
                  <td className="checkbox-col">
                    <input type="checkbox" checked={selectedUtilityIds.includes(item.id)} onChange={() => toggleSelectOneUtility(item.id)} />
                  </td>
                  <td>
                    <div className="item-name-cell">
                      <div>
                        <div className="item-title">{item.name}</div>
                        <div className="item-sku">{item.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`status-badge ${item.statusClass}`}>{item.status}</span></td>
                  <td className="text-muted">{item.lastUpdated}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn" onClick={() => handleEditUtilityClick(item)}>✏️ Edit</button>
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
            {filteredUtilities.length === 0 ? 'No utility items to show' : `Showing all ${filteredUtilities.length} utility items`}
          </span>
        </div>
      </div>

      {/* ========================================== */}
      {/* EQUIPMENT MODALS */}
      {/* ========================================== */}
      {editingItem && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>Edit {editingItem.name}</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Status</label>
                <select value={editingItem.status} onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}>
                  <option value="Available">Available</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>
              <div className="form-group">
                <label>Current Available</label>
                <input type="number" value={editingItem.computedAvailable} readOnly style={{ border: '1px solid #E2E8F0', borderRadius: '6px', padding: '9px 12px', textAlign: 'center', fontWeight: 600, fontSize: '15px', background: '#F8FAFC', color: '#1E293B', width: '100%', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div className="form-group">
                <label>Add / Deduct Total Inventory</label>
                <input type="number" value={editingItem.adjustment !== undefined ? editingItem.adjustment : 0} onChange={(e) => { const adj = e.target.value; const adjTotal = parseInt(adj, 10) || 0; const newTotal = Math.max(0, (Number(editingItem.totalCount) || 0) + adjTotal); const newAvailable = Math.max(0, newTotal - editingItem.computedReserved); setEditingItem({ ...editingItem, adjustment: adj, status: newAvailable === 0 ? 'Unavailable' : 'Available' }); }} style={{ border: '1px solid #E2E8F0', borderRadius: '6px', padding: '9px 12px', textAlign: 'center', fontWeight: 600, fontSize: '15px', background: '#FFFFFF', color: '#1E293B', width: '100%', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div className="form-group">
                <label>Current Reserved (Automated)</label>
                <input type="number" value={editingItem.computedReserved} readOnly style={{ border: '1px solid #E2E8F0', borderRadius: '6px', padding: '9px 12px', textAlign: 'center', fontWeight: 600, fontSize: '15px', background: '#F8FAFC', color: '#1E293B', width: '100%', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setEditingItem(null)}>Cancel</button>
                <button type="submit" className="btn-save">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddingNew && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add Equipment</h3>
            <form onSubmit={handleSaveNewEquipment}>
              <div className="form-group">
                <label>Equipment Name</label>
                <input type="text" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g. Ring Light Kit" required />
              </div>
              <div className="form-group">
                <label>SKU</label>
                <input type="text" value={newItem.sku} onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })} placeholder="e.g. SKU: AV-020" />
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" min="0" value={newItem.quantity} onChange={(e) => { const qty = e.target.value; setNewItem({ ...newItem, quantity: qty, status: (qty !== '' && Number(qty) === 0) ? 'Unavailable' : 'Available' }); }} required />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={newItem.status} onChange={(e) => setNewItem({ ...newItem, status: e.target.value })}>
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

      {/* ========================================== */}
      {/* UTILITY MODALS (NEW) */}
      {/* ========================================== */}
      {editingUtility && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Edit {editingUtility.name}</h3>
            <form onSubmit={handleSaveEditUtility}>
              <div className="form-group">
                <label>Status</label>
                <select value={editingUtility.status} onChange={(e) => setEditingUtility({ ...editingUtility, status: e.target.value })}>
                  <option value="Available">Available</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setEditingUtility(null)}>Cancel</button>
                <button type="submit" className="btn-save">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddingUtility && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add Utility</h3>
            <form onSubmit={handleSaveNewUtility}>
              <div className="form-group">
                <label>Utility Name</label>
                <input type="text" value={newUtility.name} onChange={(e) => setNewUtility({ ...newUtility, name: e.target.value })} placeholder="e.g. Internet Router, Generator" required />
              </div>
              <div className="form-group">
                <label>SKU</label>
                <input type="text" value={newUtility.sku} onChange={(e) => setNewUtility({ ...newUtility, sku: e.target.value })} placeholder="e.g. UTIL-001" />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={newUtility.status} onChange={(e) => setNewUtility({ ...newUtility, status: e.target.value })}>
                  <option value="Available">Available</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setIsAddingUtility(false)}>Cancel</button>
                <button type="submit" className="btn-save">Add Utility</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isConfirmingUtilityDelete && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete {selectedUtilityIds.length} item{selectedUtilityIds.length > 1 ? 's' : ''}?</h3>
            <p className="confirm-text">This can't be undone.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setIsConfirmingUtilityDelete(false)}>Cancel</button>
              <button type="button" className="btn-danger-solid" onClick={confirmDeleteUtility}>Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MisEquipmentManagement;