import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, onSnapshot, updateDoc, arrayUnion, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../Firebase';
import { sendReservationEmail } from '../services/emailService'; 
import { archiveReservation } from '../services/archiveReservation';
import { getApprovalTrackerSteps, normalizeApprovalRoleKey } from '../services/approvalWorkflow';
import { getReservationDynamicAttributes, getSignupConfiguration } from '../services/signupOptions';
import '../styles/PendingRequest.scss';

// --- NAME FORMATTER HELPER ---
const formatName = (fullName) => {
  if (!fullName) return 'Unknown User';
  let name = fullName.replace(/\s*\(Student\)/i, '').trim();
  if (name.includes(',')) {
    const parts = name.split(',');
    name = `${parts[1].trim()} ${parts[0].trim()}`;
  }
  return name;
};

// --- EVENT DATE RANGE FORMATTER HELPER ---
const formatEventDateRange = (startDateStr, numDays) => {
  if (!startDateStr) return 'N/A';
  let parts = startDateStr.split(/[\/\-]/);
  if (parts.length !== 3) return startDateStr;
  const [m, d, y] = parts.map(Number);
  const startFormatted = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-${y}`;
  
  const daysCount = Number(numDays) || 1;
  if (daysCount <= 1) return startFormatted;

  const current = new Date(y, m - 1, d);
  current.setDate(current.getDate() + (daysCount - 1));
  const mm = String(current.getMonth() + 1).padStart(2, '0');
  const dd = String(current.getDate()).padStart(2, '0');
  const yy = current.getFullYear();
  const endFormatted = `${mm}-${dd}-${yy}`;

  return `${startFormatted} - ${endFormatted}`;
};

const PendingRequest = ({ data, isSuperAdmin = false, onEditReservation }) => {
  const navigate = useNavigate();
  // Live sync state for this specific reservation document
  const [currentData, setCurrentData] = useState(data);
  const [facilitiesMap, setFacilitiesMap] = useState({});
  const [equipmentMap, setEquipmentMap] = useState({});
  const [utilitiesMap, setUtilitiesMap] = useState({});
  const [requestorRole, setRequestorRole] = useState('requestor');
  const [showFacilityParticipants, setShowFacilityParticipants] = useState(false);
  const [signupConfiguration, setSignupConfiguration] = useState(() => getSignupConfiguration());
  
  // States for processing & modals
  const [remarks, setRemarks] = useState('');
  const [expandedTimeGroups, setExpandedTimeGroups] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [customAlert, setCustomAlert] = useState(null); 
  const [pendingAction, setPendingAction] = useState(null);
  const [actionRemarkError, setActionRemarkError] = useState('');
  
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => onSnapshot(
    doc(db, 'app_settings', 'signupOptions'),
    (snapshot) => setSignupConfiguration(getSignupConfiguration(snapshot.data() || {})),
    (error) => console.error('Failed to load signup options for reservation details:', error)
  ), []);

  // State for the currently logged-in user (Approver)
  const [approver, setApprover] = useState({
    name: 'Loading...',
    role: '...',
    roleKey: '', 
    avatarUrl: '',
    initials: ''
  });

  // Real-time listener for this specific reservation doc so changes reflect instantly
  useEffect(() => {
  if (!currentUser || !data?.id) return; // Added safeguard
  const unsubscribe = onSnapshot(doc(db, 'reservations', data.id), (docSnap) => {
    if (docSnap.exists()) {
      setCurrentData({ id: docSnap.id, ...docSnap.data() });
    }
  });
  return () => unsubscribe();
}, [currentUser, data?.id]); // Added dependency

  // Fetch requestor's actual role to determine if endorser should be skipped
  useEffect(() => {
    const fetchRequestorRole = async () => {
      if (!currentData) return;
      try {
        let userDoc = null;
        if (currentData.userId) {
          const docRef = doc(db, 'users', currentData.userId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            userDoc = docSnap.data();
          }
        }
        if (!userDoc && currentData.userEmail) {
          const q = query(collection(db, 'users'), where('email', '==', currentData.userEmail));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            userDoc = querySnap.docs[0].data();
          }
        }
        if (userDoc && userDoc.role) {
          setRequestorRole(userDoc.role.toLowerCase().trim());
        }
      } catch (err) {
        console.error("Error fetching requestor role:", err);
      }
    };
    fetchRequestorRole();
  }, [currentData]);

  // 1. Fetch current logged-in user for "Approving as" box
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user); // Added
      if (user) {
        try {
          const userCollection = isSuperAdmin ? 'super_users' : 'users';
          const userRef = doc(db, userCollection, user.uid);
          const userSnap = await getDoc(userRef);
          let userData = userSnap.exists() ? userSnap.data() : null;

          if (!userData && user.email) {
            const userQuery = query(collection(db, userCollection), where('email', '==', user.email));
            const userQuerySnap = await getDocs(userQuery);
            if (!userQuerySnap.empty) {
              userData = userQuerySnap.docs[0].data();
            }
          }

          if (userData) {
            const profileName = [userData.firstName, userData.lastName].filter(Boolean).join(' ')
              || userData.name;
            const cleanName = formatName(profileName);
            const approverName = cleanName === 'Unknown User'
              ? 'Administrator'
              : cleanName;
            const rawRole = userData.role || 'user';
            
            let displayRole = isSuperAdmin ? 'super admin' : rawRole.replace(/_/g, ' ').toLowerCase().trim();
            if (displayRole === 'mis' || displayRole === 'osa') {
              displayRole = displayRole.toUpperCase();
            } else {
              displayRole = displayRole.replace(/\b\w/g, l => l.toUpperCase());
            }

            setApprover({
              name: approverName,
              role: displayRole,
              roleKey: isSuperAdmin ? 'super admin' : normalizeApprovalRoleKey(rawRole),
              avatarUrl: userData.avatarUrl || '',
              initials: approverName.charAt(0).toUpperCase()
            });
          }
        } catch (err) {
          console.error("Failed to fetch approver data", err);
        }
      }
    });
    return () => unsubscribeAuth();
  }, [isSuperAdmin]);
  // 2. Fetch facilities and equipments mapping
  useEffect(() => {
    if (!currentUser) return; // Added safeguard
    const unsubFac = onSnapshot(collection(db, 'facilities'), (snapshot) => {
      const fMap = {};
      snapshot.forEach(doc => { fMap[doc.id] = doc.data(); });
      setFacilitiesMap(fMap);
    });

    const unsubEq = onSnapshot(collection(db, 'equipments'), (snapshot) => {
      const eMap = {};
      snapshot.forEach(doc => { eMap[doc.id] = doc.data(); });
      setEquipmentMap(eMap);
    });

    const unsubUtilities = onSnapshot(collection(db, 'utilities'), (snapshot) => {
      const uMap = {};
      snapshot.forEach(doc => { uMap[doc.id] = doc.data(); });
      setUtilitiesMap(uMap);
    });

    return () => { unsubFac(); unsubEq(); unsubUtilities(); };
  }, [currentUser]); // Added dependency

  if (!currentData) return <div className="loading-container">Loading request details...</div>;

  // --- DYNAMIC DATA MAPPING ---
  const refNo = currentData.refNo || 'N/A';
  const eventName = currentData.eventName || 'Untitled Event';
  const eventType = Array.isArray(currentData.eventType) ? currentData.eventType.join(', ') : (currentData.eventType || 'N/A');
  const eventDate = formatEventDateRange(currentData.eventDate, currentData.days);
  const scheduledYears = new Set((Array.isArray(currentData.schedule) ? currentData.schedule : []).map((entry) => (
    String(entry.date || '').match(/^\d{4}-/)?.[0]
      || String(entry.date || '').match(/\/(\d{4})$/)?.[1]
      || ''
  )).filter(Boolean));
  const includeYearInScheduleDates = scheduledYears.size > 1;
  const dailyTimeEntries = Array.isArray(currentData.schedule)
    ? currentData.schedule.reduce((groups, entry) => {
      const parsedDate = new Date(`${entry.date}T00:00:00`);
      const dateLabel = Number.isNaN(parsedDate.getTime())
        ? entry.date
        : parsedDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          ...(includeYearInScheduleDates ? { year: 'numeric' } : {})
        });
      const time = `${entry.startTime || 'N/A'} – ${entry.endTime || 'N/A'}`;
      const existingGroup = groups.find((group) => group.time === time);
      if (existingGroup) {
        existingGroup.dates.push(dateLabel);
      } else {
        groups.push({ dates: [dateLabel], time });
      }
      return groups;
    }, [])
    : [];
  const renderDailyTimeDisplay = (variant) => dailyTimeEntries.length > 0
    ? (
      <div className={`daily-time-list ${variant}`}>
        {dailyTimeEntries.map(({ dates, time }, index) => {
          const groupKey = `${variant}-${time}`;
          const isExpanded = Boolean(expandedTimeGroups[groupKey]);
          const visibleDates = dates.slice(0, 2);
          const additionalDates = dates.slice(2);
          const expandedDatesId = `daily-time-dates-${variant}-${index}`;

          return (
            <div className="daily-time-entry" key={time}>
              <span className="daily-time-range">{time}</span>
              <div className="daily-time-date-group">
                <span className="daily-time-date">[{visibleDates.join(', ')}]</span>
                {dates.length > 2 && (
                  <button
                    type="button"
                    className="daily-time-more"
                    aria-expanded={isExpanded}
                    aria-controls={expandedDatesId}
                    onClick={() => setExpandedTimeGroups((groups) => ({
                      ...groups,
                      [groupKey]: !isExpanded
                    }))}
                  >
                    {isExpanded ? 'View less' : `+${additionalDates.length} more`}
                  </button>
                )}
              </div>
              {isExpanded && (
                <div id={expandedDatesId} className="daily-time-expanded-dates" aria-label="Additional scheduled dates">
                  {additionalDates.map((date) => (
                    <span className="daily-time-date-chip" key={date}>{date}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    )
    : `${currentData.startTime || ''} – ${currentData.endTime || ''}`;
  const eventTime = renderDailyTimeDisplay('details');
  const summaryTime = renderDailyTimeDisplay('summary');
  const specificRoomParticipantCount = Number(currentData.specificRoomParticipants) || 0;
  const participantBreakdown = (currentData.facilities || [])
    .map((id) => ({
      id,
      name: facilitiesMap[id]?.name || id,
      participants: Number(
        currentData.facilityParticipants?.[id]
        ?? ((currentData.facilities || []).length === 1 ? currentData.expectedParticipants : 0)
      )
    }))
    .filter(({ participants }) => Number.isInteger(participants) && participants > 0);
  if (currentData.specificRoom?.trim() && specificRoomParticipantCount > 0) {
    participantBreakdown.push({
      id: 'specific-room',
      name: currentData.specificRoom,
      participants: specificRoomParticipantCount
    });
  }
  const facilityParticipantTotal = participantBreakdown
    .filter(({ id }) => id !== 'specific-room')
    .reduce((total, { participants }) => total + participants, 0);
  const expectedParticipantTotal = Math.max(
    Number(currentData.expectedParticipants) || 0,
    facilityParticipantTotal + specificRoomParticipantCount
  );
  const expectedAttendees = expectedParticipantTotal ? `${expectedParticipantTotal} attendees` : 'N/A';
  const description = currentData.purpose || 'No description provided.';
  
  const facilityNames = (currentData.facilities || []).map(id => facilitiesMap[id]?.name || id);
  const facilityDisplay = facilityNames.length > 0 ? facilityNames.join(', ') : 'None';
  
  const roomCapacities = (currentData.facilities || []).map((id) => {
    const facility = facilitiesMap[id];
    if (!facility) return null;
    const minCapacity = Number(facility.minCapacity) || null;
    const maxCapacity = Object.prototype.hasOwnProperty.call(facility, 'maxCapacity')
      ? Number(facility.maxCapacity) || null
      : Number(facility.capacity) || null;
    if (minCapacity && maxCapacity) return `${minCapacity}–${maxCapacity}`;
    if (minCapacity) return `${minCapacity}+`;
    if (maxCapacity) return `Up to ${maxCapacity}`;
    return null;
  }).filter(Boolean);
  const capacityDisplay = roomCapacities.length > 0 ? roomCapacities.join(', ') + ' people' : 'N/A';

  const floorLocations = (currentData.facilities || []).map(id => facilitiesMap[id]?.location).filter(Boolean);
  const locationDisplay = currentData.specificRoom 
    ? currentData.specificRoom
    : (floorLocations.length > 0 ? floorLocations.join(' | ') : 'N/A');

  const equipArray = Object.entries(currentData.selectedEquip || {})
    .filter(([id, qty]) => Number(qty) > 0)
    .map(([id, qty]) => `${qty}x ${equipmentMap[id]?.name || id}`);
  if (typeof currentData.otherEquipment === 'string' && currentData.otherEquipment.trim()) {
    equipArray.push(currentData.otherEquipment.trim());
  }
  const equipmentRequested = equipArray.length > 0 ? equipArray.join(', ') : 'None';
  const utilityNames = (Array.isArray(currentData.selectedUtilities) ? currentData.selectedUtilities : [])
    .map((id) => `${Number(currentData.selectedUtilityUnits?.[id]) || 1}x ${utilitiesMap[id]?.name || id}`);
  if (typeof currentData.otherUtility === 'string' && currentData.otherUtility.trim()) {
    utilityNames.push(currentData.otherUtility.trim());
  }
  const utilityRequested = utilityNames.length > 0 ? utilityNames.join(', ') : 'None';

  const requestorName = formatName(currentData.fullName);
  const requestorTypes = Array.isArray(currentData.requestorTypes)
    ? currentData.requestorTypes
    : [];
  const requestorTypeDisplay = requestorTypes.length > 0
    ? requestorTypes.join(', ')
    : 'N/A';
  const requestorDynamicAttributes = getReservationDynamicAttributes(
    currentData,
    'requestor',
    signupConfiguration
  );
  const contactNumber = currentData.contactNumber || 'N/A';
  const email = currentData.emailAddress || currentData.userEmail || 'N/A';
  
  let dateSubmitted = 'Unknown';
  if (currentData.createdAt) {
    dateSubmitted = new Date(currentData.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const hasEndorser = !!currentData.endorserName;
  const endorserName = currentData.endorserName ? formatName(currentData.endorserName) : 'N/A';
  const endorserDesignation = currentData.endorserDesignation || 'N/A';
  const endorserEmail = currentData.endorserEmail || 'N/A';
  const endorserDynamicAttributes = getReservationDynamicAttributes(
    currentData,
    'endorser',
    signupConfiguration
  );
  const endorsedBy = currentData.endorserName ? `${endorserName} (${currentData.endorserDesignation})` : 'N/A';

  const isStaffRequestor = requestorRole && requestorRole !== 'requestor' && requestorRole !== 'user';
  const isRoomCheckerRequestor = normalizeApprovalRoleKey(requestorRole) === 'room checker'
    || normalizeApprovalRoleKey(currentData.userRole) === 'room checker';

  // --- HIERARCHY & TRACKER LOGIC ---
  const trackerSteps = getApprovalTrackerSteps({
    approvals: currentData.approvals,
    dateSubmitted,
    hasEndorser,
    isStaffRequestor,
    isRoomCheckerRequestor,
    hasSpecificRoom: Boolean(currentData.specificRoom?.trim()),
    activeRoleKey: approver.roleKey,
    reservationStatus: currentData.status
  });

  const canOverrideApprovalWorkflow = isSuperAdmin
    || ['super admin', 'mis', 'building admin'].includes(approver.roleKey);
  const nextSuperAdminStep = canOverrideApprovalWorkflow
    ? trackerSteps.find((step) => (
      step.key !== 'requestor'
      && step.state !== 'approved'
      && step.state !== 'rejected'
    ))
    : null;
  const approvalRoleKey = canOverrideApprovalWorkflow ? nextSuperAdminStep?.key : approver.roleKey;
  const approvalRoleLabel = canOverrideApprovalWorkflow && nextSuperAdminStep
    ? `${nextSuperAdminStep.label} (${approver.role})`
    : approver.role;
  const myStep = trackerSteps.find((step) => step.key === approver.roleKey);
  const canAct = (currentData.status || '').toLowerCase() === 'pending'
    && (canOverrideApprovalWorkflow
      ? Boolean(nextSuperAdminStep)
      : !currentData.approvals?.[approver.roleKey] && myStep?.state === 'your-turn');

  const myApprovalStatus = canOverrideApprovalWorkflow
    ? null
    : currentData.approvals?.[approver.roleKey]?.status;
  const normalizedReservationStatus = (currentData.status || '').toLowerCase().trim();
  const isFullyApproved = currentData.approvals?.['school admin']?.status?.toLowerCase() === 'approved';
  const isReservationOwner = currentUser && (
    currentData.userId === currentUser.uid
    || currentData.userEmail === currentUser.email
  );
  const canEditReturnedReservation = isReservationOwner
    && normalizedReservationStatus === 'to modify';
  const modificationRemark = typeof currentData.modificationRemark === 'string'
    ? currentData.modificationRemark.trim()
    : '';

  const handleEditReservation = () => {
    if (!canEditReturnedReservation || !currentData.id) return;
    if (onEditReservation) {
      onEditReservation(currentData.id);
      return;
    }
    navigate(`/reserve?edit=${encodeURIComponent(currentData.id)}`);
  };

  const baseHistory = [{
    role: 'Requestor',
    badge: 'Submitted',
    date: dateSubmitted,
    approverName: requestorName,
    text: `Reservation request submitted for ${eventName}.`,
    state: 'approved'
  }];
  const dbHistoryLogs = currentData.historyLogs || [];
  const fullHistory = [...baseHistory, ...dbHistoryLogs];

  // --- ACTION HANDLERS ---
  const requestActionConfirmation = (actionType) => {
    if (['rejected', 'to_modify'].includes(actionType) && !remarks.trim()) {
      setActionRemarkError('Enter a remark above before continuing.');
      return;
    }
    setActionRemarkError('');
    setPendingAction(actionType);
  };

  const handleAction = async (actionType) => {
    const remark = remarks.trim();
    if (['rejected', 'to_modify'].includes(actionType) && !remark) {
      setActionRemarkError('Enter a remark above before continuing.');
      setPendingAction(null);
      return;
    }
    setPendingAction(null);
    setActionRemarkError('');
    if (!canAct || isProcessing) return;
    setIsProcessing(true);

    try {
      const now = new Date();
      const dateString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const dateTimeString = `${dateString} at ${timeString}`;

      const isApprove = actionType === 'approved';
      const isReject = actionType === 'rejected';
      const isToModify = actionType === 'to_modify';
      
      const newLog = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        role: approvalRoleLabel,
        approvalRoleKey: approver.roleKey,
        badge: isApprove ? 'Approved' : isReject ? 'Rejected' : 'To Modify',
        timestamp: now.toISOString(),
        date: dateTimeString,
        approverName: approver.name,
        text: remark || 'Approved reservation request without remarks.',
        state: isApprove ? 'approved' : isReject ? 'rejected' : 'to_modify'
      };

      const updatePayload = { historyLogs: arrayUnion(newLog) };
      const currentApprovalRecord = currentData.approvals?.[approvalRoleKey];
      const archivedApprovals = {
        ...currentData.approvals,
        [approvalRoleKey]: {
          ...(currentApprovalRecord && typeof currentApprovalRecord === 'object'
            ? currentApprovalRecord
            : {}),
          status: isApprove ? 'approved' : 'rejected',
          date: dateString
        }
      };

      if (isToModify) {
        updatePayload.status = 'To Modify';
        updatePayload.modificationRemark = remark;
        updatePayload.modificationRequestedBy = approver.name;
        updatePayload.modificationRequestedByRoleKey = approver.roleKey;
        updatePayload.modificationRequestLogId = newLog.id;
        updatePayload.modificationRequestedAt = dateTimeString;
      } else {
        updatePayload[`approvals.${approvalRoleKey}.status`] = isApprove ? 'approved' : 'rejected';
        updatePayload[`approvals.${approvalRoleKey}.date`] = dateString;
      }

      if (isReject) {
        updatePayload.status = 'Rejected';
      } else if (isApprove && approvalRoleKey === 'school admin') {
        updatePayload.status = 'Approved';
      }

      if (isApprove || isToModify) {
        await updateDoc(doc(db, 'reservations', currentData.id), updatePayload);
      } else {
        await archiveReservation(currentData.id, {
          ...currentData,
          approvals: archivedApprovals,
          historyLogs: [...(currentData.historyLogs || []), newLog],
          status: 'Rejected',
          rejectionRemark: remark.trim()
        });
      }

      // --- SEND EMAIL NOTIFICATION ---
      const emailMessage = isApprove 
        ? `Your reservation has been approved by the ${approvalRoleLabel}.`
        : isReject
          ? `Your reservation has been rejected by the ${approvalRoleLabel}. Remarks: ${remark}`
          : `Your reservation has been returned for modification by the ${approvalRoleLabel}. Please review the remarks: ${remark}`;

      await sendReservationEmail(
        email, 
        requestorName, 
        currentData, 
        emailMessage
      );
      // -------------------------------

      setRemarks(''); 
    } catch (err) {
      console.error("Error updating reservation:", err);
      setCustomAlert({
        title: 'Error',
        message: 'Failed to process the reservation update.',
        isSuccess: false
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const bannerStatusClass = normalizedReservationStatus === 'approved'
    ? 'approved'
    : normalizedReservationStatus === 'rejected' ? 'rejected' : 'pending';

  return (
    <div className="mis-reservation-details-content">
      {/* Top Banner */}
      <div className={`top-banner ${bannerStatusClass}`}>
        <div className="banner-info">
          <span className="icon">🛡</span>
          <div>
            <strong>
              Reservation {normalizedReservationStatus === 'rejected'
                ? 'Rejected'
                : normalizedReservationStatus === 'approved'
                  ? 'Approved'
                  : normalizedReservationStatus === 'to modify'
                    ? 'Returned for Modification'
                    : 'Pending for Approval'}
            </strong>
            <p>This reservation is currently {canAct || myApprovalStatus ? `waiting on your decision as ${approver.role}` : `processing through the approval pipeline.`}</p>
          </div>
        </div>
        <span className="banner-badge">Status: {currentData.status || 'Pending'}</span>
      </div>

      {/* Main Grid */}
      <div className="main-content-grid">
        <div className="details-col">
          {/* Card 1: Event Information */}
          <div className="card">
            <h3><span className="card-icon">📋</span> Event Information</h3>
            <div className="info-grid">
              <div>
                <label>EVENT NAME</label>
                <div className="val font-bold">{eventName}</div>
              </div>
              <div>
                <label>EVENT TYPE</label>
                <div className="val font-bold">{eventType}</div>
              </div>
              <div>
                <label>EVENT DATE</label>
                <div className="val">{eventDate}</div>
              </div>
              <div className="time-detail-field">
                <label>TIME</label>
                <div className="val">{eventTime}</div>
              </div>
              <div>
                <label>EXPECTED ATTENDEES</label>
                <div className="val attendees-total">
                  <span>{expectedAttendees}</span>
                  {participantBreakdown.length > 0 && (
                    <button
                      type="button"
                      className="participant-breakdown-toggle"
                      aria-expanded={showFacilityParticipants}
                      onClick={() => setShowFacilityParticipants((expanded) => !expanded)}
                    >
                      {showFacilityParticipants ? 'View less' : 'View more'}
                    </button>
                  )}
                </div>
                {showFacilityParticipants && participantBreakdown.length > 0 && (
                  <div className="facility-participant-breakdown">
                    {participantBreakdown.map(({ id, name, participants }) => (
                      <div className="facility-participant-row" key={id}>
                        <span>{name}</span>
                        <strong>{participants} attendees</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="full-width-field">
              <label>EVENT DESCRIPTION / PURPOSE</label>
              <div className="val desc-text">{description}</div>
            </div>
          </div>

          {/* Card 2: Facility Details */}
          <div className="card">
            <h3><span className="card-icon">🏢</span> Facility Details</h3>
            <div className="info-grid">
              <div>
                <label>FACILITY NAME</label>
                <div className="val font-bold">{facilityDisplay}</div>
              </div>
              <div>
                <label>ROOM CAPACITY</label>
                <div className="val">{capacityDisplay}</div>
              </div>
              <div>
                <label>FLOOR / LOCATION</label>
                <div className="val">{locationDisplay}</div>
              </div>
              <div>
                <label>AIR CONDITIONING</label>
                <div className="val">
                  {currentData.aircon 
                    ? "ON" + ((currentData.airconOnTime || currentData.airconOffTime) ? ` (${currentData.airconOnTime || '?'} - ${currentData.airconOffTime || '?'})` : "") 
                    : "OFF"}
                </div>
              </div>
              <div className="equipment-grid-col">
                <label>UTILITY REQUESTED</label>
                <div className="val">{utilityRequested}</div>
              </div>
              <div className="equipment-grid-col">
                <label>EQUIPMENT REQUESTED</label>
                <div className="val">{equipmentRequested}</div>
              </div>
            </div>
          </div>

          {/* Card 3: Requestor Information */}
          <div className="card">
            <h3><span className="card-icon">👤</span> Requestor Information</h3>
            <div className="info-grid">
              <div>
                <label>FULL NAME</label>
                <div className="val font-bold">{requestorName}</div>
                <div className="requestor-type-field">
                  <label>REQUESTOR TYPE</label>
                  <div className="val">{requestorTypeDisplay}</div>
                </div>
              </div>
              <div>
                <label>CONTACT NUMBER</label>
                <div className="val">{contactNumber}</div>
              </div>
              <div>
                <label>EMAIL ADDRESS</label>
                <div className="val">{email}</div>
              </div>
              {requestorDynamicAttributes.map(({ key, label, value }) => (
                <div className="full-width-field" key={`requestor-${key}`}>
                  <label>{label.toUpperCase()}</label>
                  <div className="val word-break">{value}</div>
                </div>
              ))}
              <div>
                <label>DATE SUBMITTED</label>
                <div className="val">{dateSubmitted}</div>
              </div>
            </div>
          </div>

          {/* Card 4: Endorser Information (Conditional) */}
          {hasEndorser && (
            <div className="card">
              <div className="endorser-header-row">
                <h3><span className="card-icon">🤵</span> Endorser Information</h3>
                <span className="endorser-badge">Student Role Only</span>
              </div>
              <div className="info-grid col-2">
                <div>
                  <label>ENDORSER'S FULL NAME</label>
                  <div className="val font-bold">{endorserName}</div>
                </div>
                <div>
                  <label>DESIGNATION</label>
                  <div className="val">{endorserDesignation}</div>
                </div>
                <div className="full-width-field endorser-full-width">
                  <label>CONTACT EMAIL</label>
                  <div className="val">{endorserEmail}</div>
                </div>
                {endorserDynamicAttributes.map(({ key, label, value }) => (
                  <div className="full-width-field" key={`endorser-${key}`}>
                    <label>{label.toUpperCase()}</label>
                    <div className="val word-break">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Actions and Summary */}
        <div className="sidebar-col">
          {/* Reservation Summary */}
          <div className="card">
            <h3>Reservation Summary</h3>
            <div className="summary-list">
              <div className="summary-item">
                <span className="label">Reference No.</span>
                <span className="val ref-no">{refNo}</span>
              </div>
              <div className="summary-item">
                <span className="label">Facility</span>
                <span className="val">{facilityDisplay}</span>
              </div>
              <div className="summary-item">
                <span className="label">Equipment</span>
                <span className="val">{equipmentRequested}</span>
              </div>
              <div className="summary-item">
                <span className="label">Event Date</span>
                <span className="val">{eventDate}</span>
              </div>
              <div className="summary-item">
                <span className="label">Duration</span>
                <div className="val">{summaryTime}</div>
              </div>
              <div className="summary-item">
                <span className="label">Attendees</span>
                <span className="val">{expectedAttendees}</span>
              </div>
              
              {hasEndorser && (
                <div className="summary-item">
                  <span className="label">Endorsed By</span>
                  <span className="val">{endorsedBy}</span>
                </div>
              )}
            </div>
          </div>

          {/* Admin Approval Decision Card */}
          {canEditReturnedReservation ? (
            <div className="card returned-modification-card">
              <div className="card-header-small">
                <h3>Reservation Returned for Modification</h3>
                <p>Your reservation needs changes before it can continue through approval.</p>
              </div>
              <div className="returned-modification-remark">
                <strong>Requested changes</strong>
                <p>{modificationRemark || 'No additional remarks were provided.'}</p>
              </div>
              <button
                type="button"
                className="btn-modify"
                onClick={handleEditReservation}
              >
                <i className="ph ph-pencil-simple"></i> Edit Reservation
              </button>
            </div>
          ) : canOverrideApprovalWorkflow && isFullyApproved ? (
            <div className="card">
              <strong>Reservation is Fully Approved</strong>
            </div>
          ) : <div className="card">
            <div className="card-header-small">
              <h3>🛡️ {approver.role} Approval</h3>
              <p>Your administrative decision</p>
            </div>

            <div className="user-profile-box">
              <div className="user-details">
                {approver.avatarUrl ? (
                  <img src={approver.avatarUrl} alt="Avatar" className="avatar avatar-cover" />
                ) : (
                  <div className="avatar">{approver.initials}</div>
                )}
                <div>
                  <span className="sub-text">Approving as</span>
                  <strong>{approver.name}</strong>
                </div>
              </div>
              <span className="role-tag">{approver.role}</span>
            </div>

            <div className="form-group">
              <label htmlFor="approvalRemarks">
                REMARKS <span>(required for reject or modify)</span>
              </label>
              <textarea
                id="approvalRemarks"
                name="approvalRemarks"
                value={remarks}
                onChange={(e) => {
                  setRemarks(e.target.value.slice(0, 1000));
                  if (e.target.value.trim()) setActionRemarkError('');
                }}
                placeholder={canAct ? "Add your administrative remarks or conditions here..." : "You can only add remarks when it is your turn to approve."}
                rows={3}
                maxLength={1000}
                disabled={!canAct || isProcessing || !!myApprovalStatus}
              />
              {actionRemarkError && <p className="action-remark-error" role="alert">{actionRemarkError}</p>}
            </div>

            <div className="action-buttons">
              {myApprovalStatus ? (
                <div className={`already-acted-msg ${myApprovalStatus}`}>
                  You have already {myApprovalStatus} this request.
                </div>
              ) : (
                <>
                  <button 
                    className="btn-approve"
                    onClick={() => requestActionConfirmation('approved')}
                    disabled={!canAct || isProcessing}
                  >
                    {isProcessing ? 'Processing...' : '✓ Approve Reservation'}
                  </button>
                  <button
                    className="btn-modify"
                    onClick={() => requestActionConfirmation('to_modify')}
                    disabled={!canAct || isProcessing}
                  >
                    {isProcessing ? 'Processing...' : '✎ To Modify Reservation'}
                  </button>
                  <button 
                    className="btn-reject" 
                    onClick={() => requestActionConfirmation('rejected')}
                    disabled={!canAct || isProcessing}
                  >
                    {isProcessing ? 'Processing...' : '✕ Reject Reservation'}
                  </button>
                </>
              )}
            </div>
            
            {!canAct && !myApprovalStatus && !['rejected', 'approved', 'to modify'].includes(normalizedReservationStatus) && (
              <div className="hierarchy-disabled-hint">
                {canOverrideApprovalWorkflow
                  ? 'The approval tracker is complete.'
                  : 'Buttons are disabled because it is not currently your turn in the approval hierarchy.'}
              </div>
            )}
          </div>}
        </div>
      </div>

      {/* Approval Tracker */}
      <div className="card tracker-card">
        <h3>📊 Approval Tracker</h3>

        <div className="pipeline-container">
          {trackerSteps.map((step, index) => (
            <div key={index} className={`pipeline-step ${step.state}`}>
              {index < trackerSteps.length - 1 && <div className="step-line" />}
              <div className="step-circle">
                {step.state === 'approved' ? '✓' : step.state === 'rejected' ? '✕' : step.state === 'your-turn' ? '🛡️' : index + 1}
              </div>
              <div className="step-title">{step.label}</div>
              <span className="step-status">{step.status}</span>
              <div className="step-date">{step.date}</div>
              <div className="step-sub">{step.sub}</div>
            </div>
          ))}
        </div>

        <div className="tracker-legend">
          <div className="legend-items">
            <span><span className="dot dot-approved">●</span> Approved</span>
            <span><span className="dot dot-yourturn">●</span> Your Turn</span>
            <span><span className="dot dot-rejected">●</span> Rejected</span>
            <span><span className="dot dot-queued">●</span> Queued</span>
          </div>
        </div>
      </div>

      {/* History Logs */}
      <div className="card history-card">
        <h3>📑 Approval History & Remarks</h3>

        <div className="history-list">
          {fullHistory.map((log, index) => {
            const badgeBg = log.state === 'approved' ? '#10b981' : log.state === 'rejected' ? '#ef4444' : '#3b82f6';
            const iconBg = log.state === 'approved' ? '#d1fae5' : log.state === 'rejected' ? '#fee2e2' : '#dbeafe';
            const iconColor = log.state === 'approved' ? '#047857' : log.state === 'rejected' ? '#ef4444' : '#1d4ed8';

            return (
              <div key={index} className={`history-item ${log.state}`}>
                <div className="history-icon" style={{ backgroundColor: iconBg, color: iconColor }}>
                  {log.state === 'approved' ? '✓' : log.state === 'rejected' ? '✕' : '🛡️'}
                </div>
                <div className="history-content">
                  <div className="history-header">
                    <strong>
                      {log.role}
                      {log.badge && <span className="action-badge" style={{ backgroundColor: badgeBg }}>{log.badge}</span>}
                    </strong>
                    <div className="history-meta-right">
                      <span className="history-date">{log.date}</span>
                      {log.approverName && <div className="history-approver-name">{log.approverName}</div>}
                    </div>
                  </div>
                  <p>{log.text}</p>
                </div>
              </div>
            );
          })}
          {fullHistory.length === 1 && currentData.status !== 'Rejected' && currentData.status !== 'Approved' && (
             <div className="history-item pending">
               <div className="history-icon">🛡️</div>
               <div className="history-content">
                 <div className="history-header">
                   <strong>
                     Pending Next Action
                     <span className="action-badge">Pending</span>
                   </strong>
                   <div className="history-meta-right">
                     <span className="history-date">Awaiting</span>
                   </div>
                 </div>
                 <p>Reviewing facility booking and awaiting next approval.</p>
               </div>
             </div>
          )}
        </div>
      </div>

      {/* --- ACTION CONFIRMATION MODAL --- */}
      {pendingAction && (
        <div className="modal-overlay high-z">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className={`modal-title ${pendingAction === 'approved' ? 'success' : 'error'}`}>
              Confirm {pendingAction === 'approved' ? 'Approval' : pendingAction === 'rejected' ? 'Rejection' : 'Return for Modification'}
            </h3>
            <p className="modal-message">
              {pendingAction === 'to_modify'
                ? 'This will return the reservation to the requestor for changes and notify them using the remark entered above.'
                : pendingAction === 'rejected'
                  ? 'This will reject the reservation and notify the requestor using the remark entered above.'
                  : 'This action will update the status and notify the requestor.'}
            </p>
            <div className="modal-actions">
              <button 
                onClick={() => {
                  setPendingAction(null);
                  setActionRemarkError('');
                }}
                className="modal-button cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleAction(pendingAction)}
                disabled={['rejected', 'to_modify'].includes(pendingAction) && !remarks.trim()}
                className={`modal-button ${pendingAction === 'approved'
                  ? 'confirm-approve-btn'
                  : pendingAction === 'to_modify' ? 'confirm-modify-btn' : 'confirm-reject-btn'}`}
              >
                {pendingAction === 'approved' ? 'Approve' : pendingAction === 'rejected' ? 'Reject' : 'To Modify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {customAlert && (
        <div className="modal-overlay alert-z">
          <div className="modal-card">
            <h3 className={customAlert.isSuccess ? 'modal-title success' : 'modal-title error'}>
              {customAlert.title}
            </h3>
            <p className="modal-message">
              {customAlert.message}
            </p>
            <div className="modal-actions">
              <button onClick={() => setCustomAlert(null)} className="modal-button understood-btn">
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PendingRequest;