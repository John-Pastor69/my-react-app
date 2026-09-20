import { Search, Bell, Menu } from 'lucide-react';
import '../styles/TopBar.scss';

const TopBar = ({toggleSidebar}) => {
  return (
    <header className="topbar">
      <div className="header-titles">
        <button className="mobile-menu-btn" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>

        <h1>Dashboard</h1>
      </div>

      <div className="header-actions">
        <div className="search-container">
          <Search className="search-icon" size={18} />
          <input type="text" placeholder="Search requests..." />
        </div>

        <button className="notification-btn">
          <Bell size={20} />
          <span className="notification-dot"></span>
        </button>

        <div className="divider"></div>

        <div className="user-profile">
          <img 
            src="https://ui-avatars.com/api/?name=Marcus+Reid&background=0D8ABC&color=fff" 
            alt="User Profile" 
            className="avatar" 
          />
          <div className="user-info">
            <span className="user-name">Marcus Reid</span>
            <span className="user-role">Building Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;