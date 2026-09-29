import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, addDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../Firebase';
import '../../styles/buildingadmin/BuildingFacilitiesManagement.scss';

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

const STATUS_CYCLE = ['Available', 'Maintenance', 'Unavailable'];

const BuildingFacilitiesManagement = () => {
  // --- FIRESTORE STATES ---
  const [facilitiesData, setFacilitiesData] = useState([]);

  // --- SEARCH & PAGINATION STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // --- MODAL STATES ---
  const [editingItem, setEditingItem] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    code: '',
    location: '',
    capacity: '',
    status: 'Available'
  });
  
  const [selectedIds, setSelectedIds] = useState([]);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // --- LIVE LISTEN TO FIRESTORE COLLECTIONS ---
  useEffect(() => {
    const unsubFacilities = onSnapshot(collection(db, 'facilities'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setFacilitiesData(list);
      setSelectedIds((prev) => prev.filter((id) => list.some((item) => item.id === id)));
    }, (error) => console.error('Failed to load facilities:', error));

    return () => {
      unsubFacilities();
    };
  }, []);

  // --- ACTION HANDLERS ---
  const handleAddClick = () => {
    setNewItem({ name: '', code: '', location: '', capacity: '', status: 'Available' });
    setIsAddingNew(true);
  };

  const toggleSelectAll = (e) => {
    setSelectedIds(e.target.checked ? currentData.map((item) => item.id) : []);
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
      selectedIds.forEach((id) => batch.delete(doc(db, 'facilities', id)));
      await batch.commit();
      
      setSelectedIds([]);
      setIsConfirmingDelete(false);
      
      const newTotalItems = filteredData.length - selectedIds.length;
      const newTotalPages = Math.max(1, Math.ceil(newTotalItems / itemsPerPage));
      if (currentPage > newTotalPages) {
        setCurrentPage(newTotalPages);
      }
    } catch (error) {
      console.error('Failed to delete facilities:', error);
    }
  };

  const handleEditClick = (item) => {
    setEditingItem({ ...item });
  };

  // Save changes to Firestore
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    
    let statusClass = editingItem.status === 'Unavailable' ? 'status-unavailable' : 
                      editingItem.status === 'Maintenance' ? 'status-maintenance' : 'status-available';

    // Auto-generate ID if left blank
    const finalCode = editingItem.code?.trim() ? editingItem.code.trim() : `FAC-${Date.now().toString().slice(-4)}`;

    try {
      await updateDoc(doc(db, 'facilities', editingItem.id), {
        name: editingItem.name,
        code: finalCode,
        location: editingItem.location,
        capacity: editingItem.capacity,
        status: editingItem.status,
        statusClass: statusClass,
        lastUpdated: getCurrentDateTime()
      });
      setEditingItem(null); 
    } catch (error) {
      console.error('Failed to update facility:', error);
    }
  };

  // Save new facility to Firestore
  const handleSaveNewFacility = async (e) => {
    e.preventDefault();
    let status = newItem.status;
    
    let statusClass = status === 'Unavailable' ? 'status-unavailable' : 
                      status === 'Maintenance' ? 'status-maintenance' : 'status-available';

    // Auto-generate ID if left blank
    const finalCode = newItem.code.trim() ? newItem.code.trim() : `FAC-${Date.now().toString().slice(-4)}`;

    try {
      await addDoc(collection(db, 'facilities'), {
        code: finalCode,
        name: newItem.name.trim() || 'Untitled Facility',
        location: newItem.location.trim() || 'Unassigned',
        capacity: newItem.capacity.trim() || '0',
        status: status,
        statusClass,
        lastUpdated: getCurrentDateTime()
      });
      setIsAddingNew(false);
    } catch (error) {
      console.error('Failed to add facility to Firestore:', error);
    }
  };

  // Toggle status directly from the table
  const handleToggleStatus = async (item) => {
    const currentIndex = STATUS_CYCLE.indexOf(item.status);
    const nextStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
    
    let statusClass = nextStatus === 'Unavailable' ? 'status-unavailable' : 
                      nextStatus === 'Maintenance' ? 'status-maintenance' : 'status-available';

    try {
      await updateDoc(doc(db, 'facilities', item.id), {
        status: nextStatus,
        statusClass: statusClass,
        lastUpdated: getCurrentDateTime()
      });
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  // --- FILTERING & PAGINATION LOGIC ---
  const filteredData = facilitiesData.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      (item.name && item.name.toLowerCase().includes(query)) || 
      (item.code && item.code.toLowerCase().includes(query))
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
  const totalFacilities = facilitiesData.length;
  const totalAvailable = facilitiesData.filter((f) => f.status === 'Available').length;
  const totalMaintenance = facilitiesData.filter((f) => f.status === 'Maintenance').length;
  const totalUnavailable = facilitiesData.filter((f) => f.status === 'Unavailable').length;

  return (
    <div className="building-facilities-management-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>All Facilities</h1>
        </div>
        <button className="btn-primary" onClick={handleAddClick}>+ Add Facility</button>
      </div>

      {/* Top Metric Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Total Facilities</span>
            <span className="count">{totalFacilities}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Available</span>
            <span className="count">{totalAvailable}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Under Maintenance</span>
            <span className="count">{totalMaintenance}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Unavailable</span>
            <span className="count">{totalUnavailable}</span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="table-container">
        <div className="table-controls">
          <div className="controls-left">
            <h2>Facility Directory</h2>
            <p>Edit, update, or toggle availability for each facility</p>
          </div>

          <div className="controls-right">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="Search facilities..." 
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
              <span>🗑</span>
              <span>Delete</span>
              {selectedIds.length > 0 && <span>({selectedIds.length})</span>}
            </button>
          </div>
        </div>

        {/* Facilities Table */}
        <div className="table-scroll-wrapper">
          <table className="facility-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input
                    type="checkbox"
                    checked={currentData.length > 0 && selectedIds.length === currentData.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>FACILITY NAME</th>
                <th>LOCATION</th>
                <th>CAPACITY</th>
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
                      <span className="empty-state-icon">🏢</span>
                      <p className="empty-state-title">No facilities found</p>
                      <p className="empty-state-subtitle">Add your first facility or adjust your search.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                currentData.map((facility) => (
                  <tr key={facility.id}>
                    <td className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(facility.id)}
                        onChange={() => toggleSelectOne(facility.id)}
                      />
                    </td>
                    <td data-label="Facility Name">
                      <div className="facility-name-cell">
                        <div>
                          <div className="facility-title">{facility.name}</div>
                          <div className="facility-code">ID: {facility.code}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Location">{facility.location}</td>
                    <td className="font-semibold" data-label="Capacity">{facility.capacity}</td>
                    <td data-label="Status">
                      <span className={`status-badge ${facility.statusClass}`}>
                        ● {facility.status}
                      </span>
                    </td>
                    <td className="text-muted" data-label="Last Updated">{facility.lastUpdated}</td>
                    <td data-label="Actions">
                      <div className="action-buttons">
                        <button className="action-btn edit-btn" onClick={() => handleEditClick(facility)}>
                          ✏ Edit
                        </button>
                        <button className="action-btn toggle-btn" onClick={() => handleToggleStatus(facility)}>
                          ⟳ Toggle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer & Pagination */}
        <div className="table-pagination">
          <span className="pagination-text">
            {filteredData.length === 0
              ? 'No facilities to show'
              : `Showing ${startIndex + 1} to ${Math.min(startIndex + itemsPerPage, filteredData.length)} of ${filteredData.length} facilities`}
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
          <div className="modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>Edit {editingItem.name}</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Facility Name</label>
                <input
                  type="text"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Facility ID / Code</label>
                <input
                  type="text"
                  value={editingItem.code || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, code: e.target.value })}
                  placeholder="Auto-generated if left blank"
                />
              </div>

              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={editingItem.location}
                  onChange={(e) => setEditingItem({ ...editingItem, location: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Capacity</label>
                <input
                  type="text"
                  value={editingItem.capacity ? String(editingItem.capacity).replace(/\D/g, '') : ''}
                  onChange={(e) => setEditingItem({ ...editingItem, capacity: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 500"
                  required
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={editingItem.status}
                  onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
                >
                  <option value="Available">Available</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setEditingItem(null)}>Cancel</button>
                <button type="submit" className="btn-save">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Facility Modal */}
      {isAddingNew && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add Facility</h3>
            <form onSubmit={handleSaveNewFacility}>
              <div className="form-group">
                <label>Facility Name</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="e.g. Main Auditorium"
                  required
                />
              </div>

              <div className="form-group">
                <label>Facility ID / Code</label>
                <input
                  type="text"
                  value={newItem.code}
                  onChange={(e) => setNewItem({ ...newItem, code: e.target.value })}
                  placeholder="Auto-generated if left blank"
                />
              </div>

              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={newItem.location}
                  onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                  placeholder="e.g. Block A, Floor 1"
                  required
                />
              </div>

              <div className="form-group">
                <label>Capacity</label>
                <input
                  type="text"
                  value={newItem.capacity ? String(newItem.capacity).replace(/\D/g, '') : ''}
                  onChange={(e) => setNewItem({ ...newItem, capacity: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 500"
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
                  <option value="Maintenance">Maintenance</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setIsAddingNew(false)}>Cancel</button>
                <button type="submit" className="btn-save">Add Facility</button>
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

export default BuildingFacilitiesManagement;