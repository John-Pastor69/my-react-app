import React, { useState, useEffect } from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../Firebase'; 
import '../styles/Topbar.scss'; 

const TopBar = ({ toggleSidebar }) => {
  const [userData, setUserData] = useState({
    displayName: 'Loading...',
    avatarName: 'User',
    role: '...',
    avatarUrl: null
  });

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        
        const unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const rawName = data.name || '';
            
            let finalDisplayName = rawName;
            let finalAvatarName = rawName.replace(/ /g, '+');

            // Apply the exact same name cleanup logic used in MisProfile
            if (rawName.includes(',')) {
              const nameParts = rawName.split(',');
              const parsedLastName = nameParts[0].trim();
              const parsedFirstName = (nameParts[1] || '').replace(/\s*\(.*\)$/, '').trim();
              
              finalDisplayName = `${parsedFirstName} ${parsedLastName}`;
              finalAvatarName = `${parsedFirstName}+${parsedLastName}`;
            }

            setUserData({
              displayName: finalDisplayName,
              avatarName: finalAvatarName,
              role: data.role ? data.role : 'Requestor',
              avatarUrl: data.avatarUrl || null
            });
          }
        });

        return () => unsubscribeSnapshot();
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <header className="topbar">
      <div className="header-titles">
        <button className="mobile-menu-btn" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
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
            src={
              userData.avatarUrl || 
              `https://ui-avatars.com/api/?name=${userData.avatarName}&background=1E293B&color=fff`
            } 
            alt="User Profile" 
            className="avatar" 
            style={{ objectFit: 'cover' }} 
          />
          <div className="user-info">
            <span className="user-name">{userData.displayName}</span>
            <span className="user-role" style={{ textTransform: 'capitalize' }}>
              {userData.role}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;