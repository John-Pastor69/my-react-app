import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CheckCircle2, 
  Calendar, 
  Briefcase, 
  Users, 
  User, 
  LogOut 
} from 'lucide-react';
import '../styles/Sidebar.scss'; 

const Sidebar = () => {
  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="brand-icon">F</div>
        <h2 className="brand-name">FacilityRes</h2>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        <NavLink 
          to="/dashboard" 
          className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
        >
          <LayoutDashboard className="nav-icon" size={20} />
          <span className="nav-label">Dashboard</span>
        </NavLink>

        <NavLink 
          to="/approvals" 
          className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
        >
          <CheckCircle2 className="nav-icon" size={20} />
          <span className="nav-label">Approvals</span>
        </NavLink>

        <NavLink 
          to="/calendar" 
          className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
        >
          <Calendar className="nav-icon" size={20} />
          <span className="nav-label">Calendar</span>
        </NavLink>

        <NavLink 
          to="/equipment" 
          className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
        >
          <Briefcase className="nav-icon" size={20} />
          <span className="nav-label">Equipment</span>
        </NavLink>

        <NavLink 
          to="/users" 
          className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
        >
          <Users className="nav-icon" size={20} />
          <span className="nav-label">Users</span>
        </NavLink>

        <NavLink 
          to="/account" 
          className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
        >
          <User className="nav-icon" size={20} />
          <span className="nav-label">Account</span>
        </NavLink>
      </nav>

      {/* Footer Actions */}
      <div className="sidebar-footer">
        <button className="sign-out-btn" onClick={() => {/* Handle Firebase Sign Out */}}>
          <LogOut className="nav-icon" size={20} />
          <span className="nav-label">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;