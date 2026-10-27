import React, { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CalendarDays, ChevronDown, ChevronUp, Menu, Search, Trash2, UserRound } from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../Firebase'; 
import PendingRequest from './PendingRequest';
import { APPROVAL_ROLE_HIERARCHY, isApprovalStepReady, normalizeApprovalRoleKey } from '../services/approvalWorkflow';
import { archiveExpiredApprovedReservations, isReservationEndReached } from '../services/reservationExpiration';
import '../styles/TopBar.scss'; 

const ReservationDetails = lazy(() => import('./ReservationDetails'));

const timeAgo = (dateInput) => {
  if (!dateInput) return 'Just now';
  const normalizedDateInput = typeof dateInput === 'string'
    ? dateInput.replace(/\s+at\s+/i, ' ')
    : dateInput;
  const date = typeof normalizedDateInput?.toDate === 'function'
    ? normalizedDateInput.toDate()
    : new Date(normalizedDateInput);
  if (Number.isNaN(date.getTime())) return 'Just now';
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 0) return 'Just now';
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

// --- NEW PROPS ADDED HERE ---
const TopBar = ({ toggleSidebar, userRole }) => {
  const navigate = useNavigate();
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [userData, setUserData] = useState({
    displayName: 'Loading...',
    avatarName: 'User',
    role: '...',
    avatarUrl: null
  });
  
  const [reservationsData, setReservationsData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null); 
  const [selectedReservation, setSelectedReservation] = useState(null);
  const notifRef = useRef(null);
  const searchRef = useRef(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(
    () => window.matchMedia('(max-width: 64rem)').matches
  );
  const [mobileSearchContainer, setMobileSearchContainer] = useState(null);

  const [readNotifs, setReadNotifs] = useState(() => {
    const saved = localStorage.getItem('facilityResReadNotifs');
    return saved ? JSON.parse(saved) : [];
  });

  const [deletedNotifs, setDeletedNotifs] = useState(() => {
    const saved = localStorage.getItem('facilityResDeletedNotifs');
    return saved ? JSON.parse(saved) : [];
  });

  const hasUnread = notifications.some(notif => !readNotifs.includes(notif.id));

  const [currentUser, setCurrentUser] = useState(null);
  const archivingReservationsRef = useRef(new Set());
  const normalizedRole = normalizeApprovalRoleKey(userData.role);
  const canOpenDashboardSearch = !['requestor', 'user'].includes(normalizedRole);
  const canSearchUsers = ['mis', 'mis admin', 'building admin', 'super admin'].includes(normalizedRole);
  const globalSearchResults = useMemo(() => {
    const query = globalSearchQuery.trim().toLowerCase();
    if (query.length < 2) return { users: [], reservations: [] };

    const reservations = [...new Map(
      [...historyData, ...reservationsData].map((reservation) => [reservation.id, reservation])
    ).values()].filter((reservation) => {
      const searchableText = [
        reservation.refNo,
        reservation.eventName,
        reservation.title,
        reservation.fullName,
        reservation.userEmail,
        reservation.userRole,
        reservation.endorserName,
        reservation.endorserEmail,
        reservation.eventDate,
        reservation.endDate,
        reservation.startTime,
        reservation.endTime,
        reservation.status,
        reservation.purpose,
        reservation.eventType,
        JSON.stringify(reservation)
      ].filter(Boolean).join(' ').toLowerCase();
      return searchableText.includes(query);
    });
    const users = canSearchUsers
      ? usersData.filter((user) => (
        normalizeApprovalRoleKey(user.role) !== 'super admin'
        && [
          user.name,
          user.email,
          user.phone
        ].filter(Boolean).join(' ').toLowerCase().includes(query)
      ))
      : [];

    return { users, reservations };
  }, [globalSearchQuery, historyData, reservationsData, usersData, canSearchUsers]);
  const openDashboardSearch = () => {
    const query = globalSearchQuery.trim();
    if (!query || !canOpenDashboardSearch) return;
    setIsGlobalSearchOpen(false);
    navigate(`/dashboard?search=${encodeURIComponent(query)}`);
  };

  useEffect(() => {
    const intervalId = setInterval(() => setCurrentDateTime(new Date()), 60_000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 64rem)');
    const updateViewport = () => setIsCompactViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    setMobileSearchContainer(document.getElementById('sidebar-mobile-search'));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsGlobalSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribeAuth();
  }, []);

  // --- IDENTITY FETCH UPDATED HERE ---
  useEffect(() => {
    if (!currentUser) return;

    // Use userRole prop to determine which collection to read from
    const targetCollection = userRole === 'super admin' ? 'super_users' : 'users';
    const docRef = doc(db, targetCollection, currentUser.uid);
    
    const unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Fallback for manual super admin creation (where 'name' might not exist yet)
        const rawName = data.name || (userRole === 'super admin' ? 'Super Admin' : '');
        
        let finalDisplayName = rawName;
        let finalAvatarName = rawName.replace(/ /g, '+');

        if (rawName.includes(',')) {
          const nameParts = rawName.split(',');
          const parsedLastName = nameParts[0].trim();
          const parsedFirstName = (nameParts[1] || '').replace(/\s*\(.*\)$/, '').trim();
          
          finalDisplayName = `${parsedFirstName} ${parsedLastName}`;
          finalAvatarName = `${parsedFirstName}+${parsedLastName}`;
        }

        let fetchedRole = data.role ? data.role : (userRole === 'super admin' ? 'super admin' : 'Requestor');
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
  }, [currentUser, userRole]); // Added userRole to dependencies

  useEffect(() => {
    if (!currentUser) return;

    const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      setReservationsData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubHistory = onSnapshot(collection(db, 'archive'), (snapshot) => {
      setHistoryData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsersData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubRes();
      unsubHistory();
      unsubUsers();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const currentRole = normalizeApprovalRoleKey(userData.role);
    const canArchiveAllReservations = ['mis', 'mis admin', 'building admin', 'super admin'].includes(currentRole);
    const expiredApprovedReservations = reservationsData.filter((reservation) => (
      (reservation.status || '').toLowerCase().trim() === 'approved'
      && isReservationEndReached(reservation, currentDateTime)
      && (
        canArchiveAllReservations
        || reservation.userId === currentUser.uid
        || reservation.userEmail === currentUser.email
      )
      && !archivingReservationsRef.current.has(reservation.id)
    ));
    if (expiredApprovedReservations.length === 0) return;

    expiredApprovedReservations.forEach(({ id }) => archivingReservationsRef.current.add(id));
    archiveExpiredApprovedReservations(expiredApprovedReservations, currentDateTime)
      .catch((error) => {
        console.error('Failed to archive completed reservations:', error);
      })
      .finally(() => {
        expiredApprovedReservations.forEach(({ id }) => archivingReservationsRef.current.delete(id));
      });
  }, [currentDateTime, currentUser, reservationsData, userData.role]);

  useEffect(() => {
    if (!userData.role || userData.role === '...' || !auth.currentUser) return;

    const myRoleKey = normalizeApprovalRoleKey(userData.role);
    const uid = auth.currentUser.uid;
    const email = auth.currentUser.email;
    let newNotifs = [];
    const resolveUserName = (userId, userEmail, fallbackName) => {
      const user = usersData.find(candidate => (
        (userId && candidate.uid === userId)
        || (userEmail && candidate.email === userEmail)
      ));
      return user?.name || user?.fullName || user?.displayName || fallbackName || 'the requestor';
    };

    const notificationReservations = [...new Map(
      [...historyData, ...reservationsData].map((reservation) => [reservation.id, reservation])
    ).values()];

    notificationReservations.forEach(res => {
      const requestor = usersData.find(u => u.email === res.userEmail || u.uid === res.userId) || {};
      const requestorName = requestor.name || requestor.fullName || requestor.displayName || res.fullName || 'the requestor';
      const reqRole = (requestor.role || res.userRole || 'requestor').toLowerCase().trim();
      const isStaffRequestor = reqRole !== 'requestor' && reqRole !== 'user';
      const isRoomCheckerRequestor = normalizeApprovalRoleKey(reqRole) === 'room checker';
      
      const isRequestor = res.userId === uid || res.userEmail === email;
      if (isRequestor) {
        const status = (res.status || '').toLowerCase().trim();
        if (['approved', 'rejected', 'cancelled', 'expired'].includes(status)) {
          const notificationTitle = status.charAt(0).toUpperCase() + status.slice(1);
          const latestActionLog = Array.isArray(res.historyLogs)
            ? [...res.historyLogs].reverse().find(log => log.state === status)
            : null;
          const actionBy = latestActionLog?.approverName;
          const actionByText = actionBy ? ` by ${actionBy}` : '';
          const message = status === 'approved'
            ? `Your reservation for ${res.eventName || 'an event'} has been approved${actionByText}.`
            : status === 'rejected'
              ? `Your request for ${res.eventName || 'an event'} was declined${actionByText}.`
              : status === 'cancelled'
                ? `Your reservation for ${res.eventName || 'an event'} was cancelled by ${resolveUserName(res.cancelledBy, res.cancelledByEmail, requestorName)}.`
                : `Your pending reservation for ${res.eventName || 'an event'} expired and was moved to history.`;
          const notificationTime = status === 'cancelled'
            ? res.cancelledAt || res.updatedAt || res.createdAt
            : status === 'expired'
              ? res.expiredAt || res.updatedAt || res.createdAt
              : res.updatedAt || res.createdAt;
          newNotifs.push({
            id: `${res.id}-${status}`,
            type: status,
            title: notificationTitle,
            message,
            time: notificationTime,
            rawDate: new Date(notificationTime || 0),
            fullData: res
          });
        }
      }

      if (isRequestor && Array.isArray(res.historyLogs)) {
        res.historyLogs
          .filter(log => log.state === 'to_modify' && log.id)
          .forEach((modificationRequest) => {
            const modificationRemark = typeof modificationRequest.text === 'string'
              ? modificationRequest.text.trim()
              : '';
            const actionBy = modificationRequest.approverName;
            const actionByText = actionBy ? ` by ${actionBy}` : '';
            const notificationTime = modificationRequest.timestamp
              || modificationRequest.date
              || res.modificationRequestedAt
              || res.updatedAt
              || res.createdAt;
            newNotifs.push({
              id: `${res.id}-to_modify-${modificationRequest.id}`,
              type: 'to_modify',
              title: 'To Modify',
              message: `Your reservation for ${res.eventName || 'an event'} was returned for modification${actionByText}.${modificationRemark ? ` Remarks: ${modificationRemark}` : ''}`,
              time: notificationTime,
              rawDate: new Date(notificationTime || 0),
              fullData: res
            });
          });
      }

      const myIndex = APPROVAL_ROLE_HIERARCHY.indexOf(myRoleKey);
      
      const reservationStatus = (res.status || '').toLowerCase().trim();
      const resubmissionLogs = Array.isArray(res.historyLogs)
        ? res.historyLogs.filter(log => (
          log.badge === 'Resubmitted'
          && log.modificationRequestedByRoleKey === myRoleKey
        ))
        : [];
      resubmissionLogs.forEach((resubmission) => {
        const notificationTime = resubmission.timestamp || res.updatedAt || res.createdAt;
        const resubmissionRemark = typeof resubmission.remark === 'string'
          ? resubmission.remark.trim()
          : '';
        newNotifs.push({
          id: `${res.id}-resubmitted-${resubmission.id}`,
          type: 'resubmitted',
          title: 'Reservation Resubmitted',
          message: `${requestorName} resubmitted ${res.eventName || 'a reservation'} after your modification request.${resubmissionRemark ? ` Remarks: ${resubmissionRemark}` : ''}`,
          time: notificationTime,
          rawDate: new Date(notificationTime || 0),
          fullData: res
        });
      });

      if (
        myIndex > 0
        && !['rejected', 'approved', 'to modify'].includes(reservationStatus)
        && !isExpired(res.eventDate, res.endTime, res.days)
      ) {
        
        if (myRoleKey === 'endorser' && res.endorserEmail !== email) {
          return; 
        }

        const myRecord = res.approvals?.[myRoleKey];
        const isMyTurn = (!myRecord || myRecord.status === 'pending')
          && !(myRoleKey === 'endorser' && isStaffRequestor)
          && isApprovalStepReady(res.approvals, myRoleKey, {
            hasEndorser: Boolean(res.endorserName),
            isStaffRequestor,
            isRoomCheckerRequestor,
            hasSpecificRoom: Boolean(res.specificRoom?.trim())
          });

        if (isMyTurn) {
          const approvalRequirement = myRoleKey === 'endorser'
            ? 'requires your endorsement'
            : 'requires your approval';
          newNotifs.push({
            id: `${res.id}-act`,
            type: 'action',
            title: 'Action Required',
            message: `A new reservation request (${res.eventName || 'Untitled'}) ${approvalRequirement}.`,
            time: res.createdAt,
            rawDate: new Date(res.createdAt || 0),
            fullData: res
          });
        }
      }
    });

    historyData.forEach((res) => {
      const status = (res.status || '').toLowerCase();
      if (status !== 'expired' && status !== 'cancelled') return;

      const isCancelled = status === 'cancelled';
      const notificationTime = isCancelled
        ? res.cancelledAt || res.updatedAt || res.createdAt
        : res.expiredAt || res.updatedAt || res.createdAt;
      const isRequestorCancellation = isCancelled && (
        (res.cancelledBy && res.userId && res.cancelledBy === res.userId)
        || (res.cancelledByEmail && res.userEmail
          && res.cancelledByEmail.toLowerCase() === res.userEmail.toLowerCase())
        || (Array.isArray(res.historyLogs) && res.historyLogs.some(log => (
          log.state === 'cancelled'
          && normalizeApprovalRoleKey(log.role) === 'requestor'
        )))
      );

      if (res.userId === uid || res.userEmail === email) {
        newNotifs.push({
          id: `${res.id}-${status}`,
          type: status,
          title: isCancelled ? 'Cancelled' : 'Expired',
          message: isCancelled
            ? `Your reservation for ${res.eventName || 'an event'} was cancelled by ${resolveUserName(res.cancelledBy, res.cancelledByEmail, resolveUserName(res.userId, res.userEmail, res.fullName))}.`
            : `Your pending reservation for ${res.eventName || 'an event'} expired and was moved to history.`,
          time: notificationTime,
          rawDate: new Date(notificationTime || 0),
          fullData: res
        });
      }

      if (
        isRequestorCancellation
        && ['mis', 'mis admin', 'building admin', 'super admin'].includes(myRoleKey)
      ) {
        const cancellationRemark = typeof res.cancellationRemark === 'string'
          ? res.cancellationRemark.trim()
          : '';
        const cancelledBy = resolveUserName(
          res.cancelledBy,
          res.cancelledByEmail,
          resolveUserName(res.userId, res.userEmail, res.fullName)
        );
        newNotifs.push({
          id: `${res.id}-cancelled-admin-${res.cancelledAt || res.updatedAt || ''}`,
          type: 'cancelled',
          title: 'Reservation Cancelled',
          message: `${res.eventName || 'A reservation'} was cancelled by ${cancelledBy}.${cancellationRemark ? ` Remark: ${cancellationRemark}` : ''}`,
          time: notificationTime,
          rawDate: new Date(notificationTime || 0),
          fullData: res
        });
      }
    });

    const uniqueNotifs = [...new Map(newNotifs.map((notif) => [notif.id, notif])).values()];
    const filteredNotifs = uniqueNotifs.filter(notif => !deletedNotifs.includes(notif.id));
    
    filteredNotifs.sort((a, b) => b.rawDate - a.rawDate);
    setNotifications(filteredNotifs);
  }, [reservationsData, historyData, usersData, userData, deletedNotifs]);

  const handleNotifItemClick = (notif) => {
    if (!readNotifs.includes(notif.id)) {
      const updatedReadNotifs = [...readNotifs, notif.id];
      setReadNotifs(updatedReadNotifs);
      localStorage.setItem('facilityResReadNotifs', JSON.stringify(updatedReadNotifs));
    }
    
    setSelectedRequest(notif.fullData);
    setIsNotifOpen(false);
  };

  const handleClearAllNotifs = () => {
    const allCurrentIds = notifications.map(n => n.id);
    const updatedDeleted = [...new Set([...deletedNotifs, ...allCurrentIds])];
    setDeletedNotifs(updatedDeleted);
    localStorage.setItem('facilityResDeletedNotifs', JSON.stringify(updatedDeleted));
  };

  const globalSearchControl = canOpenDashboardSearch ? (
    <div className="global-search-wrapper" ref={searchRef}>
      <form
        className="global-search-bar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          openDashboardSearch();
        }}
      >
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search users and reservations"
          aria-expanded={isGlobalSearchOpen}
          placeholder="Search"
          value={globalSearchQuery}
          onFocus={() => setIsGlobalSearchOpen(true)}
          onChange={(event) => {
            setGlobalSearchQuery(event.target.value);
            setIsGlobalSearchOpen(true);
          }}
        />
        <button
          type="button"
          className="global-search-toggle"
          aria-label={isGlobalSearchOpen ? 'Close search results' : 'Open search results'}
          onClick={() => setIsGlobalSearchOpen((isOpen) => !isOpen)}
        >
          {isGlobalSearchOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </form>

      {isGlobalSearchOpen && (
        <div className="global-search-dropdown">
          {globalSearchQuery.trim().length < 2 ? (
            <div className="global-search-empty">
              <Search size={36} aria-hidden="true" />
              <span>Search users and reservations</span>
              <small>Enter at least 2 characters to see results.</small>
            </div>
          ) : (
            <>
              {canSearchUsers && globalSearchResults.users.length > 0 && (
                <section className="global-search-group" aria-label="Matching users">
                  <div className="global-search-group-heading">
                    <strong>Users</strong>
                    <span>{globalSearchResults.users.length} matches</span>
                  </div>
                  <div className="global-search-user-list">
                    {globalSearchResults.users.slice(0, 3).map((user) => (
                      <button
                        type="button"
                        className="global-search-user"
                        key={user.id}
                        onClick={() => {
                          setIsGlobalSearchOpen(false);
                          navigate(`/account?userId=${encodeURIComponent(user.id)}`);
                        }}
                      >
                        <span className="global-search-user-avatar">
                          {user.avatarUrl
                            ? <img src={user.avatarUrl} alt="" />
                            : (user.name || user.email || '?').charAt(0).toUpperCase()}
                        </span>
                        <strong>{user.name || 'Unnamed user'}</strong>
                        <span>{user.email || 'No email listed'}</span>
                      </button>
                    ))}
                  </div>
                  {globalSearchResults.users.length > 3 && (
                    <button
                      type="button"
                      className="global-search-view-more"
                      onClick={openDashboardSearch}
                    >
                      View {globalSearchResults.users.length - 3} more
                    </button>
                  )}
                </section>
              )}

              {globalSearchResults.reservations.length > 0 && (
                <section className="global-search-group" aria-label="Matching reservations">
                  <div className="global-search-group-heading">
                    <strong>Reservations</strong>
                    <span>{globalSearchResults.reservations.length} matches</span>
                  </div>
                  <div className="global-search-reservation-list">
                    {globalSearchResults.reservations.slice(0, 3).map((reservation) => (
                      <button
                        type="button"
                        className="global-search-reservation"
                        key={reservation.id}
                        onClick={() => {
                          setSelectedReservation(reservation);
                          setIsGlobalSearchOpen(false);
                        }}
                      >
                        <CalendarDays size={18} aria-hidden="true" />
                        <span>
                          <strong>{reservation.eventName || reservation.title || 'Untitled reservation'}</strong>
                          <small>
                            {reservation.refNo || 'No reference'}
                            {' · '}{reservation.fullName || reservation.userEmail || 'Unknown user'}
                            {' · '}{reservation.status || 'Pending'}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {globalSearchResults.reservations.length > 3 && (
                    <button
                      type="button"
                      className="global-search-view-more"
                      onClick={openDashboardSearch}
                    >
                      View {globalSearchResults.reservations.length - 3} more
                    </button>
                  )}
                </section>
              )}

              {globalSearchResults.users.length === 0
                && globalSearchResults.reservations.length === 0 && (
                  <div className="global-search-no-results">
                    <UserRound size={22} aria-hidden="true" />
                    <span>No matching users or reservations.</span>
                  </div>
                )}

              <button
                type="button"
                className="global-search-open-dashboard"
                onClick={openDashboardSearch}
              >
                Open full Search
              </button>
            </>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <header className="topbar">
        <div className="header-titles">
          <button className="mobile-menu-btn" onClick={toggleSidebar} aria-label="Open menu">
            <Menu size={24} />
          </button>

        {!isCompactViewport && globalSearchControl}
        </div>

        <div className="header-actions">
          <Link
            className="current-datetime"
            to="/calendar"
            aria-label={`Open calendar. ${currentDateTime.toLocaleString()}`}
          >
            <span>{currentDateTime.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })}</span>
            <strong>{currentDateTime.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit'
            })}</strong>
          </Link>

          <div className="notification-wrapper" ref={notifRef}>
            <button 
              className="notification-btn" 
              title="Notifications" 
              onClick={() => setIsNotifOpen(!isNotifOpen)}
            >
              <Bell size={20} />
              {hasUnread && <span className="notification-dot"></span>}
            </button>

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
                          {notif.type === 'to_modify' && <div className="notif-avatar bg-yellow">✎</div>}
                          {notif.type === 'resubmitted' && <div className="notif-avatar bg-blue">↻</div>}
                          {notif.type === 'expired' && <div className="notif-avatar bg-charcoal">!</div>}
                          {notif.type === 'cancelled' && <div className="notif-avatar bg-gray">×</div>}
                          
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

          <Link className="user-profile" to="/account" aria-label="Open your profile">
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
          </Link>
        </div>
      </header>

      {isCompactViewport && mobileSearchContainer && globalSearchControl
        ? createPortal(
          <div className="topbar mobile-search-portal">{globalSearchControl}</div>,
          mobileSearchContainer
        )
        : null}

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
                    <PendingRequest
                      data={selectedRequest}
                      onEditReservation={(reservationId) => {
                        setSelectedRequest(null);
                        navigate(`/reserve?edit=${encodeURIComponent(reservationId)}`);
                      }}
                    />
                </div>
            </div>
        </div>
      )}
      {selectedReservation && (
        <div
          className="topbar-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedReservation(null);
          }}
        >
          <div className="modal-wrapper">
            <button
              type="button"
              className="close-modal-btn"
              onClick={() => setSelectedReservation(null)}
              aria-label="Close reservation details"
            >
              ✕
            </button>
            <div
              className="modal-content"
              role="dialog"
              aria-modal="true"
              aria-label="Reservation details"
            >
              <Suspense fallback={<p className="loading-text">Loading reservation details...</p>}>
                <ReservationDetails
                  key={selectedReservation.id}
                  data={selectedReservation}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TopBar;