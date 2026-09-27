import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth'; 
import { auth } from '../Firebase';
import { 
  LayoutDashboard, 
  PlusCircle, 
  List,       
  CheckCircle2, 
  Building,   
  Package,    
  Users,      
  Calendar, 
  User, 
  LogOut,
  X
} from 'lucide-react';
import '../styles/Sidebar.scss'; 

// Roles that have elevated access beyond a standard requestor
const ELEVATED_ROLES = [
  'endorser', 
  'building admin', 
  'osa', 
  'mis', 
  'academic head', 
  'school admin'
];

// Roles with specific management tabs
const FACILITY_ADMIN_ROLES = ['building admin'];
const SYSTEM_ADMIN_ROLES = ['mis'];

const Sidebar = ({isOpen, setIsOpen, onLogout, userRole}) => {

  const handleSignOut = async () => {
    try {
      await signOut(auth); 
      onLogout();          
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="mobile-sidebar-header">
        <span className="mobile-menu-text">Menu</span>
        <button className="close-btn" onClick={() => setIsOpen(false)}>
          <X size={28} />
        </button>
      </div>
      
      {/* Brand Header */}        
      <div className="sidebar-header">
        <div className="brand-icon">F</div>
        <h2 className="brand-name">FacilityRes</h2>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        
        {/* --- DASHBOARD (Hidden from Requestor) --- */}
        {ELEVATED_ROLES.includes(userRole) && (
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
            <LayoutDashboard className="nav-icon" size={20} />
            <span className="nav-label">Dashboard</span>
          </NavLink>
        )}

        {/* --- BASE TABS (Visible to Everyone) --- */}
        <NavLink to="/reserve" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
          <PlusCircle className="nav-icon" size={20} />
          <span className="nav-label">Reserve</span>
        </NavLink>

        <NavLink to="/schedule" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
          <List className="nav-icon" size={20} />
          <span className="nav-label">Schedule</span>
        </NavLink>

        {/* --- APPROVAL (Hidden from Requestor) --- */}
        {ELEVATED_ROLES.includes(userRole) && (
          <NavLink to="/approval" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
            <CheckCircle2 className="nav-icon" size={20} />
            <span className="nav-label">Approval</span>
          </NavLink>
        )}

        {/* --- FACILITY MANAGEMENT (Only Building Admin) --- */}
        {FACILITY_ADMIN_ROLES.includes(userRole) && (
          <NavLink to="/facility" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
            <Building className="nav-icon" size={20} />
            <span className="nav-label">Facilities</span>
          </NavLink>
        )}

        {/* --- SYSTEM MANAGEMENT (Only MIS) --- */}
        {SYSTEM_ADMIN_ROLES.includes(userRole) && (
          <>
            <NavLink to="/equipment" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
              <Package className="nav-icon" size={20} />
              <span className="nav-label">Equipments</span>
            </NavLink>

            <NavLink to="/user" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
              <Users className="nav-icon" size={20} />
              <span className="nav-label">Users</span>
            </NavLink>
          </>
        )}

        {/* --- OTHER TABS (Visible to Everyone) --- */}
        <NavLink to="/calendar" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
          <Calendar className="nav-icon" size={20} />
          <span className="nav-label">Calendar</span>
        </NavLink>

        <NavLink to="/account" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
          <User className="nav-icon" size={20} />
          <span className="nav-label">Account</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <button className="sign-out-btn" onClick={handleSignOut}>
          <LogOut className="nav-icon" size={20} />
          <span className="nav-label">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;