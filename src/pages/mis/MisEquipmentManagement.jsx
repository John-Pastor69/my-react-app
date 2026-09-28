import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, addDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../Firebase';
import "../../styles/mis/MisEquipmentManagement.scss";

const MisEquipmentManagement = () => {
  // Equipment state loaded from Firestore
  const [equipmentData, setEquipmentData] = useState([]);

  // --- SEARCH & PAGINATION STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Modal State for Editing
  const [editingItem, setEditingItem] = useState(null);

  // Modal state + form fields for adding new equipment
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    sku: '',
    quantity: '',
    status: 'Available'
  });

  const handleAddClick = () => {
    setNewItem({ name: '', sku: '', quantity: '', status: 'Available' });
    setIsAddingNew(true);
  };

  // --- LIVE LISTEN TO FIRESTORE "equipments" COLLECTION ---
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'equipments'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEquipmentData(list);
        setSelectedIds((prev) => prev.filter((id) => list.some((item) => item.id === id)));
      },
      (error) => {
        console.error('Failed to load equipment from Firestore:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Row selection for bulk delete
  const [selectedIds, setSelectedIds] = useState([]);

  const toggleSelectAll = (e) => {
    setSelectedIds(e.target.checked ? currentData.map((item) => item.id) : []);
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Confirmation modal state
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

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
      
      const newTotalItems = filteredData.length - selectedIds.length;
      const newTotalPages = Math.max(1, Math.ceil(newTotalItems / itemsPerPage));
      if (currentPage > newTotalPages) {
        setCurrentPage(newTotalPages);
      }
    } catch (error) {
      console.error('Failed to delete equipment:', error);
    }
  };

  const handleEditClick = (item) => {
    setEditingItem({ 
      ...item, 
      adjustment: 0 // starts at 0 for adding/subtracting
    });
  };

  // Save changes to Firestore on Save Changes click (Base Available + Adjustment)
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    
    const baseAvailable = Number(editingItem.availableCount) || 0;
    const currentInUse = (Number(editingItem.totalCount) || 0) - baseAvailable;
    const adjustment = Number(editingItem.adjustment) || 0;
    
    const newAvailable = Math.max(0, baseAvailable + adjustment);
    const newTotal = newAvailable + currentInUse;
    
    let status = editingItem.status;
    let available = newAvailable;

    if (status === 'Maintenance' || status === 'Unavailable' || newTotal === 0) {
      available = 0;
      if (newTotal === 0 && status !== 'Maintenance') status = 'Unavailable';
    }

    let statusClass = 'status-available';
    if (status === 'Unavailable') statusClass = 'status-unavailable';
    if (status === 'Maintenance') statusClass = 'status-maintenance';

    try {
      await updateDoc(doc(db, 'equipments', editingItem.id), {
        availableCount: available,
        totalCount: newTotal,
        status: status,
        statusClass: statusClass,
        lastUpdated: 'Just now'
      });
      setEditingItem(null); 
    } catch (error) {
      console.error('Failed to update equipment:', error);
    }
  };

  // Save new equipment to Firestore with Maintenance support
  const handleSaveNewEquipment = async (e) => {
    e.preventDefault();
    const total = Number(newItem.quantity) || 0;

    let status = newItem.status;
    let available = total;

    if (status === 'Maintenance' || status === 'Unavailable' || total === 0) {
      available = 0;
      if (total === 0 && status !== 'Maintenance') status = 'Unavailable';
    }

    let statusClass = 'status-available';
    if (status === 'Unavailable') statusClass = 'status-unavailable';
    if (status === 'Maintenance') statusClass = 'status-maintenance';

    try {
      await addDoc(collection(db, 'equipments'), {
        name: newItem.name.trim() || 'Untitled Equipment',
        sku: newItem.sku.trim() || `SKU: NEW-${Date.now().toString().slice(-4)}`,
        availableCount: available,
        totalCount: total,
        status: status,
        statusClass,
        lastUpdated: 'Just now'
      });
      setIsAddingNew(false);
    } catch (error) {
      console.error('Failed to add equipment to Firestore:', error);
    }
  };

  // --- FILTERING & PAGINATION LOGIC ---
  const filteredData = equipmentData.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      (item.name && item.name.toLowerCase().includes(query)) || 
      (item.sku && item.sku.toLowerCase().includes(query))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + itemsPerPage); 

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage, '...', totalPages);
      }
    }
    return pages;
  };

  // --- METRIC CALCULATIONS ---
  const totalAvailableUnits = equipmentData
    .filter(item => item.status === 'Available')
    .reduce((acc, curr) => acc + (curr.availableCount || 0), 0);

  const totalInUseUnits = equipmentData
    .filter(item => item.status === 'Available')
    .reduce((acc, curr) => acc + ((curr.totalCount || 0) - (curr.availableCount || 0)), 0);

  const totalMaintenanceUnits = equipmentData
    .filter(item => item.status === 'Maintenance')
    .reduce((acc, curr) => acc + (curr.totalCount || 0), 0);

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
            <span className="label">In-Use</span>
            <span className="count">{totalInUseUnits}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Maintenance</span>
            <span className="count">{totalMaintenanceUnits}</span>
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
                  setCurrentPage(1);
                }}
              />
            </div>
            <button
              className="btn-danger"
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0}
            >
              🗑 Delete{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
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
                  checked={currentData.length > 0 && selectedIds.length === currentData.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>EQUIPMENT NAME</th>
              <th>AVAILABLE</th>
              <th>IN-USE</th>
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
                    <span className="empty-state-icon">📭</span>
                    <p className="empty-state-title">{searchQuery ? 'No matching equipment found' : 'No equipment yet'}</p>
                    <p className="empty-state-subtitle">{searchQuery ? 'Try adjusting your search query.' : 'Add your first item to start tracking inventory.'}</p>
                  </div>
                </td>
              </tr>
            ) : (
              currentData.map((item) => {
                const inUseCount = item.status === 'Available' ? (item.totalCount - item.availableCount) : 0;
                return (
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
                    <td className="font-semibold">{item.availableCount}</td>
                    <td className="font-semibold">{inUseCount}</td>
                    <td>
                      <span className={`status-badge ${item.statusClass}`}>{item.status}</span>
                    </td>
                    <td className="text-muted">{item.lastUpdated}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="action-btn" onClick={() => handleEditClick(item)}>
                          ✏ Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        {/* Dynamic Table Footer & Pagination */}
        <div className="table-pagination">
          <span className="pagination-text">
            {filteredData.length === 0
              ? 'No equipment items to show'
              : `Showing ${startIndex + 1} to ${Math.min(startIndex + itemsPerPage, filteredData.length)} of ${filteredData.length} equipment items`}
          </span>
          <div className="pagination-buttons">
            <button 
              className="page-btn" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            >
              Prev
            </button>
            
            {getPageNumbers().map((num, idx) => (
              num === '...' ? (
                <span key={`dots-${idx}`} className="dots">...</span>
              ) : (
                <button 
                  key={idx}
                  className={`page-btn ${currentPage === num ? 'active' : ''}`}
                  onClick={() => setCurrentPage(num)}
                >
                  {num}
                </button>
              )
            ))}

            <button 
              className="page-btn" 
              disabled={currentPage === totalPages || filteredData.length === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
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
                  <option value="Unavailable">Unavailable</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              </div>

              {/* 1st Field: Current Available Display */}
              <div className="form-group">
                <label>Current Available</label>
                <input
                  type="number"
                  value={editingItem.availableCount}
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

              {/* 2nd Field: Add / Deduct Quantity starting at 0 */}
              <div className="form-group">
                <label>Add / Deduct Quantity</label>
                <input
                  type="number"
                  value={editingItem.adjustment !== undefined ? editingItem.adjustment : 0}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0;
                    setEditingItem({ ...editingItem, adjustment: val });
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
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
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
                  <option value="Maintenance">Maintenance</option>
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