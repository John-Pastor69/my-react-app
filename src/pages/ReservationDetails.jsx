import { jsPDF } from 'jspdf';
import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import { getApprovalTrackerSteps, normalizeApprovalRoleKey } from '../services/approvalWorkflow';
import { getReservationDynamicAttributes, getSignupConfiguration } from '../services/signupOptions';
import { getReservationScheduleForFacility } from '../services/reservationConflicts';
import '../styles/ReservationDetails.scss';

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

const addMiddleInitial = (fullName, middleInitial) => {
  const name = formatName(fullName);
  const initial = String(middleInitial || '').trim().replace(/\./g, '').charAt(0);
  const parts = name.split(/\s+/);
  const alreadyHasInitial = parts.slice(1, -1).some(
    (part) => part.replace(/\./g, '').toLowerCase() === initial.toLowerCase()
  );
  if (!initial || alreadyHasInitial) return name;
  if (parts.length < 2) return name;
  return `${parts.slice(0, -1).join(' ')} ${initial}. ${parts[parts.length - 1]}`;
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

// --- DATE CONDENSER FOR PDF (Groups consecutive dates & hides years) ---
const condenseDateList = (dateStrings) => {
  if (!dateStrings || dateStrings.length === 0) return "";

  const sortedDates = dateStrings
    .map(dStr => {
      const parsed = new Date(dStr.includes('T') ? dStr : `${dStr}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? new Date(dStr) : parsed;
    })
    .filter(d => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (sortedDates.length === 0) return dateStrings.join(', ');

  const ranges = [];
  let rangeStart = sortedDates[0];
  let prevDate = sortedDates[0];

  const formatDay = (d) => d.toLocaleString('en-US', { month: 'short', day: 'numeric' });

  for (let i = 1; i <= sortedDates.length; i++) {
    const currDate = sortedDates[i];
    
    // Check if consecutive (difference of 1 day)
    if (currDate && Math.round((currDate - prevDate) / 86400000) === 1) {
      prevDate = currDate;
    } else {
      if (rangeStart.getTime() === prevDate.getTime()) {
        ranges.push(formatDay(rangeStart));
      } else if (rangeStart.getMonth() === prevDate.getMonth()) {
        ranges.push(`${formatDay(rangeStart)}-${prevDate.getDate()}`); 
      } else {
        ranges.push(`${formatDay(rangeStart)} - ${formatDay(prevDate)}`);
      }
      rangeStart = currDate;
      prevDate = currDate;
    }
  }
  return ranges.join(', ');
};

const ReservationDetails = ({
  data,
  additionalActions = null,
  showRequestorInfo = true,
  showApprovalTracker = true,
  showApprovalHistory = true
}) => {
  const [currentData, setCurrentData] = useState(data);
  const [facilitiesMap, setFacilitiesMap] = useState({});
  const [equipmentMap, setEquipmentMap] = useState({});
  const [utilitiesMap, setUtilitiesMap] = useState({});
  const [approverProfiles, setApproverProfiles] = useState({});
  const [requestorRole, setRequestorRole] = useState('requestor');
  const [requestorAccountType, setRequestorAccountType] = useState('N/A');
  const [expandedTimeGroups, setExpandedTimeGroups] = useState({});
  const [showFacilityParticipants, setShowFacilityParticipants] = useState(false);
  const [signupConfiguration, setSignupConfiguration] = useState(() => getSignupConfiguration());

  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('');

  useEffect(() => onSnapshot(
    doc(db, 'app_settings', 'signupOptions'),
    (snapshot) => setSignupConfiguration(getSignupConfiguration(snapshot.data() || {})),
    (error) => console.error('Failed to load signup options for reservation details:', error)
  ), []);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const fetchCurrentUserRole = async () => {
      if (!currentUser) {
        setCurrentUserRole('');
        return;
      }

      try {
        let userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        let role = '';

        if (userSnap.exists()) {
          role = userSnap.data().role || '';
        } else {
          userSnap = await getDoc(doc(db, 'super_users', currentUser.uid));
          if (userSnap.exists()) {
            role = userSnap.data().role || 'super admin';
          }
        }

        if (isCurrent) {
          setCurrentUserRole(role.toLowerCase().trim().replace(/_/g, ' '));
        }
      } catch (error) {
        console.error('Failed to load current user role for PDF access:', error);
        if (isCurrent) setCurrentUserRole('');
      }
    };

    fetchCurrentUserRole();
    return () => {
      isCurrent = false;
    };
  }, [currentUser]);

  // Real-time listener for this specific reservation doc
  useEffect(() => {
    if (!currentUser || !data?.id) return;
    const unsubscribe = onSnapshot(doc(db, 'reservations', data.id), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentData({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return () => unsubscribe();
  }, [currentUser, data?.id]);

  useEffect(() => {
    let isCurrent = true;
    const approvalLogs = Array.isArray(currentData?.historyLogs) ? currentData.historyLogs : [];
    const approvalRecords = Object.values(currentData?.approvals || {});
    const approvers = [...approvalLogs, ...approvalRecords]
      .filter((record) => record && (record.approverId || record.approverEmail))
      .map((record) => ({
        id: record.approverId || '',
        email: record.approverEmail || '',
        collection: record.approverCollection || ''
      }));

    const uniqueApprovers = [...new Map(
      approvers.map((approver) => [
        `${approver.collection}:${approver.id || approver.email}`,
        approver
      ])
    ).values()];

    const loadApproverProfiles = async () => {
      try {
        const profileEntries = await Promise.all(uniqueApprovers.map(async (approver) => {
          const collections = approver.collection
            ? [approver.collection]
            : ['super_users', 'users'];
          for (const collectionName of collections) {
            if (!['super_users', 'users'].includes(collectionName)) continue;
            const profileRef = approver.id
              ? doc(db, collectionName, approver.id)
              : null;
            const profileSnap = profileRef ? await getDoc(profileRef) : null;
            if (profileSnap?.exists()) {
              const profile = profileSnap.data();
              const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
                || profile.name
                || '';
              return [`${collectionName}:${approver.id}`, {
                name,
                middleInitial: profile.middleInitial || profile.personal_information?.middle_initial || ''
              }];
            }

            if (approver.email) {
              const profileQuery = query(
                collection(db, collectionName),
                where('email', '==', approver.email)
              );
              const profileResults = await getDocs(profileQuery);
              if (!profileResults.empty) {
                const profile = profileResults.docs[0].data();
                const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
                  || profile.name
                  || '';
                return [`${collectionName}:${approver.id || approver.email}`, {
                  name,
                  middleInitial: profile.middleInitial || profile.personal_information?.middle_initial || ''
                }];
              }
            }
          }
          return [`${approver.collection}:${approver.id || approver.email}`, ''];
        }));

        if (isCurrent) {
          setApproverProfiles(Object.fromEntries(profileEntries));
        }
      } catch (error) {
        console.error('Failed to load approver profiles for reservation PDF:', error);
      }
    };

    loadApproverProfiles();
    return () => {
      isCurrent = false;
    };
  }, [currentData]);

  // Fetch requestor's actual role to determine if endorser should be skipped
  useEffect(() => {
    const fetchRequestorRole = async () => {
      if (!currentData) return;
      setRequestorAccountType('N/A');
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
        setRequestorAccountType(userDoc?.accountType || currentData.requestorInfo?.accountType || 'N/A');
        if (userDoc && userDoc.role) {
          setRequestorRole(userDoc.role.toLowerCase().trim());
        }
      } catch (err) {
        console.error("Error fetching requestor role:", err);
      }
    };
    fetchRequestorRole();
  }, [currentData]);

  // Fetch facilities and equipments mapping
  useEffect(() => {
    if (!currentUser) return;
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
  }, [currentUser]);

  if (!currentData) return <div className="loading-text">Loading reservation details...</div>;

  // --- DYNAMIC DATA MAPPING ---
  const refNo = currentData.refNo || 'N/A';
  const eventName = currentData.eventName || 'Untitled Event';
  const eventType = Array.isArray(currentData.eventType) ? currentData.eventType.join(', ') : (currentData.eventType || 'N/A');
  const eventDate = formatEventDateRange(currentData.eventDate, currentData.days);
  const facilityIds = currentData.facilities || [];
  const facilityScheduleEntries = facilityIds.length > 0
    ? facilityIds.flatMap((id) => getReservationScheduleForFacility(currentData, id).map((entry) => ({
      ...entry,
      facilityName: facilitiesMap[id]?.name || id
    })))
    : getReservationScheduleForFacility(currentData, null).map((entry) => ({
      ...entry,
      facilityName: ''
    }));
  const scheduledYears = new Set(facilityScheduleEntries.map((entry) => (
    String(entry.date || '').match(/^\d{4}-/)?.[0]
      || String(entry.date || '').match(/\/(\d{4})$/)?.[1]
      || ''
  )).filter(Boolean));
  const includeYearInScheduleDates = scheduledYears.size > 1;
  
  const dailyTimeEntries = facilityScheduleEntries
    .reduce((groups, entry) => {
      const parsedDate = new Date(`${entry.date}T00:00:00`);
      const dateLabel = Number.isNaN(parsedDate.getTime())
        ? entry.date
        : parsedDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          ...(includeYearInScheduleDates ? { year: 'numeric' } : {})
        });
      
      const time = `${entry.startTime || 'N/A'} – ${entry.endTime || 'N/A'}`;
      const existingGroup = groups.find((group) => (
        group.facilityName === entry.facilityName && group.time === time
      ));
      
      if (existingGroup) {
        existingGroup.dates.push(dateLabel);
        existingGroup.rawDates.push(entry.date);
      } else {
        groups.push({ dates: [dateLabel], rawDates: [entry.date], time, facilityName: entry.facilityName });
      }
      return groups;
    }, []);

  // Replaced generic pdfDates mapping with condenseDateList for cleaner PDF Output
  const eventTime = dailyTimeEntries.length > 0
    ? dailyTimeEntries.map(({ rawDates, time, facilityName }) => (
      `${facilityName ? `${facilityName}: ` : ''}${time} [${condenseDateList(rawDates)}]`
    )).join('\n')
    : `${currentData.startTime || ''} – ${currentData.endTime || ''}`;

  const renderDailyTimeDisplay = (variant) => {
    if (dailyTimeEntries.length === 0) return eventTime;

    return (
      <div className={`daily-time-list ${variant}`}>
        {dailyTimeEntries.map(({ dates, time, facilityName }, index) => {
          const groupKey = `${variant}-${facilityName}-${time}`;
          const isExpanded = Boolean(expandedTimeGroups[groupKey]);
          const visibleDates = dates.slice(0, 2);
          const additionalDates = dates.slice(2);
          const expandedDatesId = `daily-time-dates-${variant}-${index}`;

          return (
            <div className="daily-time-entry" key={groupKey}>
              {facilityName && <strong className="daily-time-facility">{facilityName}</strong>}
              <span className="daily-time-range">{time}</span>
              <div className="daily-time-date-group">
                <span className="daily-time-date">[{visibleDates.join(', ')}]</span>
                {(dates.length > 2) && (
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
    );
  };
  const eventTimeDisplay = renderDailyTimeDisplay('details');
  const summaryTimeDisplay = renderDailyTimeDisplay('summary');
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
  const locationDisplay = floorLocations.length > 0 ? floorLocations.join(' | ') : 'N/A';
  const specificRoomDisplay = currentData.specificRoom?.trim() || 'N/A';

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
  const endorserEmail = currentData.endorserEmail || 'N/A';
  const endorserDynamicAttributes = getReservationDynamicAttributes(
    currentData,
    'endorser',
    signupConfiguration
  );
  const endorsedBy = currentData.endorserName ? endorserName : 'N/A';

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
    reservationStatus: currentData.status
  });

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

  const normalizedReservationStatus = (currentData.status || '').toLowerCase().trim();
  const bannerStatusClass = normalizedReservationStatus === 'approved'
    ? 'approved'
    : normalizedReservationStatus === 'rejected' ? 'rejected' : 'pending';
  const isApprovedStatus = normalizedReservationStatus === 'approved';
  const isPdfAdmin = ['building admin', 'mis', 'mis admin', 'super admin'].includes(
    currentUserRole.replace(/_/g, ' ')
  );
  const isReservationOwner = Boolean(currentUser && (
    currentData.userId === currentUser.uid
    || (currentData.userEmail || '').toLowerCase() === (currentUser.email || '').toLowerCase()
  ));
  const canDownloadPdf = isApprovedStatus && (isPdfAdmin || isReservationOwner);

  const airconDisplay = currentData.aircon 
    ? "ON" + ((currentData.airconOnTime || currentData.airconOffTime) ? ` (${currentData.airconOnTime || '?'} - ${currentData.airconOffTime || '?'})` : "") 
    : "OFF";

  // --- PROGRAMMATIC VECTOR PDF GENERATOR ---
  const handleDownloadPDF = () => {
    if (!canDownloadPdf) return;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    const columnWidth = contentWidth / 3;
    let y = 18;

    const checkPageBreak = (neededHeight) => {
      if (y + neededHeight > pageHeight - 15) {
        pdf.addPage();
        drawWatermark();
        y = 18;
      }
    };

    // Helper: Draw Custom Diagonal Watermark
    const drawWatermark = () => {
      pdf.saveGraphicsState();
      pdf.setGState(new pdf.GState({ opacity: 0.15 })); 
      // Semi-transparent Green matching Word doc settings
      pdf.setTextColor(112, 173, 71); 
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(100);
      
      const text = 'APPROVED';
      const textWidth = pdf.getStringUnitWidth(text) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
      
      const centerX = (pageWidth / 2) + 30;
      const centerY = (pageHeight / 2) + 45;

      pdf.text(text, centerX, centerY, { 
        align: 'center', 
        angle: 45, 
        renderingMode: 'fill'
      });
      pdf.restoreGraphicsState();
    };

    drawWatermark();

    // 1. Formal Institutional Header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(15, 23, 42);
    pdf.text('STI COLLEGE GLOBAL CITY', pageWidth / 2, y, { align: 'center' });
    y += 6;

    pdf.setFontSize(11);
    pdf.text('FACILITY AND EQUIPMENT RESERVATION SLIP', pageWidth / 2, y, { align: 'center' });
    y += 5;

    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.6);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 4;

    // 2. Top Reference Bar
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(6, 95, 70);
    pdf.text(`REFERENCE NO: ${refNo}`, margin, y);
    y += 6;

    const drawSectionHeader = (title) => {
      checkPageBreak(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(30, 41, 59);
      pdf.text(title.toUpperCase(), margin, y);
      y += 4.5;
    };

    const drawGrid = (items) => {
      let row = [];
      let usedColumns = 0;
      const rows = [];

      const flushRow = () => {
        if (row.length) rows.push(row);
        row = [];
        usedColumns = 0;
      };

      items.forEach((item) => {
        const span = item.span || 1;
        if (span === 3) {
          flushRow();
          rows.push([item]);
          return;
        }
        if (usedColumns + span > 3) flushRow();
        row.push(item);
        usedColumns += span;
        if (usedColumns === 3) flushRow();
      });
      flushRow();

      rows.forEach((gridRow) => {
        const rowHeight = Math.max(...gridRow.map((item) => {
          const itemWidth = columnWidth * (item.span || 1);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7.2);
          const labelLines = pdf.splitTextToSize(String(item.label).toUpperCase(), itemWidth - 3);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          const valueLines = pdf.splitTextToSize(String(item.value || 'N/A'), itemWidth - 3);
          return labelLines.length * 2.8 + 0.5 + valueLines.length * 3.2 + 1;
        }));
        checkPageBreak(rowHeight);

        let currentColumn = 0;
        gridRow.forEach((item) => {
          const span = item.span || 1;
          const itemWidth = columnWidth * span;
          const itemX = margin + currentColumn * columnWidth;

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7.2);
          pdf.setTextColor(100, 116, 139);
          const labelLines = pdf.splitTextToSize(String(item.label).toUpperCase(), itemWidth - 3);
          pdf.text(labelLines, itemX, y);

          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          pdf.setTextColor(15, 23, 42);
          const valueLines = pdf.splitTextToSize(String(item.value || 'N/A'), itemWidth - 3);
          const valueY = y + labelLines.length * 2.8 + 0.5;
          pdf.text(valueLines, itemX, valueY);
          currentColumn += span;
        });

        y += rowHeight + 1;
      });
    };

    // 3. Section: Requestor Information
    drawSectionHeader('Requestor Information');
    drawGrid([
      { label: 'Full Name', value: requestorName },
      { label: 'Contact Number', value: contactNumber },
      { label: 'Account Type', value: requestorAccountType },
      ...requestorDynamicAttributes,
      { label: 'Email Address', value: email },
      { label: 'Date Submitted', value: dateSubmitted }
    ]);

    // 4. Section: Endorser Information
    if (hasEndorser) {
      drawSectionHeader('Endorser Information');
      drawGrid([
        { label: "Endorser's Full Name", value: endorserName },
        { label: 'Contact Email', value: endorserEmail },
        ...endorserDynamicAttributes
      ]);
    }

    // 5. Section: Event Information
    drawSectionHeader('Event Information');
    const eventItems = [
      { label: 'Event Name', value: eventName },
      { label: 'Event Type', value: eventType },
      { label: 'Event Date', value: eventDate },
      { label: 'Time', value: eventTime.replace('–', '-') },
      { label: 'Expected Attendees', value: expectedAttendees }
    ];
    if (participantBreakdown.length > 0) {
      eventItems.push({
        label: 'Participant Breakdown',
        value: participantBreakdown.map(({ name, participants }) => `${name}: ${participants} attendees`).join('; ')
      });
    }
    eventItems.push({ label: 'Event Description / Purpose', value: description });
    drawGrid(eventItems);

    // 6. Section: Facility & Equipment Details
    drawSectionHeader('Facility & Equipment Details');
    drawGrid([
      { label: 'Facility Name', value: facilityDisplay },
      { label: 'Room Capacity', value: capacityDisplay },
      { label: 'Floor / Location', value: locationDisplay },
      { label: 'Specific Room', value: specificRoomDisplay },
      { label: 'Air Conditioning', value: airconDisplay },
      { label: 'Utility Requested', value: utilityRequested },
      { label: 'Equipment Requested', value: equipmentRequested }
    ]);

    // 7. Section: Approvals
    const approvalHistory = Array.isArray(currentData.historyLogs) ? currentData.historyLogs : [];
    const approverSteps = trackerSteps
      .filter(step => step.state === 'approved' && step.key !== 'requestor' && step.status !== 'Skipped')
      .map((step) => {
        const approvalLog = [...approvalHistory].reverse().find((log) => (
          log.state === 'approved'
          && (
            normalizeApprovalRoleKey(log.approvalRoleKey) === step.key
            || normalizeApprovalRoleKey(log.role) === step.key
            || normalizeApprovalRoleKey(log.role).startsWith(`${step.key} (`)
          )
        ));
        const approvalRecord = currentData.approvals?.[step.key];
        const approverId = approvalLog?.approverId || approvalRecord?.approverId || '';
        const approverEmail = approvalLog?.approverEmail || approvalRecord?.approverEmail || '';
        const approverIdentity = approverId || approverEmail;
        const approverCollection = approvalLog?.approverCollection
          || approvalRecord?.approverCollection
          || '';
        const approverProfile = approverProfiles[`${approverCollection}:${approverIdentity}`]
          || approverProfiles[`super_users:${approverId}`]
          || approverProfiles[`users:${approverId}`]
          || approverProfiles[`super_users:${approverEmail}`]
          || approverProfiles[`users:${approverEmail}`]
          || {};
        const profileName = typeof approverProfile === 'string' ? approverProfile : approverProfile.name;
        const profileMiddleInitial = typeof approverProfile === 'string' ? '' : approverProfile.middleInitial;
        const approverName = approvalLog?.approverName
          || approvalRecord?.approverName
          || profileName
          || (step.key === 'endorser' ? endorserName : 'Name unavailable');

        return {
          ...step,
          approverName: addMiddleInitial(approverName, profileMiddleInitial),
          approvalDate: approvalLog?.date || approvalRecord?.date || step.date
        };
      });

    drawSectionHeader('Approvals');
    if (approverSteps.length > 0) {
      drawGrid(approverSteps.map((step) => ({
        label: 'Approved by',
        value: `${step.approverName}\nRole: ${step.label}\nDate: ${step.approvalDate}`
      })));
    } else {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text('No approvals recorded.', margin, y);
      y += 6;
    }

    // 8. Footer Timestamp
    checkPageBreak(15);
    y += 2;
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.6);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 5;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} — Official Reservation Slip (${refNo})`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );

    pdf.save(`${refNo}.pdf`);
  };

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
                <div className="val font-bold word-break">{eventName}</div>
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
                <div className="val">{eventTimeDisplay}</div>
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
              <div className="val desc-text word-break">{description}</div>
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
                <div className="val word-break">{locationDisplay}</div>
              </div>
              <div>
                <label>SPECIFIC ROOM</label>
                <div className="val word-break">{specificRoomDisplay}</div>
              </div>
              <div>
                <label>AIR CONDITIONING</label>
                <div className="val">{airconDisplay}</div>
              </div>
              <div className="equipment-requested-field">
                <label>UTILITY REQUESTED</label>
                <div className="val">{utilityRequested}</div>
              </div>
              <div className="equipment-requested-field">
                <label>EQUIPMENT REQUESTED</label>
                <div className="val">{equipmentRequested}</div>
              </div>
            </div>
          </div>

          {/* Card 3: Requestor Information */}
          {showRequestorInfo && (
            <div className="card">
              <h3><span className="card-icon">👤</span> Requestor Information</h3>
              <div className="info-grid people-info-grid">
                <div>
                  <label>FULL NAME</label>
                  <div className="val font-bold word-break">{requestorName}</div>
                </div>
                <div>
                  <label>CONTACT NUMBER</label>
                  <div className="val word-break">{contactNumber}</div>
                </div>
                <div>
                  <label>ACCOUNT TYPE</label>
                  <div className="val word-break">{requestorAccountType}</div>
                </div>
                <div>
                  <label>EMAIL ADDRESS</label>
                  <div className="val word-break">{email}</div>
                </div>
                <div>
                  <label>DATE SUBMITTED</label>
                  <div className="val">{dateSubmitted}</div>
                </div>
                {requestorDynamicAttributes.map(({ key, label, value }) => (
                  <div className="info-field" key={`requestor-${key}`}>
                    <label>{label.toUpperCase()}</label>
                    <div className="val word-break">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card 4: Endorser Information (Conditional) */}
          {showRequestorInfo && hasEndorser && (
            <div className="card">
              <div className="endorser-header-row">
                <h3><span className="card-icon">🤵</span> Endorser Information</h3>
                <span className="endorser-badge">Student Role Only</span>
              </div>
              <div className="info-grid people-info-grid">
                <div>
                  <label>ENDORSER'S FULL NAME</label>
                  <div className="val font-bold word-break">{endorserName}</div>
                </div>
                <div className="info-field">
                  <label>CONTACT EMAIL</label>
                  <div className="val word-break">{endorserEmail}</div>
                </div>
                {endorserDynamicAttributes.map(({ key, label, value }) => (
                  <div className="info-field" key={`endorser-${key}`}>
                    <label>{label.toUpperCase()}</label>
                    <div className="val word-break">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Summary */}
        <div className="sidebar-col">
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
                <span className="val">{summaryTimeDisplay}</span>
              </div>
              <div className="summary-item">
                <span className="label">Attendees</span>
                <span className="val">{expectedAttendees}</span>
              </div>
              
              {hasEndorser && (
                <div className="summary-item">
                  <span className="label">Endorsed By</span>
                  <span className="val word-break">{endorsedBy}</span>
                </div>
              )}
            </div>
          </div>

          {/* Download PDF Button */}
          {canDownloadPdf && (
            <button
              className="download-pdf-btn is-approved"
              onClick={handleDownloadPDF}
            >
              📄 Download PDF
            </button>
          )}
          {additionalActions}
        </div>
      </div>

      {/* Approval Tracker */}
      {showApprovalTracker && (
        <div className="card tracker-card">
        <h3>📊 Approval Tracker</h3>

        <div className="pipeline-container">
          {trackerSteps.map((step, index) => (
            <div key={index} className={`pipeline-step ${step.state}`}>
              {index < trackerSteps.length - 1 && <div className="step-line" />}
              <div className="step-circle">
                {step.state === 'approved' ? '✓' : step.state === 'rejected' ? '✕' : index + 1}
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
            <span><span className="dot dot-rejected">●</span> Rejected</span>
            <span><span className="dot dot-queued">●</span> Queued</span>
          </div>
        </div>
        </div>
      )}

      {/* History Logs */}
      {showApprovalHistory && (
        <div className="card history-card">
        <h3>📑 Approval History & Remarks</h3>

        <div className="history-list">
          {fullHistory.map((log, index) => {
            return (
              <div key={index} className={`history-item ${log.state}`}>
                <div className="history-icon">
                  {log.state === 'approved' ? '✓' : log.state === 'rejected' ? '✕' : '🛡️'}
                </div>
                <div className="history-content">
                  <div className="history-header">
                    <strong>
                      {log.role}
                      {log.badge && <span className="action-badge">{log.badge}</span>}
                    </strong>
                    <div className="history-meta-right">
                      <span className="history-date">{log.date}</span>
                      {log.approverName && <div className="history-approver-name">{log.approverName}</div>}
                    </div>
                  </div>
                  <p className="word-break">{log.text}</p>
                </div>
              </div>
            );
          })}
          {fullHistory.length === 1 && currentData.status !== 'Rejected' && currentData.status !== 'Approved' && (
             <div className="history-item pending">
               <div className="history-icon">🛡</div>
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
      )}
    </div>
  );
};

export default ReservationDetails;