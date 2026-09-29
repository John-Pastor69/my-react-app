import React, { useState } from 'react';
import '../../styles/buildingadmin/BuildingFacilitiesManagement.scss';

const STATUS_CYCLE = ['Available', 'Maintenance', 'Unavailable'];

const BuildingFacilitiesManagement = () => {
  // Initial local state for facility directory — starts empty
  const [facilitiesData, setFacilitiesData] = useState([]);

  // Row selection (checkboxes)
  const [selectedIds, setSelectedIds] = useState([]);

  const toggleSelectAll = (e) => {
    setSelectedIds(e.target.checked ? facilitiesData.map((f) => f.id) : []);
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Add Facility modal
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newFacility, setNewFacility] = useState({
    name: '',
    location: '',
    capacity: '',
    status: 'Available'
  });

  const handleAddClick = () => {
    setNewFacility({ name: '', location: '', capacity: '', status: 'Available' });
    setIsAddingNew(true);
  };

  const statusClass = (status) => {
    if (status === 'Available') return 'status-available';
    if (status === 'Maintenance') return 'status-maintenance';
    if (status === 'Unavailable') return 'status-unavailable';
    return 'status-available';
  };

  const handleSaveNewFacility = (e) => {
    e.preventDefault();

    const nextId = facilitiesData.length > 0
      ? Math.max(...facilitiesData.map((f) => f.id)) + 1
      : 1;

    const facilityToAdd = {
      id: nextId,
      code: `FAC-${String(nextId).padStart(3, '0')}`,
      name: newFacility.name.trim() || 'Untitled Facility',
      location: newFacility.location.trim() || 'Unassigned',
      capacity: newFacility.capacity.trim() || '0 pax',
      status: newFacility.status,
      lastUpdated: 'Just now'
    };

    setFacilitiesData((prev) => [...prev, facilityToAdd]);
    setIsAddingNew(false);
  };

  // Edit modal
  const [editingFacility, setEditingFacility] = useState(null);

  const handleEditClick = (facility) => {
    setEditingFacility({ ...facility });
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    setFacilitiesData((prev) =>
      prev.map((f) =>
        f.id === editingFacility.id ? { ...editingFacility, lastUpdated: 'Just now' } : f
      )
    );
    setEditingFacility(null);
  };

  // Toggle status directly from the table (cycles Available -> Maintenance -> Unavailable -> Available)
  const handleToggleStatus = (id) => {
    setFacilitiesData((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const currentIndex = STATUS_CYCLE.indexOf(f.status);
        const nextStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
        return { ...f, status: nextStatus, lastUpdated: 'Just now' };
      })
    );
  };

  // Delete (per-row or bulk), with confirmation modal
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setPendingDeleteIds(selectedIds);
  };

  const confirmDelete = () => {
    setFacilitiesData((prev) => prev.filter((f) => !pendingDeleteIds.includes(f.id)));
    setSelectedIds((prev) => prev.filter((sid) => !pendingDeleteIds.includes(sid)));
    setPendingDeleteIds([]);
  };

  // Dynamic summary metrics
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
              <input type="text" placeholder="Search facilities..." />
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
                    checked={facilitiesData.length > 0 && selectedIds.length === facilitiesData.length}
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
              {facilitiesData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state-cell">
                    <div className="empty-state">
                      <span className="empty-state-icon">🏢</span>
                      <p className="empty-state-title">No facilities yet</p>
                      <p className="empty-state-subtitle">Add your first facility to start managing bookings.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                facilitiesData.map((facility) => (
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
                    <td data-label="Location">📍 {facility.location}</td>
                    <td data-label="Capacity">👥 {facility.capacity}</td>
                    <td data-label="Status">
                      <span className={`status-badge ${statusClass(facility.status)}`}>
                        ● {facility.status}
                      </span>
                    </td>
                    <td className="text-muted" data-label="Last Updated">{facility.lastUpdated}</td>
                    <td data-label="Actions">
                      <div className="action-buttons">
                        <button className="action-btn edit-btn" onClick={() => handleEditClick(facility)}>
                          ✏ Edit
                        </button>
                        <button className="action-btn toggle-btn" onClick={() => handleToggleStatus(facility.id)}>
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

        {/* Table Footer */}
        <div className="table-pagination">
          <span className="pagination-text">
            {facilitiesData.length === 0
              ? 'No facilities to show'
              : `Showing 1 to ${facilitiesData.length} of ${facilitiesData.length} facilities${selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}`}
          </span>
          <div className="pagination-buttons">
            <button className="page-btn" disabled>Prev</button>
            <button className="page-btn active">1</button>
            <button className="page-btn" disabled>Next</button>
          </div>
        </div>
      </div>

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
                  value={newFacility.name}
                  onChange={(e) => setNewFacility({ ...newFacility, name: e.target.value })}
                  placeholder="e.g. Main Auditorium"
                  required
                />
              </div>

              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={newFacility.location}
                  onChange={(e) => setNewFacility({ ...newFacility, location: e.target.value })}
                  placeholder="e.g. Block A, Floor 1"
                  required
                />
              </div>

              <div className="form-group">
                <label>Capacity</label>
                <input
                  type="text"
                  value={newFacility.capacity}
                  onChange={(e) => setNewFacility({ ...newFacility, capacity: e.target.value })}
                  placeholder="e.g. 500 pax"
                  required
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={newFacility.status}
                  onChange={(e) => setNewFacility({ ...newFacility, status: e.target.value })}
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

      {/* Edit Facility Modal */}
      {editingFacility && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Edit {editingFacility.name}</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={editingFacility.location}
                  onChange={(e) => setEditingFacility({ ...editingFacility, location: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Capacity</label>
                <input
                  type="text"
                  value={editingFacility.capacity}
                  onChange={(e) => setEditingFacility({ ...editingFacility, capacity: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={editingFacility.status}
                  onChange={(e) => setEditingFacility({ ...editingFacility, status: e.target.value })}
                >
                  <option value="Available">Available</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setEditingFacility(null)}>Cancel</button>
                <button type="submit" className="btn-save">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDeleteIds.length > 0 && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete {pendingDeleteIds.length} facilit{pendingDeleteIds.length > 1 ? 'ies' : 'y'}?</h3>
            <p className="confirm-text">This can't be undone.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingDeleteIds([])}>Cancel</button>
              <button type="button" className="btn-danger-solid" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildingFacilitiesManagement;