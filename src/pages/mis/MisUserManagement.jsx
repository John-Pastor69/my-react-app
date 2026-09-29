import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../Firebase';
import "../../styles/mis/MisUserManagement.scss";

// Role options kung saan direct na "requestor" ang value na ibabato sa DB
const ROLE_OPTIONS = [
  { value: 'mis', label: 'MIS Admin' },
  { value: 'building_admin', label: 'Building Admin' },
  { value: 'school_admin', label: 'School Admin' },
  { value: 'academic_head', label: 'Academic Head' },
  { value: 'endorser', label: 'Endorser' },
  { value: 'osa', label: 'OSA' },
  { value: 'requestor', label: 'Requestor' }
];

// Display label mapping
const ROLE_LABELS = {
  mis: 'MIS Admin',
  building_admin: 'Building Admin',
  school_admin: 'School Admin',
  academic_head: 'Academic Head',
  endorser: 'Endorser',
  osa: 'OSA',
  requestor: 'Requestor',
  user: 'Requestor'
};

const ADMIN_ROLES = ['mis', 'building_admin', 'school_admin'];

const roleLabel = (role) => ROLE_LABELS[role] || role || 'Unknown';

const roleBadgeClass = (role) => {
  if (role === 'mis') return 'role-admin';
  if (!role || role === 'requestor' || role === 'user') return 'role-requestor';
  return 'role-approver';
};

// Safely format Firestore Timestamps, standard JS Dates, or ISO strings into readable exact times
const formatLastActive = (value) => {
  if (!value) return '—';
  
  let dateObj;
  if (typeof value.toDate === 'function') {
    dateObj = value.toDate();
  } else {
    dateObj = new Date(value);
  }

  if (isNaN(dateObj.getTime())) return '—';

  return dateObj.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const MisUserManagement = () => {
  const [usersData, setUsersData] = useState([]);
  const [currentAuthUser, setCurrentAuthUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  // --- SEARCH & PAGINATION STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Role Modal State
  const [roleModalUser, setRoleModalUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('requestor');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Track currently logged-in auth user
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setCurrentAuthUser(user);
    });
    return () => unsubscribeAuth();
  }, []);

  // Snapshot listener para sa live updates ng users collection
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setUsersData(list);
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

  const handleOpenRoleModal = (user) => {
    setRoleModalUser(user);
    const currentRole = user.role === 'user' ? 'requestor' : (user.role || 'requestor');
    setSelectedRole(currentRole);
  };

  const handleSaveRole = async () => {
    if (!roleModalUser) return;

    try {
      setIsUpdatingRole(true);
      setActionError('');

      await updateDoc(doc(db, 'users', roleModalUser.id), {
        role: selectedRole
      });

      setRoleModalUser(null);
    } catch (error) {
      console.error('Failed to update role:', error);
      setActionError('Could not update the user role.');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // --- FILTERING & PAGINATION LOGIC ---
  const filteredUsers = usersData.filter((user) => {
    const query = searchQuery.toLowerCase();
    const name = (user.name || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  const totalUsers = usersData.length;
  const activeUsers = usersData.filter((u) => currentAuthUser && u.id === currentAuthUser.uid).length;
  const totalAdmins = usersData.filter((u) => ADMIN_ROLES.includes(u.role)).length;

  return (
    <div className="user-management-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>All Users</h1>
        </div>
      </div>

      {/* Metrics Grid */}
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

      {/* Table Container */}
      <div className="table-container">
        <div className="table-controls">
          <div className="controls-left">
            <h2>User Directory</h2>
            <p>Search and manage all system users</p>
          </div>

          <div className="controls-right">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="Search users..." 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1); // Reset to first page on search
                }}
              />
            </div>
          </div>
        </div>

        {actionError && <div className="error-banner">{actionError}</div>}

        {/* Users Table */}
        <div className="table-scroll-wrapper">
          <table className="user-table">
            <thead>
              <tr>
                <th>USER</th>
                <th>ROLE</th>
                <th>OFFICE LOCATION</th>
                <th>STATUS</th>
                <th>LAST ACTIVE</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || loadError || currentUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state-cell">
                    <div className="empty-state">
                      <span className="empty-state-icon">{loadError ? '⚠️' : '👥'}</span>
                      <p className="empty-state-title">
                        {isLoading ? 'Loading users…' : loadError ? 'Something went wrong' : searchQuery ? 'No matching users found' : 'No users yet'}
                      </p>
                      <p className="empty-state-subtitle">
                        {isLoading
                          ? 'Fetching the latest users from the database.'
                          : loadError || (searchQuery ? 'Try adjusting your search query.' : 'Users will appear here once they are registered.')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                currentUsers.map((user) => {
                  const isActive = currentAuthUser && user.id === currentAuthUser.uid;
                  const statusLabel = isActive ? 'Active' : 'Inactive';
                  
                  return (
                    <tr key={user.id}>
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
                      <td>
                        <span className={`role-badge ${roleBadgeClass(user.role)}`}>
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      <td>{user.officeLocation || '—'}</td>
                      <td>
                        <span 
                          className="status-dot"
                          style={{ color: isActive ? '#16a34a' : '#dc2626', fontWeight: 600 }}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="text-muted">{formatLastActive(user.lastActive)}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="action-btn assign-role-btn"
                            onClick={() => handleOpenRoleModal(user)}
                          >
                            👤 Assign Role
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

        {/* Table Footer & Pagination */}
        <div className="table-pagination">
          <span className="pagination-text">
            {filteredUsers.length === 0
              ? 'No users to show'
              : `Showing ${startIndex + 1} to ${Math.min(startIndex + itemsPerPage, filteredUsers.length)} of ${filteredUsers.length} users`}
          </span>
          <div className="pagination-buttons">
            <button 
              className="page-btn" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            >
              Prev
            </button>
            <button className="page-btn active">{currentPage}</button>
            <button 
              className="page-btn" 
              disabled={currentPage === totalPages || filteredUsers.length === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Assign Role Modal */}
      {roleModalUser && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Assign Role</h3>
            <p className="confirm-text">
              Select a new role for <strong>{roleModalUser.name || roleModalUser.email}</strong>:
            </p>
            
            <div style={{ margin: '16px 0' }}>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.875rem'
                }}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                disabled={isUpdatingRole}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger-solid"
                style={{ background: '#7c3aed' }}
                onClick={handleSaveRole}
                disabled={isUpdatingRole}
              >
                {isUpdatingRole ? 'Saving…' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MisUserManagement;