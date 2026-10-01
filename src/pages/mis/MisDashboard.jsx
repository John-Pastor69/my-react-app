import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import "../../styles/mis/MisDashboard.scss";

const MisDashboard = () => {

  const [dashboardData] = useState({
    pendingApprovals: 18,
    approved: 198,
    rejected: 31,
    equipmentRequests: 11,
    facilityRequests: 7,
    users: 64
  });

  return (
    <div className="mis-dashboard-content">

      {/* ==========================================
          DASHBOARD TITLE
          ========================================== */}
      <div className="dashboard-title">
        <h1>Dashboard</h1>
      </div>


      {/* ==========================================
          DASHBOARD CARDS
          3 CARDS PER ROW ON DESKTOP
          1 CARD PER ROW ON MOBILE
          ========================================== */}
      <div className="dashboard-grid">


        {/* ==========================================
            PENDING APPROVALS
            ========================================== */}
        <div className="dashboard-card">
          <div className="dashboard-info">

            <span className="label">
              Pending Approvals
            </span>

            <span className="count">
              {dashboardData.pendingApprovals}
            </span>

          </div>
        </div>


        {/* ==========================================
            APPROVED
            ========================================== */}
        <div className="dashboard-card">
          <div className="dashboard-info">

            <span className="label">
              Approved
            </span>

            <span className="count">
              {dashboardData.approved}
            </span>

          </div>
        </div>


        {/* ==========================================
            REJECTED
            ========================================== */}
        <div className="dashboard-card">
          <div className="dashboard-info">

            <span className="label">
              Rejected
            </span>

            <span className="count">
              {dashboardData.rejected}
            </span>

          </div>
        </div>


        {/* ==========================================
            EQUIPMENT REQUESTS
            ========================================== */}
        <div className="dashboard-card">
          <div className="dashboard-info">

            <span className="label">
              Equipment Requests
            </span>

            <span className="count">
              {dashboardData.equipmentRequests}
            </span>

          </div>
        </div>


        {/* ==========================================
            FACILITY REQUESTS
            ========================================== */}
        <div className="dashboard-card">
          <div className="dashboard-info">

            <span className="label">
              Facility Requests
            </span>

            <span className="count">
              {dashboardData.facilityRequests}
            </span>

          </div>
        </div>


        {/* ==========================================
            USERS
            ========================================== */}
        <div className="dashboard-card">
          <div className="dashboard-info">

            <span className="label">
              Users
            </span>

            <span className="count">
              {dashboardData.users}
            </span>

          </div>
        </div>


      </div>
    </div>
  );
};

export default MisDashboard;