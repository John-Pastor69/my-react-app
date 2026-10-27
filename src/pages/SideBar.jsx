import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth'; 
import { doc, updateDoc } from 'firebase/firestore'; 
import { auth, db } from '../Firebase';
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
import '../styles/SideBar.scss'; 

// Roles that have elevated access beyond a standard requestor
const ELEVATED_ROLES = [
  'endorser', 
  'building admin', 
  'osa', 
  'mis', 
  'room checker',
  'academic head', 
  'school admin',
  'super admin'
];

// Roles with specific management tabs (Both MIS and Building Admin see all management tabs)
const FACILITY_ADMIN_ROLES = ['building admin', 'mis', 'mis admin', 'super admin'];
const SYSTEM_ADMIN_ROLES = ['mis', 'mis admin', 'building admin', 'super admin'];

const Sidebar = ({isOpen, setIsOpen, onLogout, userRole}) => {
  const normalizedRole = (userRole || '').toLowerCase().trim().replace(/_/g, ' ');

  const handleSignOut = async () => {
    try {
      if (auth.currentUser) {
        // --- LOGOUT TARGET UPDATED HERE ---
        // Determine target collection based on userRole
        const targetCollection = normalizedRole === 'super admin' ? 'super_users' : 'users';
        
        const userRef = doc(db, targetCollection, auth.currentUser.uid);
        await updateDoc(userRef, {
          status: 'Inactive',
          lastActive: new Date().toISOString()
        });
      }
      
      // Tell App.jsx to handle the unmounting and logout sequence
      onLogout();          
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="mobile-sidebar-header">
        <span className="mobile-menu-text">Menu</span>
        <div className="mobile-sidebar-search" id="sidebar-mobile-search" />
        <button className="close-btn" onClick={() => setIsOpen(false)}>
          <X size={28} />
        </button>
      </div>
      
      {/* Brand Header */}        
      <div className="sidebar-header">
        <div className="brand-icon">F</div>
        <h2 className="brand-name">STI Global</h2>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        
        {/* --- DASHBOARD (Hidden from Requestor) --- */}
        {ELEVATED_ROLES.includes(normalizedRole) && (
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
        {ELEVATED_ROLES.includes(normalizedRole) && (
          <NavLink to="/approval" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
            <CheckCircle2 className="nav-icon" size={20} />
            <span className="nav-label">Approval</span>
          </NavLink>
        )}

        {/* --- FACILITY MANAGEMENT (Building Admin & MIS) --- */}
        {FACILITY_ADMIN_ROLES.includes(normalizedRole) && (
          <NavLink to="/facility" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setIsOpen(false)}>
            <Building className="nav-icon" size={20} />
            <span className="nav-label">Facilities</span>
          </NavLink>
        )}

        {/* --- SYSTEM MANAGEMENT (MIS & Building Admin) --- */}
        {SYSTEM_ADMIN_ROLES.includes(normalizedRole) && (
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