import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../Firebase';
import "../../styles/mis/MisUserManagement.scss";

// Map the `role` value stored in Firestore to a readable label.
// Adjust these keys if your role values are spelled differently.
const ROLE_LABELS = {
  mis: 'MIS Admin',
  building_admin: 'Building Admin',
  school_admin: 'School Admin',
  academic_head: 'Academic Head',
  endorser: 'Endorser',
  osa: 'OSA',
  user: 'Requestor'
};

// Roles counted in the "Admins" card
const ADMIN_ROLES = ['mis', 'building_admin', 'school_admin'];

const roleLabel = (role) => ROLE_LABELS[role] || role || 'Unknown';

const roleBadgeClass = (role) => {
  if (role === 'mis') return 'role-admin';
  if (!role || role === 'user') return 'role-requestor';
  return 'role-approver';
};

// Users without a `status` field are treated as Active
const getStatus = (user) => user.status || 'Active';

// `lastActive` is expected to be a Firestore Timestamp (written on login)
const formatLastActive = (value) => {
  if (value && typeof value.toDate === 'function') {
    return value.toDate().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }
  return '—';
};

const MisUserManagement = () => {
  const [usersData, setUsersData] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Live-listen to the "users" collection in Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setUsersData(list);
        // Drop selections for users that no longer exist
        setSelectedUserIds((prev) => prev.filter((id) => list.some((u) => u.id === id)));
        setLoadError('');
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to load users:', error);
        setLoadError(
          error.code === 'permission-denied'
            ? 'You do not have permission to view users. Check your Firestore rules.'
            : 'Could not load users. Please try again.'
        );
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Toggle a user's Active / Inactive status in Firestore
  const handleToggleStatus = async (user) => {
    const nextStatus = getStatus(user) === 'Active' ? 'Inactive' : 'Active';
    try {
      setActionError('');
      await updateDoc(doc(db, 'users', user.id), { status: nextStatus });
    } catch (error) {
      console.error('Failed to update status:', error);
      setActionError('Could not update the user status.');
    }
  };

  // Single checkbox selection
  const handleSelectUser = (id) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((userId) => userId !== id) : [...prev, id]
    );
  };

  // "Select All" checkbox
  const handleSelectAll = (e) => {
    setSelectedUserIds(e.target.checked ? usersData.map((u) => u.id) : []);
  };

  // Delete selected users (asks for confirmation first)
  const handleDeleteSelected = () => {
    if (selectedUserIds.length === 0) return;
    setIsConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    try {
      setActionError('');
      const batch = writeBatch(db);
      selectedUserIds.forEach((id) => batch.delete(doc(db, 'users', id)));
      await batch.commit();
      setSelectedUserIds([]);
    } catch (error) {
      console.error('Failed to delete users:', error);
      setActionError('Could not delete the selected users.');
    }
    setIsConfirmingDelete(false);
  };

  // Dynamic summary metrics — all derived from usersData
  const totalUsers = usersData.length;
  const activeUsers = usersData.filter((u) => getStatus(u) === 'Active').length;
  const totalAdmins = usersData.filter((u) => ADMIN_ROLES.includes(u.role)).length;

  return (
    <div className="user-management-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>All Users</h1>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Total Users</span>
            <span className="count">{totalUsers}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Active Users</span>
            <span className="count">{activeUsers}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <span className="label">Admins</span>
            <span className="count">{totalAdmins}</span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="table-container">
        <div className="table-controls">
          <div className="controls-left">
            <h2>User Directory</h2>
            <p>Search and manage all system users</p>
          </div>

          <div className="controls-right">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input type="text" placeholder="Search users..." />
            </div>
            <button
              className="btn-secondary btn-danger"
              onClick={handleDeleteSelected}
              disabled={selectedUserIds.length === 0}
            >
              🗑 Delete{selectedUserIds.length > 0 ? ` (${selectedUserIds.length})` : ''}
            </button>
          </div>
        </div>

        {actionError && <div className="error-banner">{actionError}</div>}

        {/* Users Table Wrapper with Horizontal Scroll */}
        <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="user-table" style={{ minWidth: '800px', width: '100%' }}>
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={usersData.length > 0 && selectedUserIds.length === usersData.length}
                  />
                </th>
                <th>USER</th>
                <th>ROLE</th>
                <th>OFFICE LOCATION</th>
                <th>STATUS</th>
                <th>LAST ACTIVE</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || loadError || usersData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state-cell">
                    <div className="empty-state">
                      <span className="empty-state-icon">{loadError ? '⚠️' : '👥'}</span>
                      <p className="empty-state-title">
                        {isLoading ? 'Loading users…' : loadError ? 'Something went wrong' : 'No users yet'}
                      </p>
                      <p className="empty-state-subtitle">
                        {isLoading
                          ? 'Fetching the latest users from the database.'
                          : loadError || 'Users will appear here once they are registered.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                usersData.map((user) => {
                  const status = getStatus(user);
                  return (
                    <tr key={user.id}>
                      <td className="checkbox-col">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(user.id)}
                          onChange={() => handleSelectUser(user.id)}
                        />
                      </td>
                      <td>
                        <div className="user-name-cell">
                          {user.avatarUrl ? (
                            <img className="avatar-img" src={user.avatarUrl} alt="" />
                          ) : (
                            <div className="avatar-placeholder">{(user.name || '?').charAt(0)}</div>
                          )}
                          <div>
                            <div className="user-title">{user.name || 'Unnamed User'}</div>
                            <div className="user-email">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`role-badge ${roleBadgeClass(user.role)}`}>{roleLabel(user.role)}</span></td>
                      <td>{user.officeLocation || '—'}</td>
                      <td>
                        <span className={`status-dot ${status === 'Active' ? 'status-active' : 'status-inactive'}`}>
                          {status}
                        </span>
                      </td>
                      <td className="text-muted">{formatLastActive(user.lastActive)}</td>
                      <td>
                        <div className="action-buttons">
                          <button className="action-btn">✏ Edit</button>
                          <button className="action-btn assign-role-btn">👤 Assign Role</button>
                          <button className="action-btn" onClick={() => handleToggleStatus(user)}>
                            {status === 'Active' ? '⊘ Deactivate' : '● Activate'}
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

        {/* Table Footer */}
        <div className="table-pagination">
          <span className="pagination-text">
            {usersData.length === 0
              ? 'No users to show'
              : `Showing 1 to ${usersData.length} of ${usersData.length} users`}
          </span>
          <div className="pagination-buttons">
            <button className="page-btn" disabled>Prev</button>
            <button className="page-btn active">1</button>
            <button className="page-btn" disabled>Next</button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isConfirmingDelete && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete {selectedUserIds.length} user{selectedUserIds.length > 1 ? 's' : ''}?</h3>
            <p className="confirm-text">This removes their profile from the database and can't be undone.</p>
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

export default MisUserManagement;
