import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db, auth } from '../../Firebase';
import "../../styles/mis/MisUserManagement.scss";
  
const ROLE_OPTIONS = [
  { value: 'mis', label: 'MIS' },
  { value: 'building admin', label: 'Building Admin' },
  { value: 'school admin', label: 'School Admin' },
  { value: 'room checker', label: 'Room Checker' },
  { value: 'academic head', label: 'Academic Head' },
  { value: 'endorser', label: 'Endorser' },
  { value: 'osa', label: 'OSA' },
  { value: 'requestor', label: 'Requestor' }
];

const ROLE_LABELS = {
  'mis': 'MIS',
  'mis admin': 'MIS',
  'building admin': 'Building Admin',
  'school admin': 'School Admin',
  'room checker': 'Room Checker',
  'academic head': 'Academic Head',
  'endorser': 'Endorser',
  'osa': 'OSA',
  'requestor': 'Requestor',
  'user': 'Requestor'
};

const ADMIN_ROLES = ['mis', 'mis admin'];

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

const MisUserManagement = ({ currentUserRole }) => {
  const [usersData, setUsersData] = useState([]);
  const [searchQuery, setSearchQuery] = useState(''); // Added search state
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const [roleModalUser, setRoleModalUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('requestor');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return; // Added safeguard

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => {
            const data = d.data();
            let rawName = (data.name || '').trim();
            let title = '';

            // 1. Detect title robustly (case-insensitive) and extract it
            if (/faculty/i.test(rawName)) {
              title = '(Faculty)';
              rawName = rawName.replace(/\(?faculty\)?/gi, ''); // Removes the word and optional parentheses
            } else if (/student/i.test(rawName)) {
              title = '(Student)';
              rawName = rawName.replace(/\(?student\)?/gi, '');
            }

            // 2. Clean up any trailing commas or stray punctuation left behind
            rawName = rawName.replace(/,\s*$/, '').replace(/,\s*,/g, ',').trim();

            // 3. Reverse "Last, First" if a comma still exists
            if (rawName.includes(',')) {
              const parts = rawName.split(',');
              const lastName = parts[0].trim();
              // Join the rest safely in case there were multiple commas
              const firstNames = parts.slice(1).join(' ').trim();
              rawName = `${firstNames} ${lastName}`;
            }

            // 4. Combine name and title, collapsing any accidental double spaces
            let finalName = title ? `${rawName} ${title}` : rawName;
            finalName = finalName.replace(/\s+/g, ' ').trim();

            return { id: d.id, ...data, name: finalName };
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
  }, [currentUser]);

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

  // Filter users based on search query
  const filteredUsers = usersData.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      (user.name && user.name.toLowerCase().includes(query)) ||
      (user.email && user.email.toLowerCase().includes(query)) ||
      (user.role && user.role.toLowerCase().includes(query)) ||
      (user.officeLocation && user.officeLocation.toLowerCase().includes(query))
    );
  });

  const totalUsers = usersData.length;
  const activeUsers = usersData.filter((u) => getDynamicStatus(u) === 'Active').length;
  const totalAdmins = usersData.filter((u) => ADMIN_ROLES.includes(u.role?.toLowerCase().trim())).length;

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
              <input 
                type="text" 
                placeholder="Search users..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {actionError && <div className="error-banner">{actionError}</div>}

        <div className="table-scroll-wrapper">
          <table className="user-table">
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
              {isLoading || loadError || filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state-cell">
                    <div className="empty-state">
                      <span className="empty-state-icon">{loadError ? '⚠️' : '👥'}</span>
                      <p className="empty-state-title">
                        {isLoading ? 'Loading users…' : loadError ? 'Something went wrong' : 'No users found'}
                      </p>
                      <p className="empty-state-subtitle">
                        {isLoading
                          ? 'Fetching the latest users from the database.'
                          : loadError || (searchQuery ? 'Try adjusting your search filters.' : 'Users will appear here once they are registered.')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const status = getDynamicStatus(user);
                  const isActive = status === 'Active';
                  
                  return (
                    <tr key={user.id}>
                      <td>
                        <Link
                          className="user-name-cell user-profile-link"
                          to={`/account?userId=${encodeURIComponent(user.id)}`}
                        >
                          {user.avatarUrl ? (
                            <img className="avatar-img" src={user.avatarUrl} alt="" />
                          ) : (
                            <span className="avatar-placeholder">{(user.name || '?').charAt(0)}</span>
                          )}
                          <span className="user-name-copy">
                            <span className="user-title">{user.name || 'Unnamed User'}</span>
                            <span className="user-email">{user.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className={`role-badge ${roleBadgeClass(user.role)}`}>
                          {formatRole(user.role)}
                        </span>
                      </td>
                      <td>{user.officeLocation || '—'}</td>
                      <td>
                        <span className={`status-dot ${isActive ? 'status-active' : 'status-inactive'}`}>
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
            {filteredUsers.length === 0
              ? 'No users to show'
              : `Showing all ${filteredUsers.length} users`}
          </span>
        </div>
      </div>

      {roleModalUser && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Assign Role</h3>
            <p className="confirm-text">
              Select a new role for <strong>{roleModalUser.name || roleModalUser.email}</strong>:
            </p>
            
            <div className="role-select-wrapper">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="role-select"
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
                className="btn-primary-solid"
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