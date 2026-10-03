import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../Firebase';
import "../styles/Dashboard.scss";

const Dashboard = ({ currentUserRole }) => {
  const [reservationsData, setReservationsData] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);
  const [facilitiesData, setFacilitiesData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });

    const unsubscribeReservations = onSnapshot(
      collection(db, 'reservations'),
      (snapshot) => {
        setReservationsData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      },
      (error) => console.error('Failed to load reservations:', error)
    );

    const unsubscribeEquipment = onSnapshot(
      collection(db, 'equipments'),
      (snapshot) => {
        setEquipmentData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      },
      (error) => console.error('Failed to load equipment:', error)
    );

    const unsubscribeFacilities = onSnapshot(
      collection(db, 'facilities'),
      (snapshot) => {
        setFacilitiesData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      },
      (error) => console.error('Failed to load facilities:', error)
    );

    const unsubscribeUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        setUsersData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      },
      (error) => console.error('Failed to load users:', error)
    );

    return () => {
      unsubscribeAuth();
      unsubscribeReservations();
      unsubscribeEquipment();
      unsubscribeFacilities();
      unsubscribeUsers();
    };
  }, []);

  const currentUserRecord = usersData.find(
    (user) => user.uid === currentUser?.uid || user.id === currentUser?.uid
  );
  const approverRoleKey = currentUserRecord?.role?.toLowerCase().trim() || '';
  const dashboardRole = (currentUserRole || approverRoleKey).toLowerCase().trim().replace(/_/g, ' ');
  const roleHierarchy = ['requestor', 'endorser', 'building admin', 'osa', 'mis', 'academic head', 'school admin'];

  const scheduleCount = currentUser
    ? reservationsData.filter(
      (reservation) => reservation.userId === currentUser.uid || reservation.userEmail === currentUser.email
    ).length
    : 0;

  const pendingApprovals = reservationsData.filter((reservation) => {
    if (!approverRoleKey) return false;

    const myRecord = reservation.approvals?.[approverRoleKey];
    if (myRecord?.status === 'approved' || myRecord?.status === 'rejected') return false;
    if (reservation.status === 'Rejected' || reservation.status === 'Approved') return false;

    const myIndex = roleHierarchy.indexOf(approverRoleKey);
    if (myIndex <= 0) return false;

    const requestor = usersData.find(
      (user) => user.email === reservation.userEmail || user.uid === reservation.userId
    ) || {};
    const requestorRole = (requestor.role || 'requestor').toLowerCase().trim();
    const isStaffRequestor = requestorRole !== 'requestor' && requestorRole !== 'user';
    const hasEndorser = !!reservation.endorserName;

    if (approverRoleKey === 'endorser' && isStaffRequestor) return false;

    const previousRole = roleHierarchy[myIndex - 1];
    let previousStepApproved = false;

    if (previousRole === 'requestor') {
      previousStepApproved = true;
    } else if (previousRole === 'endorser') {
      previousStepApproved = isStaffRequestor || !hasEndorser
        ? true
        : reservation.approvals?.endorser?.status === 'approved';
    } else {
      previousStepApproved = reservation.approvals?.[previousRole]?.status === 'approved';
    }

    return previousStepApproved;
  }).length;

  const equipmentCounts = equipmentData.reduce((counts, equipment) => {
    let reservedCount = 0;

    reservationsData.forEach((reservation) => {
      if (reservation.status !== 'Rejected' && reservation.status !== 'Cancelled') {
        if (reservation.selectedEquip && reservation.selectedEquip[equipment.id]) {
          reservedCount += Number(reservation.selectedEquip[equipment.id]);
        }
      }
    });

    const total = Number(equipment.totalCount) || 0;
    counts.reserved += reservedCount;
    counts.available += Math.max(0, total - reservedCount);
    return counts;
  }, { available: 0, reserved: 0 });

  const facilitiesAvailable = facilitiesData.filter((facility) => facility.status === 'Available').length;
  const facilitiesUnderMaintenance = facilitiesData.filter((facility) => facility.status === 'Maintenance').length;
  const facilitiesUnavailable = facilitiesData.filter((facility) => facility.status === 'Unavailable').length;

  return (
    <div className="mis-dashboard-content">
      <div className="dashboard-title">
        <h1>Dashboard</h1>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="dashboard-info">

            <span className="label">
              Schedules
            </span>

            <span className="count">
              {scheduleCount}
            </span>

          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-info">
            <span className="label">
              Pending Approvals
            </span>
            <span className="count">
              {pendingApprovals}
            </span>
          </div>
        </div>

        {dashboardRole === 'mis' && (
          <>
            <div className="dashboard-card">
              <div className="dashboard-info">
                <span className="label">
                  Equipments Available
                </span>
                <span className="count">
                  {equipmentCounts.available}
                </span>
              </div>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-info">
                <span className="label">
                  Equipments Reserved
                </span>
                <span className="count">
                  {equipmentCounts.reserved}
                </span>
              </div>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-info">
                <span className="label">
                  Users
                </span>
                <span className="count">
                  {usersData.length}
                </span>
              </div>
            </div>
          </>
        )}

        {dashboardRole === 'building admin' && (
          <>
            <div className="dashboard-card">
              <div className="dashboard-info">
                <span className="label">
                  Facilities Available
                </span>
                <span className="count">
                  {facilitiesAvailable}
                </span>
              </div>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-info">
                <span className="label">
                  Facilities Under Maintenance
                </span>
                <span className="count">
                  {facilitiesUnderMaintenance}
                </span>
              </div>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-info">
                <span className="label">
                  Facilities Unavailable
                </span>
                <span className="count">
                  {facilitiesUnavailable}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;