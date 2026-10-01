import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../Firebase'; 
import PendingRequest from './PendingRequest'; // Import the details modal component
import '../styles/Topbar.scss'; 

// Helper function to format timestamp into "X ago"
const timeAgo = (dateInput) => {
  if (!dateInput) return 'Just now';
  const date = new Date(dateInput);
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
};

const TopBar = ({ toggleSidebar }) => {
  const [userData, setUserData] = useState({
    displayName: 'Loading...',
    avatarName: 'User',
    role: '...',
    avatarUrl: null
  });
  
  // Real-time Database State
  const [reservationsData, setReservationsData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  
  // Notification & Modal State
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null); // Controls the popup modal
  const notifRef = useRef(null);

  // Local storage for read notifications persistence
  const [readNotifs, setReadNotifs] = useState(() => {
    const saved = localStorage.getItem('facilityResReadNotifs');
    return saved ? JSON.parse(saved) : [];
  });

  // Derived state: Check if there is AT LEAST ONE unread notification
  const hasUnread = notifications.some(notif => !readNotifs.includes(notif.id));

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Current User Identity
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

            if (rawName.includes(',')) {
              const nameParts = rawName.split(',');
              const parsedLastName = nameParts[0].trim();
              const parsedFirstName = (nameParts[1] || '').replace(/\s*\(.*\)$/, '').trim();
              
              finalDisplayName = `${parsedFirstName} ${parsedLastName}`;
              finalAvatarName = `${parsedFirstName}+${parsedLastName}`;
            }

            let fetchedRole = data.role ? data.role : 'Requestor';
            const lowerRole = fetchedRole.toLowerCase();
            
            if (lowerRole === 'mis') fetchedRole = 'MIS';
            else if (lowerRole === 'osa') fetchedRole = 'OSA';

            setUserData({
              displayName: finalDisplayName,
              avatarName: finalAvatarName,
              role: fetchedRole,
              avatarUrl: data.avatarUrl || null
            });
          }
        });
        return () => unsubscribeSnapshot();
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Fetch Global Reservations & Users for Notification Logic
  useEffect(() => {
    const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      setReservationsData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsersData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubRes();
      unsubUsers();
    };
  }, []);

  // Process Real-Time Notifications
  useEffect(() => {
    if (!userData.role || userData.role === '...' || !auth.currentUser) return;

    const myRoleKey = userData.role.toLowerCase().trim();
    const uid = auth.currentUser.uid;
    const email = auth.currentUser.email;
    let newNotifs = [];

    reservationsData.forEach(res => {
      const requestor = usersData.find(u => u.email === res.userEmail || u.uid === res.userId) || {};
      const reqRole = (requestor.role || 'requestor').toLowerCase().trim();
      const isStaffRequestor = reqRole !== 'requestor' && reqRole !== 'user';
      
      // --- 1. REQUESTOR NOTIFICATIONS ---
      if (res.userId === uid || res.userEmail === email) {
        if (res.status === 'Approved') {
          newNotifs.push({
            id: `${res.id}-app`,
            type: 'approved',
            title: 'Approved',
            message: `Your reservation for ${res.eventName || 'an event'} has been approved.`,
            time: res.updatedAt || res.createdAt,
            rawDate: new Date(res.updatedAt || res.createdAt || 0),
            fullData: res // Attach full data for the modal
          });
        } else if (res.status === 'Rejected') {
          newNotifs.push({
            id: `${res.id}-rej`,
            type: 'rejected',
            title: 'Rejected',
            message: `Your request for ${res.eventName || 'an event'} was declined.`,
            time: res.updatedAt || res.createdAt,
            rawDate: new Date(res.updatedAt || res.createdAt || 0),
            fullData: res
          });
        }
      }

      // --- 2. APPROVER NOTIFICATIONS ---
      const roleHierarchy = ['requestor', 'endorser', 'building admin', 'osa', 'mis', 'academic head', 'school admin'];
      const myIndex = roleHierarchy.indexOf(myRoleKey);
      
      if (myIndex > 0 && res.status !== 'Rejected' && res.status !== 'Approved') {
        const hasEndorser = !!res.endorserName;
        let isMyTurn = false;
        
        if (myRoleKey === 'endorser' && isStaffRequestor) {
          isMyTurn = false;
        } else {
          const myRecord = res.approvals?.[myRoleKey];
          if (!myRecord || myRecord.status === 'pending') {
            const prevStepKey = roleHierarchy[myIndex - 1];
            let prevIsApproved = false;

            if (prevStepKey === 'requestor') {
              prevIsApproved = true;
            } else if (prevStepKey === 'endorser') {
              if (isStaffRequestor || !hasEndorser) prevIsApproved = true;
              else prevIsApproved = res.approvals?.['endorser']?.status === 'approved';
            } else {
              prevIsApproved = res.approvals?.[prevStepKey]?.status === 'approved';
            }
            isMyTurn = prevIsApproved;
          }
        }

        if (isMyTurn) {
          newNotifs.push({
            id: `${res.id}-act`,
            type: 'action',
            title: 'Action Required',
            message: `A new reservation request (${res.eventName || 'Untitled'}) requires your endorsement/approval.`,
            time: res.createdAt,
            rawDate: new Date(res.createdAt || 0),
            fullData: res
          });
        }
      }
    });

    // Sort newest first
    newNotifs.sort((a, b) => b.rawDate - a.rawDate);
    setNotifications(newNotifs);
  }, [reservationsData, usersData, userData]);

  // Click handler: Opens modal and marks notification as read
  const handleNotifItemClick = (notif) => {
    // Mark as read if it isn't already
    if (!readNotifs.includes(notif.id)) {
      const updatedReadNotifs = [...readNotifs, notif.id];
      setReadNotifs(updatedReadNotifs);
      localStorage.setItem('facilityResReadNotifs', JSON.stringify(updatedReadNotifs));
    }
    
    // Set data for the modal and close the dropdown
    setSelectedRequest(notif.fullData);
    setIsNotifOpen(false);
  };

  return (
    <>
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

          {/* Notification Wrapper */}
          <div className="notification-wrapper" ref={notifRef}>
            <button 
              className="notification-btn" 
              title="Notifications" 
              onClick={() => setIsNotifOpen(!isNotifOpen)}
            >
              <Bell size={20} />
              {hasUnread && <span className="notification-dot"></span>}
            </button>

            {/* Dropdown Window */}
            {isNotifOpen && (
              <div className="notification-dropdown">
                <div className="dropdown-header">
                  <h3>Notifications</h3>
                </div>
                
                <div className="dropdown-body">
                  {notifications.length > 0 ? (
                    notifications.map(notif => {
                      const isRead = readNotifs.includes(notif.id);

                      return (
                        <div 
                          key={notif.id} 
                          className={`notif-item ${isRead ? 'read' : 'unread'}`}
                          onClick={() => handleNotifItemClick(notif)}
                        >
                          {notif.type === 'approved' && <div className="notif-avatar bg-green">✓</div>}
                          {notif.type === 'action' && <div className="notif-avatar bg-blue">ℹ</div>}
                          {notif.type === 'rejected' && <div className="notif-avatar bg-red">✕</div>}
                          
                          <div className="notif-content">
                            <p><strong>{notif.title}:</strong> {notif.message.replace(`${notif.title}:`, '')}</p>
                            <span>{timeAgo(notif.time)}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="notif-item" style={{ justifyContent: 'center', padding: '2rem' }}>
                      <span style={{ color: '#64748b' }}>No new notifications</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

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

      {/* --- MODAL POPUP (Rendered outside header layout flow) --- */}
      {selectedRequest && (
        <div className="topbar-modal-overlay"> 
            <div className="modal-wrapper">
                <button
                    type="button"
                    className="close-modal-btn"
                    onClick={() => setSelectedRequest(null)}
                    aria-label="Close"
                >
                    ✕
                </button>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    {/* Render the details using your existing component */}
                    <PendingRequest data={selectedRequest} />
                </div>
            </div>
        </div>
      )}
    </>
  );
};

export default TopBar;