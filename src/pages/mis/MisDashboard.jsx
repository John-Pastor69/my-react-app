import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import "../../styles/mis/MisDashboard.scss";

const MisDashboard = () => {
    const navigate = useNavigate();

    const [dashboardData] = useState({
        pendingApprovals: 18,
        equipmentRequests: 11,
        facilityRequests: 7,

        equipmentUsage: 84,
        availableEquipment: 24,
        inUseEquipment: 126,
        maintenanceEquipment: 10,

        totalRequests: 247,
        approved: 198,
        rejected: 31,
        activeUsers: 64
    });

    const [selectedMonth, setSelectedMonth] = useState("November 2023");

    return (
        <div className="mis-dashboard">

            <div className="dashboard-header">
                <h1>Overview</h1>

                <div className="date-select">

                    <span className="calendar-icon">▣</span>

                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                    >
                        <option>November 2023</option>
                        <option>December 2023</option>
                        <option>January 2024</option>
                    </select>

                </div>
            </div>


            <div className="main-stat-grid">

                {/* Pending Approvals */}
                <div className="main-card pending-card">

                    <div className="card-icon yellow">
                        🕐
                    </div>

                    <div className="card-content">

                        <p className="card-label">
                            Pending Approvals
                        </p>

                        <div className="card-number">
                            {dashboardData.pendingApprovals}
                        </div>

                        <div className="request-details">

                            <span>
                                <b className="orange-dot"></b>
                                Equipment Requests: {dashboardData.equipmentRequests}
                            </span>

                            <span>
                                <b className="gray-dot"></b>
                                Facility Requests: {dashboardData.facilityRequests}
                            </span>

                        </div>

                        <div className="progress-area">

                            <div className="progress-bar">
                                <div
                                    className="progress orange-progress"
                                    style={{ width: "61%" }}
                                />
                            </div>

                            <span className="percentage orange-text">
                                61% Equipment
                            </span>

                        </div>

                    </div>

                    <span className="today-badge">
                        ↑ +5 today
                    </span>

                </div>


                {/* Equipment Usage */}
                <div className="main-card equipment-card">

                    <div className="card-icon blue">
                        📦
                    </div>

                    <div className="card-content">

                        <p className="card-label">
                            Equipment Usage Stats
                        </p>

                        <div className="card-number">
                            {dashboardData.equipmentUsage}
                            <span className="percent-symbol">%</span>
                        </div>

                        <div className="request-details">

                            <span>
                                <b className="green-dot"></b>
                                Available: {dashboardData.availableEquipment}
                            </span>

                            <span>
                                <b className="blue-dot"></b>
                                In Use: {dashboardData.inUseEquipment}
                            </span>

                            <span>
                                <b className="red-dot"></b>
                                Maintenance: {dashboardData.maintenanceEquipment}
                            </span>

                        </div>

                        <div className="progress-area">

                            <div className="progress-bar usage-bar">

                                <div
                                    className="progress green-progress"
                                    style={{ width: "84%" }}
                                />

                                <div
                                    className="progress red-progress"
                                    style={{ width: "4%" }}
                                />

                            </div>

                            <span className="percentage blue-text">
                                84% Utilized
                            </span>

                        </div>

                    </div>

                    <span className="week-badge">
                        ↑ +3% this week
                    </span>

                </div>

            </div>


            {/* Small Cards */}

            <div className="small-stat-grid">

                <div className="small-card">

                    <div className="small-icon blue-light">
                        ▤
                    </div>

                    <div>
                        <p>Total Requests</p>
                        <h2>{dashboardData.totalRequests}</h2>
                    </div>

                </div>


                <div className="small-card">

                    <div className="small-icon green-light">
                        ✓
                    </div>

                    <div>
                        <p>Approved</p>
                        <h2>{dashboardData.approved}</h2>
                    </div>

                </div>


                <div className="small-card">

                    <div className="small-icon red-light">
                        ×
                    </div>

                    <div>
                        <p>Rejected</p>
                        <h2>{dashboardData.rejected}</h2>
                    </div>

                </div>


                <div className="small-card">

                    <div className="small-icon purple-light">
                        👥
                    </div>

                    <div>
                        <p>Active Users</p>
                        <h2>{dashboardData.activeUsers}</h2>
                    </div>

                </div>

            </div>

        </div>
    );
};

export default MisDashboard;