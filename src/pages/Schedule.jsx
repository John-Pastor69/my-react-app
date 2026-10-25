import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, deleteDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import '../styles/Schedule.scss';
import ReservationDetails from './ReservationDetails';

const Schedule = ({ currentUserRole = '' }) => {
  const navigate = useNavigate();
  // --- STATE MANAGEMENT ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [deleteModalData, setDeleteModalData] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cancellationRemark, setCancellationRemark] = useState('');
  const [cancellationError, setCancellationError] = useState('');
  const [reservationsData, setReservationsData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const normalizedUserRole = currentUserRole.toLowerCase().trim().replace(/_/g, ' ');
  const canCancelApprovedReservations = ['mis', 'mis admin', 'building admin', 'super admin'].includes(normalizedUserRole);
  
  // --- REAL-TIME FIRESTORE LISTENERS ---
  useEffect(() => {
    if (!currentUser) return; // Added safeguard

    const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const resList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setReservationsData(resList);
    }, (error) => console.error('Failed to load reservations:', error));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setUsersData(usersList);
    }, (error) => console.error('Failed to load users:', error));

    return () => {
      unsubRes();
      unsubUsers();
    };
  }, [currentUser]);

  // --- TRACK CURRENT USER ---
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(setCurrentUser);
    return () => unsubscribeAuth();
  }, []);

  // --- MAP & JOIN DATA ---
  const scheduleData = reservationsData
    .filter(res => (
      currentUser
      && (res.userId === currentUser.uid || res.userEmail === currentUser.email)
      && (res.status || '').toLowerCase().trim() !== 'rejected'
    ))
    .map((res, index) => {
      const requestor = usersData.find(u => u.email === res.userEmail || u.uid === res.userId) || {};
      
      let submitDate = 'Unknown';
      if (res.createdAt) {
        const d = new Date(res.createdAt);
        submitDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }

      let equipCount = 0;
      if (res.selectedEquip) {
        equipCount = Object.values(res.selectedEquip).filter(val => Number(val) > 0).length;
      }
      const facCount = (res.facilities || []).length;
      let reqSubtext = '';
      if (facCount > 0 || equipCount > 0) reqSubtext = `${facCount} Facility, ${equipCount} Equipment`;
      else reqSubtext = 'No items requested';

      const icons = ['icon-blue', 'icon-purple', 'icon-yellow', 'icon-green', 'icon-pink'];
      const iconClass = icons[index % icons.length];

      let displayRole = 'Requestor';
      if (requestor.role) {
        displayRole = requestor.role.replace(/_/g, ' ').toUpperCase();
      }

      const fullName = (requestor.name || res.fullName || 'Unknown User')
        .replace(/\s*\(Student\)/i, '')
        .trim();
      const [lastName, ...givenNames] = fullName.split(',');
      const cleanName = givenNames.length
        ? `${givenNames.join(',').trim()} ${lastName.trim()}`
        : fullName;

      const getScheduleStatus = () => {
        const status = (res.status || 'Pending').toLowerCase().trim();
        if (status === 'approved') return 'approved';
        if (status === 'rejected') return 'rejected';
        if (status === 'cancelled') return 'cancelled';
        if (status === 'to modify') return 'to_modify';
        return 'pending'; 
      };

      return {
        id: res.id,
        refNo: String(res.refNo || ''),
        event: res.eventName || 'Untitled Event',
        equip: reqSubtext,
        submit: submitDate,
        name: cleanName,
        role: displayRole,
        avatarUrl: requestor.avatarUrl || null,
        initial: cleanName.charAt(0).toUpperCase(),
        date: res.eventDate || 'No Date',
        time: `${res.startTime || ''} - ${res.endTime || ''}`,
        scheduleStatus: getScheduleStatus(),
        iconClass: iconClass,
        icon: 'ph-calendar-check',
        rawDate: res.createdAt ? new Date(res.createdAt) : new Date(0),
        fullData: res 
      };
    }).sort((a, b) => b.rawDate - a.rawDate); 

  // --- SEARCH & FILTER LOGIC ---
  const filteredData = scheduleData.filter((row) =>
    row.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.refNo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- DELETION LOGIC ---
  const confirmDelete = async () => {
    if (!deleteModalData) return;
    const remark = cancellationRemark.trim();
    if (!remark) {
      setCancellationError('A cancellation remark is required.');
      return;
    }

    setIsDeleting(true);
    setCancellationError('');
    try {
      const cancelledAt = new Date().toISOString();
      const cancellationLog = {
        id: `cancelled-${Date.now()}`,
        role: 'Requestor',
        badge: 'Cancelled',
        date: cancelledAt,
        approverName: deleteModalData.fullData.fullName || currentUser?.email || 'Requestor',
        text: remark,
        state: 'cancelled'
      };
      const cancellationData = {
        status: 'Cancelled',
        cancellationRemark: remark,
        cancelledAt,
        cancelledBy: currentUser?.uid || '',
        cancelledByEmail: currentUser?.email || '',
        historyLogs: arrayUnion(cancellationLog)
      };
      const reservationRef = doc(db, 'reservations', deleteModalData.id);
      await updateDoc(reservationRef, cancellationData);
      const { id, ...reservationData } = deleteModalData.fullData;
      await setDoc(doc(db, 'archive', id), {
        ...reservationData,
        ...cancellationData,
        historyLogs: [
          ...(Array.isArray(reservationData.historyLogs) ? reservationData.historyLogs : []),
          cancellationLog
        ]
      }, { merge: true       });
      await deleteDoc(reservationRef);
      setDeleteModalData(null);
      setCancellationRemark('');
    } catch (error) {
      console.error("Error cancelling reservation:", error);
      setCancellationError('The reservation could not be cancelled and moved to history. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="schedule-container">
      <div className="schedule-main-card">
        <div className="card-header">
          <div className="title-group">
            <h3>Schedule</h3>
          </div>
          <div className="controls-group">
            <div className="search-box">
              <i className="ph ph-magnifying-glass"></i>
              <input 
                type="text" 
                placeholder="Search requests or reference no..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <div className="col-event">EVENT NAME</div>
            <div className="col-requestor">REQUESTOR</div>
            <div className="col-resources">RESOURCES</div>
            <div className="col-date">DATE</div>
            <div className="col-action">ACTION</div>
          </div>

          <div className="table-body">
            {filteredData.length > 0 ? (
              filteredData.map((row) => (
                <div className="table-row" key={row.id}>
                  <div className="col-event">
                    <div className="event-details">
                      <strong>
                        {row.event}
                        {row.scheduleStatus === 'pending' && <span className="status-dot pending" title="Pending"></span>}
                        {row.scheduleStatus === 'approved' && <span className="status-dot approved" title="Approved"></span>}
                        {row.scheduleStatus === 'rejected' && <span className="status-dot rejected" title="Rejected"></span>}
                        {row.scheduleStatus === 'cancelled' && <span className="status-dot cancelled" title="Cancelled"></span>}
                        {row.scheduleStatus === 'to_modify' && <span className="status-dot pending" title="Returned for modification"></span>}
                      </strong>
                      <span>Submitted {row.submit}</span>
                    </div>
                  </div>
                  <div className="col-requestor">
                    {row.avatarUrl ? (
                      <img src={row.avatarUrl} alt="Avatar" className="avatar avatar-cover" />
                    ) : (
                      <div className="avatar">{row.initial}</div>
                    )}
                    <div className="requestor-details">
                      <strong>{row.name}</strong>
                      <span>{row.role}</span>
                    </div>
                  </div>
                  <div className="col-resources">{row.equip}</div>
                  <div className="col-date">
                    <div className="date-details">
                      <strong>{row.date}</strong>
                      <span>{row.time}</span>
                    </div>
                  </div>
                  <div className="col-action">
                    {row.scheduleStatus === 'to_modify' ? (
                      <button
                        className="btn-view btn-edit-reservation"
                        onClick={() => navigate(`/reserve?edit=${encodeURIComponent(row.id)}`)}
                      >
                        <i className="ph ph-pencil-simple"></i> Edit Reservation
                      </button>
                    ) : (
                      <button className="btn-view" onClick={() => setSelectedRequest(row)}>
                        <i className="ph ph-eye"></i> View Details
                      </button>
                    )}
                    {row.scheduleStatus !== 'rejected'
                      && (row.scheduleStatus !== 'approved' || canCancelApprovedReservations) && (
                      <button
                        className="btn-delete"
                        onClick={() => {
                          setDeleteModalData(row);
                          setCancellationRemark('');
                          setCancellationError('');
                        }}
                        title="Cancel Reservation"
                      >
                        <i className="ph ph-x"></i>
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-events-message">
                No matching events found.
              </div>
            )}
          </div>
        </div>

        <div className="card-footer">
          <span className="showing-text">
            Showing all {filteredData.length} requests
          </span>
        </div>
      </div>

      {/* --- MODAL POPUP --- */}
      {selectedRequest && (
        <div className="modal-overlay">
          <div className="modal-wrapper">
            <button className="close-modal-btn" onClick={() => setSelectedRequest(null)}>
              ✕
            </button>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <ReservationDetails data={selectedRequest.fullData} />
            </div>
          </div>
        </div>
      )}

      {/* --- DELETE CONFIRMATION MODAL --- */}
      {deleteModalData && (
        <div className="modal-overlay delete-modal-overlay">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title error">Confirm Cancelation</h3>
            <p className="modal-message">
              Add a remark to cancel the reservation for <strong>{deleteModalData.event}</strong>. It will be marked cancelled, moved to history, and removed from your active schedule.
            </p>
            <label className="cancellation-remark">
              <span>Cancellation remark <strong>*</strong></span>
              <textarea
                value={cancellationRemark}
                onChange={(event) => {
                  setCancellationRemark(event.target.value);
                  if (event.target.value.trim()) setCancellationError('');
                }}
                placeholder="Explain why this reservation is being cancelled..."
                rows={4}
                required
                disabled={isDeleting}
              />
            </label>
            {cancellationError && <p className="cancellation-error" role="alert">{cancellationError}</p>}
            <div className="modal-actions">
              <button 
                onClick={() => {
                  setDeleteModalData(null);
                  setCancellationRemark('');
                  setCancellationError('');
                }}
                className="modal-button btn-modal-cancel"
                disabled={isDeleting}
              >
                Back
              </button>
              <button 
                onClick={confirmDelete}
                className="modal-button btn-modal-confirm"
                disabled={isDeleting || !cancellationRemark.trim()}
              >
                {isDeleting ? 'Removing...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Schedule;