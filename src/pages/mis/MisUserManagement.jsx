import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../Firebase';
import "../../styles/mis/MisUserManagement.scss";

const ROLE_OPTIONS = [
  { value: 'mis', label: 'MIS Admin' },
  { value: 'building admin', label: 'Building Admin' },
  { value: 'school admin', label: 'School Admin' },
  { value: 'academic head', label: 'Academic Head' },
  { value: 'endorser', label: 'Endorser' },
  { value: 'osa', label: 'OSA' },
  { value: 'requestor', label: 'Requestor' }
];

const ROLE_LABELS = {
  'mis': 'MIS Admin',
  'mis admin': 'MIS Admin',
  'building admin': 'Building Admin',
  'school admin': 'School Admin',
  'academic head': 'Academic Head',
  'endorser': 'Endorser',
  'osa': 'OSA',
  'requestor': 'Requestor',
  'user': 'Requestor'
};

const ADMIN_ROLES = ['mis', 'mis admin', 'building admin', 'school admin'];

const formatRole = (role) => {
  if (!role) return 'Requestor';
  const cleanKey = role.toLowerCase().trim().replace(/_/g, ' ');
  if (ROLE_LABELS[cleanKey]) return ROLE_LABELS[cleanKey];
  return cleanKey;
};

const roleBadgeClass = (role) => {
  const cleanRole = (role || '').toLowerCase();
  if (cleanRole === 'mis' || cleanRole.includes('admin')) return 'role-admin';
  if (!cleanRole || cleanRole === 'requestor' || cleanRole === 'user') return 'role-requestor';
  return 'role-approver';
};

// --- DYNAMIC HEARTBEAT STATUS CHECKER ---
const getDynamicStatus = (user) => {
  if (!user.lastActive) return 'Inactive';
  
  let lastActiveDate;
  if (typeof user.lastActive.toDate === 'function') {
    lastActiveDate = user.lastActive.toDate();
  } else {
    lastActiveDate = new Date(user.lastActive);
  }

  const now = new Date();
  const diffInMs = now - lastActiveDate;
  const twoMinutesInMs = 2 * 60 * 1000;

  if (diffInMs < twoMinutesInMs && user.status !== 'Inactive') {
    return 'Active';
  }
  return 'Inactive';
};

const MisUserManagement = () => {
  const [usersData, setUsersData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const [roleModalUser, setRoleModalUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('requestor');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => {
            const data = d.data();
            // Automatically strip out "(Student)" from the name
            let cleanName = data.name || '';
            cleanName = cleanName.replace(/\s*\(Student\)/i, '').trim();

            return { id: d.id, ...data, name: cleanName };
          })
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
    
    let currentRole = user.role ? user.role.replace(/_/g, ' ').toLowerCase().trim() : 'requestor';
    
    if (currentRole.includes('mis')) {
      currentRole = 'mis';
    } else if (currentRole === 'user') {
      currentRole = 'requestor';
    }

    setSelectedRole(currentRole);
  };

  const handleSaveRole = async () => {
    if (!roleModalUser) return;

    try {
      setIsUpdatingRole(true);
      setActionError('');

      let roleToSave = selectedRole.toLowerCase().trim();
      if (roleToSave === 'mis admin' || roleToSave.includes('mis')) {
        roleToSave = 'mis';
      }

      await updateDoc(doc(db, 'users', roleModalUser.id), {
        role: roleToSave
      });

      setRoleModalUser(null);
    } catch (error) {
      console.error('Failed to update role:', error);
      setActionError('Could not update the user role.');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const totalUsers = usersData.length;
  const activeUsers = usersData.filter((u) => getDynamicStatus(u) === 'Active').length;
  const totalAdmins = usersData.filter((u) => ADMIN_ROLES.includes(u.role?.toLowerCase())).length;

  return (
    <div className="user-management-content">
      <div className="page-header">
        <div>
          <h1>All Users</h1>
        </div>
      </div>

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
          </div>
        </div>

        {actionError && <div className="error-banner">{actionError}</div>}

        {/* Added overflow-x to ensure the table can scroll horizontally without squishing */}
        <div className="table-scroll-wrapper" style={{ overflowX: 'auto' }}>
          <table className="user-table" style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th>USER</th>
                <th>ROLE</th>
                <th>OFFICE LOCATION</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || loadError || usersData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state-cell">
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
                  const status = getDynamicStatus(user);
                  const isActive = status === 'Active';
                  
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
                          {formatRole(user.role)}
                        </span>
                      </td>
                      <td>{user.officeLocation || '—'}</td>
                      <td>
                        <span 
                          className="status-dot"
                          style={{ 
                            color: isActive ? '#16a34a' : '#dc2626', 
                            fontWeight: 600 
                          }}
                        >
                          {status}
                        </span>
                      </td>
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