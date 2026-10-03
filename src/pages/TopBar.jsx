import React, { useState, useEffect, useRef } from 'react';
import { Bell, Menu, Trash2 } from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../Firebase'; 
import PendingRequest from './PendingRequest';
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

// Helper to check if event has expired based on Date, End Time, and Duration (days)
const isExpired = (eventDate, endTime, days = 1) => {
  if (!eventDate) return false;
  const now = new Date();
  let endDateTime;
  
  const [month, day, year] = eventDate.split('/');
  if (!month || !day || !year) return false;

  const parsedDays = parseInt(days, 10) || 1;
  const baseDate = new Date(year, month - 1, day);
  baseDate.setDate(baseDate.getDate() + (parsedDays - 1));

  const endYear = baseDate.getFullYear();
  const endMonth = baseDate.getMonth();
  const endDay = baseDate.getDate();
  
  if (endTime && endTime !== 'N/A') {
    const match = endTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let [ , hours, minutes, modifier ] = match;
      hours = parseInt(hours, 10);
      if (hours === 12 && modifier.toUpperCase() === 'AM') hours = 0;
      if (hours < 12 && modifier.toUpperCase() === 'PM') hours += 12;
      
      endDateTime = new Date(endYear, endMonth, endDay, hours, minutes);
    }
  }
  
  if (!endDateTime) {
    endDateTime = new Date(endYear, endMonth, endDay, 23, 59, 59);
  }

  return now > endDateTime;
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
  const [selectedRequest, setSelectedRequest] = useState(null); 
  const notifRef = useRef(null);

  // Local storage for read notifications persistence
  const [readNotifs, setReadNotifs] = useState(() => {
    const saved = localStorage.getItem('facilityResReadNotifs');
    return saved ? JSON.parse(saved) : [];
  });

  // Local storage for deleted (cleared) notifications
  const [deletedNotifs, setDeletedNotifs] = useState(() => {
    const saved = localStorage.getItem('facilityResDeletedNotifs');
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

  // Process Real-Time Notifications & Persist Auto-Removed
  useEffect(() => {
    if (!userData.role || userData.role === '...' || !auth.currentUser) return;

    const myRoleKey = userData.role.toLowerCase().trim();
    const uid = auth.currentUser.uid;
    const email = auth.currentUser.email;
    let newNotifs = [];

    // Pull previously saved auto-removed notifications to prevent losing them when Schedule.jsx deletes the document
    let currentAutoRemoved = JSON.parse(localStorage.getItem('facilityResAutoRemoved')) || [];
    let autoRemovedChanged = false;

    reservationsData.forEach(res => {
      const requestor = usersData.find(u => u.email === res.userEmail || u.uid === res.userId) || {};
      const reqRole = (requestor.role || 'requestor').toLowerCase().trim();
      const isStaffRequestor = reqRole !== 'requestor' && reqRole !== 'user';
      
      // --- 1. REQUESTOR NOTIFICATIONS ---
      if (res.userId === uid || res.userEmail === email) {
        
        // ---> Auto-Removed Expiration Check
        if (isExpired(res.eventDate, res.endTime, res.days)) {
          const notifId = `${res.id}-auto`;
          if (!currentAutoRemoved.find(n => n.id === notifId)) {
            currentAutoRemoved.push({
              id: notifId,
              type: 'removed',
              title: 'Auto-Removed',
              message: `Your schedule exceeded the given time and/or date for ${res.eventName || 'an event'}.`,
              time: new Date().toISOString(),
              rawDate: new Date().toISOString(),
              fullData: res 
            });
            autoRemovedChanged = true;
          }
        } 
        // Normal Notifications
        else {
          if (res.status === 'Approved') {
            newNotifs.push({
              id: `${res.id}-app`,
              type: 'approved',
              title: 'Approved',
              message: `Your reservation for ${res.eventName || 'an event'} has been approved.`,
              time: res.updatedAt || res.createdAt,
              rawDate: new Date(res.updatedAt || res.createdAt || 0),
              fullData: res 
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
      }

      // --- 2. APPROVER NOTIFICATIONS ---
      const roleHierarchy = ['requestor', 'endorser', 'building admin', 'osa', 'mis', 'academic head', 'school admin'];
      const myIndex = roleHierarchy.indexOf(myRoleKey);
      
      if (myIndex > 0 && res.status !== 'Rejected' && res.status !== 'Approved' && !isExpired(res.eventDate, res.endTime, res.days)) {
        
        if (myRoleKey === 'endorser' && res.endorserEmail !== email) {
          return; 
        }

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

    // Save Auto-Removed to localStorage if new ones were generated
    if (autoRemovedChanged) {
      localStorage.setItem('facilityResAutoRemoved', JSON.stringify(currentAutoRemoved));
    }

    // Combine active database notifications with persisted auto-removed ones
    const combinedNotifs = [...newNotifs, ...currentAutoRemoved].map(n => ({
      ...n,
      // Rehydrate stringified dates back into Date objects for accurate sorting
      rawDate: typeof n.rawDate === 'string' ? new Date(n.rawDate) : n.rawDate 
    }));

    // Filter out notifications that the user explicitly cleared
    const filteredNotifs = combinedNotifs.filter(notif => !deletedNotifs.includes(notif.id));
    
    // Sort newest first
    filteredNotifs.sort((a, b) => b.rawDate - a.rawDate);
    setNotifications(filteredNotifs);
  }, [reservationsData, usersData, userData, deletedNotifs]);

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

  // Click handler: Clears (deletes) all current notifications from view
  const handleClearAllNotifs = () => {
    const allCurrentIds = notifications.map(n => n.id);
    const updatedDeleted = [...new Set([...deletedNotifs, ...allCurrentIds])];
    setDeletedNotifs(updatedDeleted);
    localStorage.setItem('facilityResDeletedNotifs', JSON.stringify(updatedDeleted));
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
                  {notifications.length > 0 && (
                    <button className="clear-all-btn" onClick={handleClearAllNotifs} title="Clear All Notifications">
                      <Trash2 size={18} />
                    </button>
                  )}
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
                          {notif.type === 'removed' && <div className="notif-avatar bg-red">!</div>}
                          
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

      {/* --- MODAL POPUP --- */}
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
                    <PendingRequest data={selectedRequest} />
                </div>
            </div>
        </div>
      )}
    </>
  );
};

export default TopBar;