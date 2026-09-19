import React, { useState } from 'react';
import "../../styles/mis/MisUserManagement.scss";

const MisUserManagement = () => {
  // Initial local state for the user directory — starts empty
  const [usersData, setUsersData] = useState([]);

  // Modal state for adding a new user
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'Requestor',
    department: '',
    status: 'Active'
  });

  const handleAddClick = () => {
    setNewUser({ name: '', email: '', role: 'Requestor', department: '', status: 'Active' });
    setIsAddingNew(true);
  };

  const roleBadgeClass = (role) => {
    if (role === 'MIS Admin') return 'role-admin';
    if (role === 'Approver') return 'role-approver';
    return 'role-requestor';
  };

  const handleSaveNewUser = (e) => {
    e.preventDefault();

    const nextId = usersData.length > 0
      ? Math.max(...usersData.map((u) => u.id)) + 1
      : 1;

    const userToAdd = {
      id: nextId,
      name: newUser.name.trim() || 'Unnamed User',
      email: newUser.email.trim() || 'unknown@facilityres.com',
      role: newUser.role,
      roleClass: roleBadgeClass(newUser.role),
      department: newUser.department.trim() || 'Unassigned',
      status: newUser.status,
      lastActive: 'Just now'
    };

    setUsersData((prevData) => [...prevData, userToAdd]);
    setIsAddingNew(false);
  };

  // Toggle a user's Active / Inactive status directly from the table
  const handleToggleStatus = (id) => {
    setUsersData((prevData) =>
      prevData.map((user) =>
        user.id === id
          ? { ...user, status: user.status === 'Active' ? 'Inactive' : 'Active', lastActive: 'Just now' }
          : user
      )
    );
  };

  // Dynamic summary metrics — all derived from usersData, so they read 0 when empty
  const totalUsers = usersData.length;
  const activeUsers = usersData.filter((u) => u.status === 'Active').length;
  const inactiveUsers = usersData.filter((u) => u.status === 'Inactive').length;
  const totalAdmins = usersData.filter((u) => u.role === 'MIS Admin').length;

  return (
    <div className="user-management-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>All Users</h1>
          <p>{totalUsers} registered users across all roles</p>
        </div>
        <button className="btn-primary" onClick={handleAddClick}>+ Add User</button>
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
            <span className="label">Inactive Users</span>
            <span className="count">{inactiveUsers}</span>
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
            <p>Search, filter and manage all system users</p>
          </div>

          <div className="controls-right">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input type="text" placeholder="Search users..." />
            </div>
            <button className="btn-secondary">⚑ Filter</button>
            <button className="btn-secondary">⭳ Export</button>
          </div>
        </div>

        {/* Users Table */}
        <table className="user-table">
          <thead>
            <tr>
              <th className="checkbox-col"><input type="checkbox" /></th>
              <th>USER</th>
              <th>ROLE</th>
              <th>DEPARTMENT</th>
              <th>STATUS</th>
              <th>LAST ACTIVE</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {usersData.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state-cell">
                  <div className="empty-state">
                    <span className="empty-state-icon">👥</span>
                    <p className="empty-state-title">No users yet</p>
                    <p className="empty-state-subtitle">Add your first user to start managing accounts.</p>
                  </div>
                </td>
              </tr>
            ) : (
              usersData.map((user) => (
                <tr key={user.id}>
                  <td className="checkbox-col"><input type="checkbox" /></td>
                  <td>
                    <div className="user-name-cell">
                      <div className="avatar-placeholder">{user.name.charAt(0)}</div>
                      <div>
                        <div className="user-title">{user.name}</div>
                        <div className="user-email">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`role-badge ${user.roleClass}`}>{user.role}</span></td>
                  <td>{user.department}</td>
                  <td>
                    <span className={`status-dot ${user.status === 'Active' ? 'status-active' : 'status-inactive'}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="text-muted">{user.lastActive}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn">✏ Edit</button>
                      <button className="action-btn assign-role-btn">👤 Assign Role</button>
                      <button className="action-btn" onClick={() => handleToggleStatus(user.id)}>
                        {user.status === 'Active' ? '⊘ Deactivate' : '● Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

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

      {/* Add User Modal */}
      {isAddingNew && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add User</h3>
            <form onSubmit={handleSaveNewUser}>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="e.g. Sarah Lin"
                  required
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="e.g. sarah.lin@facilityres.com"
                  required
                />
              </div>

              <div className="form-group">
                <label>Department</label>
                <input
                  type="text"
                  value={newUser.department}
                  onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                  placeholder="e.g. Engineering"
                  required
                />
              </div>

              <div className="form-group">
                <label>Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="Requestor">Requestor</option>
                  <option value="Approver">Approver</option>
                  <option value="MIS Admin">MIS Admin</option>
                </select>
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={newUser.status}
                  onChange={(e) => setNewUser({ ...newUser, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setIsAddingNew(false)}>Cancel</button>
                <button type="submit" className="btn-save">Add User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// This exact line is required for React.lazy() to work
export default UserManagement;
