import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db, auth } from '../../Firebase';
import { DEFAULT_COURSE_OPTIONS, DEFAULT_DEPARTMENT_OPTIONS } from '../../services/signupOptions';
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
  const storedStatus = (user.status || '').toLowerCase().trim();
  if (storedStatus === 'blocked') return 'Blocked';
  if (storedStatus === 'offline' || storedStatus === 'inactive') return 'Offline';
  if (!user.lastActive) return 'Offline';
  
  let lastActiveDate;
  if (typeof user.lastActive.toDate === 'function') {
    lastActiveDate = user.lastActive.toDate();
  } else {
    lastActiveDate = new Date(user.lastActive);
  }

  const now = new Date();
  const diffInMs = now - lastActiveDate;
  const twoMinutesInMs = 2 * 60 * 1000;

  if (diffInMs < twoMinutesInMs) {
    return 'Online';
  }
  return 'Offline';
};

const formatTimeCreated = (value) => {
  if (!value) return '—';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const getCreatedDate = (user) => {
  const value = user.timeCreated || user.createdAt;
  if (!value) return null;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const cloneOptionGroups = (groups) => groups.map((group) => ({
  ...group,
  options: group.options.map((option) => ({ ...option }))
}));

const MisUserManagement = ({ currentUserRole }) => {
  const [usersData, setUsersData] = useState([]);
  const [searchQuery, setSearchQuery] = useState(''); // Added search state
  const [userFilter, setUserFilter] = useState('all');
  const [unverifiedAgeFilter, setUnverifiedAgeFilter] = useState('all');
  const [unverifiedFilterNow, setUnverifiedFilterNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [courseOptions, setCourseOptions] = useState(() => cloneOptionGroups(DEFAULT_COURSE_OPTIONS));
  const [departmentOptions, setDepartmentOptions] = useState(() => cloneOptionGroups(DEFAULT_DEPARTMENT_OPTIONS));
  const [newSignupOption, setNewSignupOption] = useState({ courses: {}, departments: {} });
  const [newSignupGroup, setNewSignupGroup] = useState({ courses: '', departments: '' });
  const [isSavingSignupOptions, setIsSavingSignupOptions] = useState(false);
  const [signupOptionsError, setSignupOptionsError] = useState('');

  const [roleModalUser, setRoleModalUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('requestor');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [updatingBlockUserId, setUpdatingBlockUserId] = useState(null);

  const [currentUser, setCurrentUser] = useState(null);
  const normalizedCurrentUserRole = (currentUserRole || '').toLowerCase().trim().replace(/_/g, ' ');
  const isSuperAdmin = normalizedCurrentUserRole === 'super admin';

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;

    return onSnapshot(
      doc(db, 'app_settings', 'signupOptions'),
      (snapshot) => {
        const data = snapshot.data() || {};
        const nextCourses = Array.isArray(data.courses) ? data.courses : DEFAULT_COURSE_OPTIONS;
        const nextDepartments = Array.isArray(data.departments) ? data.departments : DEFAULT_DEPARTMENT_OPTIONS;
        setCourseOptions(cloneOptionGroups(nextCourses));
        setDepartmentOptions(cloneOptionGroups(nextDepartments));
        setSignupOptionsError('');
      },
      (error) => {
        console.error('Failed to load signup options:', error);
        setSignupOptionsError('Could not load signup options. Check Firestore access and try again.');
      }
    );
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!currentUser) return; // Added safeguard

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => {
            const data = d.data();
            if ((data.role || '').toLowerCase().trim().replace(/_/g, ' ') === 'super admin') {
              return null;
            }
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
          .filter(Boolean)
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

  const handleToggleBlock = async (user) => {
    if (user.id === currentUser?.uid) {
      setActionError('You cannot block your own account.');
      return;
    }

    const isBlocked = (user.status || '').toLowerCase().trim() === 'blocked';
    const action = isBlocked ? 'unblock' : 'block';
    const confirmation = isBlocked
      ? `Unblock ${user.name || user.email}? They will be able to sign in again.`
      : `Block ${user.name || user.email}? They will not be able to sign in until an administrator unblocks the account.`;

    if (!window.confirm(confirmation)) return;

    try {
      setUpdatingBlockUserId(user.id);
      setActionError('');
      await updateDoc(doc(db, 'users', user.id), {
        status: isBlocked ? 'Offline' : 'Blocked'
      });
    } catch (error) {
      console.error(`Failed to ${action} user account:`, error);
      setActionError(`Could not ${action} this user account. Please try again.`);
    } finally {
      setUpdatingBlockUserId(null);
    }
  };

  const handleDeleteUnverifiedUser = async (user) => {
    if (!isSuperAdmin || user.emailVerified !== false) return;

    const confirmed = window.confirm(
      `Delete the Firestore profile for ${user.name || user.email || 'this user'}? This does not delete their Firebase Authentication account.`
    );
    if (!confirmed) return;

    try {
      setDeletingUserId(user.id);
      setActionError('');
      await deleteDoc(doc(db, 'users', user.id));
    } catch (error) {
      console.error('Failed to delete unverified user profile:', error);
      setActionError('Could not delete this user profile. Please try again.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleUpdateSignupOption = (type, groupIndex, optionIndex, field, value) => {
    const setOptions = type === 'courses' ? setCourseOptions : setDepartmentOptions;
    setOptions((groups) => groups.map((group, currentGroupIndex) => (
      currentGroupIndex !== groupIndex
        ? group
        : {
          ...group,
          options: group.options.map((option, currentOptionIndex) => (
            currentOptionIndex === optionIndex ? { ...option, [field]: value } : option
          ))
        }
    )));
  };

  const handleUpdateSignupGroup = (type, groupIndex, value) => {
    const setOptions = type === 'courses' ? setCourseOptions : setDepartmentOptions;
    setOptions((groups) => groups.map((group, currentGroupIndex) => (
      currentGroupIndex === groupIndex ? { ...group, group: value } : group
    )));
  };

  const handleAddSignupGroup = (type) => {
    const groupName = newSignupGroup[type].trim();
    if (!groupName) return;

    const groups = type === 'courses' ? courseOptions : departmentOptions;
    if (groups.some((group) => group.group.trim().toLowerCase() === groupName.toLowerCase())) {
      setSignupOptionsError('Group names must be unique within each category.');
      return;
    }

    const setOptions = type === 'courses' ? setCourseOptions : setDepartmentOptions;
    setOptions((currentGroups) => [...currentGroups, { group: groupName, options: [] }]);
    setNewSignupGroup((current) => ({ ...current, [type]: '' }));
    setNewSignupOption((current) => ({ ...current, [type]: {} }));
    setSignupOptionsError('');
  };

  const handleRemoveSignupGroup = (type, groupIndex) => {
    const setOptions = type === 'courses' ? setCourseOptions : setDepartmentOptions;
    setOptions((groups) => groups.filter((_, currentGroupIndex) => currentGroupIndex !== groupIndex));
    setNewSignupOption((current) => ({ ...current, [type]: {} }));
  };

  const handleAddSignupOption = (type, groupIndex) => {
    const value = newSignupOption[type][groupIndex]?.trim();
    if (!value) return;

    const setOptions = type === 'courses' ? setCourseOptions : setDepartmentOptions;
    setOptions((groups) => groups.map((group, currentGroupIndex) => (
      currentGroupIndex === groupIndex
        ? { ...group, options: [...group.options, { value, label: value }] }
        : group
    )));
    setNewSignupOption((current) => ({
      ...current,
      [type]: { ...current[type], [groupIndex]: '' }
    }));
  };

  const handleRemoveSignupOption = (type, groupIndex, optionIndex) => {
    const setOptions = type === 'courses' ? setCourseOptions : setDepartmentOptions;
    setOptions((groups) => groups.map((group, currentGroupIndex) => (
      currentGroupIndex === groupIndex
        ? { ...group, options: group.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex) }
        : group
    )));
  };

  const handleSaveSignupOptions = async () => {
    const optionGroups = [...courseOptions, ...departmentOptions];
    const hasEmptyOrDuplicateGroupNames = [courseOptions, departmentOptions].some((groups) => {
      const names = groups.map((group) => group.group.trim().toLowerCase());
      return names.some((name) => !name) || new Set(names).size !== names.length;
    });
    const hasEmptyOptions = optionGroups.some((group) => (
      group.options.some((option) => !option.value.trim() || !option.label.trim())
    ));
    if (hasEmptyOrDuplicateGroupNames) {
      setSignupOptionsError('Each group needs a unique name within its category.');
      return;
    }
    if (hasEmptyOptions) {
      setSignupOptionsError('Each course and department option needs both a value and a display name.');
      return;
    }

    try {
      setIsSavingSignupOptions(true);
      setSignupOptionsError('');
      await setDoc(doc(db, 'app_settings', 'signupOptions'), {
        courses: courseOptions,
        departments: departmentOptions
      }, { merge: true });
    } catch (error) {
      console.error('Failed to save signup options:', error);
      setSignupOptionsError('Could not save signup options. Please try again.');
    } finally {
      setIsSavingSignupOptions(false);
    }
  };

  // Filter users based on search query
  const filteredUsers = usersData.filter((user) => {
    if (isSuperAdmin && userFilter === 'unverified' && user.emailVerified !== false) return false;
    if (isSuperAdmin && userFilter === 'unverified' && unverifiedAgeFilter !== 'all') {
      const createdDate = getCreatedDate(user);
      const minimumAgeMs = Number(unverifiedAgeFilter) * 24 * 60 * 60 * 1000;
      if (!createdDate || unverifiedFilterNow - createdDate.getTime() < minimumAgeMs) return false;
    }

    const query = searchQuery.toLowerCase();
    return (
      (user.name && user.name.toLowerCase().includes(query)) ||
      (user.email && user.email.toLowerCase().includes(query)) ||
      (user.role && user.role.toLowerCase().includes(query)) ||
      (user.department && user.department.toLowerCase().includes(query)) ||
      (user.course && user.course.toLowerCase().includes(query))
    );
  });

  const totalUsers = usersData.length;
  const activeUsers = usersData.filter((u) => getDynamicStatus(u) === 'Online').length;
  const totalAdmins = usersData.filter((u) => ADMIN_ROLES.includes(u.role?.toLowerCase().trim())).length;

  // --- ROLE ACCESS CHECK ---
  const allowedRoles = ['mis', 'mis admin', 'building admin', 'super admin'];
  if (!normalizedCurrentUserRole || !allowedRoles.includes(normalizedCurrentUserRole)) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  const renderSignupOptionGroups = (type, groups) => (
    <>
      <div className="signup-option-groups">
        {groups.map((group, groupIndex) => (
          <section className="signup-option-group" key={`${type}-${groupIndex}`}>
            <div className="signup-option-group-heading">
              <label>
                <span>Group name</span>
                <input
                  value={group.group}
                  onChange={(event) => handleUpdateSignupGroup(type, groupIndex, event.target.value)}
                  disabled={isSavingSignupOptions}
                  aria-label={`Group ${groupIndex + 1} name`}
                />
              </label>
              <button
                type="button"
                className="remove-signup-option-btn remove-signup-group-btn"
                onClick={() => handleRemoveSignupGroup(type, groupIndex)}
                disabled={isSavingSignupOptions}
                aria-label={`Remove ${group.group || `group ${groupIndex + 1}`}`}
              >
                Remove group
              </button>
            </div>
            <div className="signup-option-list">
              {group.options.map((option, optionIndex) => (
                <div className="signup-option-row" key={`${groupIndex}-${optionIndex}`}>
                  <label>
                    <span>Value</span>
                    <input
                      value={option.value}
                      onChange={(event) => handleUpdateSignupOption(type, groupIndex, optionIndex, 'value', event.target.value)}
                      disabled={isSavingSignupOptions}
                    />
                  </label>
                  <label>
                    <span>Display name</span>
                    <input
                      value={option.label}
                      onChange={(event) => handleUpdateSignupOption(type, groupIndex, optionIndex, 'label', event.target.value)}
                      disabled={isSavingSignupOptions}
                    />
                  </label>
                  <button
                    type="button"
                    className="remove-signup-option-btn"
                    onClick={() => handleRemoveSignupOption(type, groupIndex, optionIndex)}
                    disabled={isSavingSignupOptions}
                    aria-label={`Remove ${option.label}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="add-signup-option-row">
              <input
                aria-label={`Add option to ${group.group}`}
                placeholder="Add Value"
                value={newSignupOption[type][groupIndex] || ''}
                onChange={(event) => setNewSignupOption((current) => ({
                  ...current,
                  [type]: { ...current[type], [groupIndex]: event.target.value }
                }))}
                disabled={isSavingSignupOptions}
              />
              <button
                type="button"
                className="add-signup-value-btn"
                onClick={() => handleAddSignupOption(type, groupIndex)}
                disabled={isSavingSignupOptions || !newSignupOption[type][groupIndex]?.trim()}
              >
                Add Value
              </button>
            </div>
          </section>
        ))}
      </div>
      <div className="add-signup-option-row add-signup-group-row">
        <input
          aria-label={`Add ${type === 'courses' ? 'course' : 'department'} group`}
          placeholder="Add group"
          value={newSignupGroup[type]}
          onChange={(event) => setNewSignupGroup((current) => ({
            ...current,
            [type]: event.target.value
          }))}
          disabled={isSavingSignupOptions}
        />
        <button
          type="button"
          onClick={() => handleAddSignupGroup(type)}
          disabled={isSavingSignupOptions || !newSignupGroup[type].trim()}
        >
          Add group
        </button>
      </div>
    </>
  );

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
            <span className="label">Online Users</span>
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
            {isSuperAdmin && (
              <select
                className="user-filter-select"
                aria-label="Filter users"
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
              >
                <option value="all">All users</option>
                <option value="unverified">Unverified users</option>
              </select>
            )}
            {isSuperAdmin && userFilter === 'unverified' && (
              <select
                className="user-filter-select"
                aria-label="Filter by days since creation"
                value={unverifiedAgeFilter}
                onChange={(event) => {
                  setUnverifiedFilterNow(Date.now());
                  setUnverifiedAgeFilter(event.target.value);
                }}
              >
                <option value="all">Any age</option>
                <option value="7">7+ days</option>
                <option value="14">14+ days</option>
              </select>
            )}
          </div>
        </div>

        {actionError && <div className="error-banner">{actionError}</div>}

        <div className="table-scroll-wrapper">
          <table className="user-table">
            <thead>
              <tr>
                <th>USER</th>
                <th>ROLE</th>
                <th>DEPARTMENT</th>
                <th>COURSE</th>
                {!isSuperAdmin || userFilter === 'all' ? <th>STATUS</th> : <th>TIME CREATED</th>}
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || loadError || filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state-cell">
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
                  const isActive = status === 'Online';
                  const isBlocked = status === 'Blocked';
                  
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
                      <td>{user.department || '—'}</td>
                      <td>{user.course || '—'}</td>
                      {isSuperAdmin && userFilter === 'unverified' ? (
                        <td>{formatTimeCreated(user.timeCreated || user.createdAt)}</td>
                      ) : (
                        <td>
                          <span className={`status-dot ${isActive ? 'status-active' : 'status-inactive'}`}>
                            {status}
                          </span>
                        </td>
                      )}
                      <td>
                        {isSuperAdmin && userFilter === 'unverified' ? (
                          <button
                            className="action-btn delete-unverified-btn"
                            type="button"
                            onClick={() => handleDeleteUnverifiedUser(user)}
                            disabled={deletingUserId === user.id}
                          >
                            {deletingUserId === user.id ? 'Deleting…' : '⚠ Delete profile'}
                          </button>
                        ) : (
                          <div className="action-buttons">
                            <button
                              className="action-btn assign-role-btn"
                              onClick={() => handleOpenRoleModal(user)}
                            >
                              👤 Assign Role
                            </button>
                            <button
                              className={`action-btn block-user-btn${isBlocked ? ' unblock-user-btn' : ''}`}
                              type="button"
                              onClick={() => handleToggleBlock(user)}
                              disabled={user.id === currentUser?.uid || updatingBlockUserId === user.id}
                              title={user.id === currentUser?.uid ? 'You cannot block your own account.' : undefined}
                            >
                              {updatingBlockUserId === user.id ? 'Updating…' : isBlocked ? 'Unblock' : '⚠ Block'}
                            </button>
                          </div>
                        )}
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

      {isSuperAdmin && (
        <section className="signup-options-container" aria-labelledby="signup-options-title">
          <div className="signup-options-heading">
            <div>
              <h2 id="signup-options-title">Signup Courses and Departments</h2>
              <p>Manage the options shown during Student, Student Leader, Admin Staff, and Faculty signup.</p>
            </div>
            <button
              type="button"
              className="save-signup-options-btn"
              onClick={handleSaveSignupOptions}
              disabled={isSavingSignupOptions}
            >
              {isSavingSignupOptions ? 'Saving…' : 'Save changes'}
            </button>
          </div>
          {signupOptionsError && <div className="error-banner" role="alert">{signupOptionsError}</div>}
          <section className="signup-option-category">
            <h3>Courses (Student and Student Leader)</h3>
            {renderSignupOptionGroups('courses', courseOptions)}
          </section>
          <section className="signup-option-category">
            <h3>Departments (Admin Staff and Faculty)</h3>
            {renderSignupOptionGroups('departments', departmentOptions)}
          </section>
        </section>
      )}

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