import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import "../../styles/mis/MisApproval.scss";

const MisApproval = () => {
    const navigate = useNavigate();
    
    const [requests, setRequests] = useState([
        {
            id: 1,
            event: 'Annual Tech Symposium',
            submitted: 'Oct 20, 2023',
            equipment: 'Projector, Laptop, Mic',
            requestor: 'Alex Johnson',
            department: 'IT Department',
            date: 'Oct 24, 2023',
            time: '09:00 AM - 05:00 PM',
            type: 'laptop',
            status: 'pending'
        },
        {
            id: 2,
            event: 'Team Offsite Workshop',
            submitted: 'Oct 22, 2023',
            equipment: 'Monitor, Webcam',
            requestor: 'Sarah Lee',
            department: 'HR Department',
            date: 'Oct 28, 2023',
            time: '10:00 AM - 02:00 PM',
            type: 'monitor',
            status: 'pending'
        },
        {
            id: 3,
            event: 'Q3 Marketing Review',
            submitted: 'Oct 23, 2023',
            equipment: 'Video Conferencing Kit',
            requestor: 'James Cruz',
            department: 'Marketing',
            date: 'Nov 02, 2023',
            time: '01:00 PM - 03:30 PM',
            type: 'camera',
            status: 'pending'
        },
        {
            id: 4,
            event: 'Client Pitch Presentation',
            submitted: 'Oct 24, 2023',
            equipment: 'Projector, Clicker, HDMI',
            requestor: 'Nina Reyes',
            department: 'Sales',
            date: 'Nov 05, 2023',
            time: '11:00 AM - 12:30 PM',
            type: 'wifi',
            status: 'pending'
        },
        {
            id: 5,
            event: 'Department All-Hands',
            submitted: 'Oct 25, 2023',
            equipment: 'Wireless Mic, PA System',
            requestor: 'Marco Tan',
            department: 'Operations',
            date: 'Nov 10, 2023',
            time: '03:00 PM - 04:30 PM',
            type: 'mic',
            status: 'pending'
        },
        {
            id: 6,
            event: 'Leadership Summit 2023',
            submitted: 'Oct 26, 2023',
            equipment: 'LED Wall, Switcher, Cables',
            requestor: 'David Kim',
            department: 'Executive Office',
            date: 'Nov 15, 2023',
            time: '08:00 AM - 06:00 PM',
            type: 'cable',
            status: 'pending'
        }
    ]);

    const [search, setSearch] = useState('');

    const approveRequest = (id) => {
        setRequests(
            requests.map((request) =>
                request.id === id
                    ? { ...request, status: 'approved' }
                    : request
            )
        );
    };

    const rejectRequest = (id) => {
        setRequests(
            requests.map((request) =>
                request.id === id
                    ? { ...request, status: 'rejected' }
                    : request
            )
        );
    };

    const filteredRequests = requests.filter((request) =>
        request.event.toLowerCase().includes(search.toLowerCase()) ||
        request.requestor.toLowerCase().includes(search.toLowerCase()) ||
        request.department.toLowerCase().includes(search.toLowerCase())
    );

    const pendingCount = requests.filter(
        (request) => request.status === 'pending'
    ).length;

    const approvedCount = requests.filter(
        (request) => request.status === 'approved'
    ).length;

    const rejectedCount = requests.filter(
        (request) => request.status === 'rejected'
    ).length;


    return (
        <div className="mis-approval">

            {/* HEADER */}
            <div className="approval-header">

                <div className="header-title">
                    <h1>MIS Equipment Requests</h1>

                    <span className="pending-badge">
                        • {pendingCount} Pending
                    </span>
                </div>

                <span className="current-month">
                    October 2023
                </span>

            </div>


            {/* SUMMARY CARDS */}
            <div className="approval-summary">

                <div className="summary-card">

                    <div className="summary-icon pending">
                        ◷
                    </div>

                    <div className="summary-info">
                        <span>Pending</span>
                        <strong>{pendingCount}</strong>
                    </div>

                    <span className="summary-change orange">
                        ↑ 2 new
                    </span>

                </div>


                <div className="summary-card">

                    <div className="summary-icon approved">
                        ✓
                    </div>

                    <div className="summary-info">
                        <span>Approved</span>
                        <strong>{approvedCount}</strong>
                    </div>

                    <span className="summary-change green">
                        ↑ 8%
                    </span>

                </div>


                <div className="summary-card">

                    <div className="summary-icon rejected">
                        ×
                    </div>

                    <div className="summary-info">
                        <span>Rejected</span>
                        <strong>{rejectedCount}</strong>
                    </div>

                    <span className="summary-change red">
                        ↓ 1%
                    </span>

                </div>

            </div>


            {/* REQUEST TABLE */}
            <div className="requests-container">

                <div className="requests-header">

                    <div>
                        <h2>Pending MIS Equipment Requests</h2>

                        <p>
                            Approve or reject MIS equipment requests submitted for events
                        </p>
                    </div>


                    <div className="request-tools">

                        <input
                            type="text"
                            placeholder="⌕  Search requests..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <button>
                            ⚑ Filter
                        </button>

                        <button>
                            ↕ Sort
                        </button>

                    </div>

                </div>


                {/* TABLE HEADER */}
                <div className="request-table">

                    <div className="table-head">

                        <span>EVENT NAME</span>
                        <span>REQUESTOR</span>
                        <span>DATE</span>
                        <span>ACTION</span>

                    </div>


                    {/* REQUEST ROWS */}

                    {filteredRequests.map((request) => (

                        <div
                            className={`request-row ${request.status}`}
                            key={request.id}
                        >

                            {/* EVENT */}
                            <div className="event-info">

                                <div className={`event-icon ${request.type}`}>
                                    {request.type === 'laptop' && '▱'}
                                    {request.type === 'monitor' && '▣'}
                                    {request.type === 'camera' && '▰'}
                                    {request.type === 'wifi' && '⌁'}
                                    {request.type === 'mic' && '♟'}
                                    {request.type === 'cable' && '♜'}
                                </div>

                                <div>
                                    <strong>{request.event}</strong>

                                    <p>
                                        Submitted {request.submitted} · {request.equipment}
                                    </p>
                                </div>

                            </div>


                            {/* REQUESTOR */}
                            <div className="requestor-info">

                                <div className="avatar">
                                    {request.requestor.charAt(0)}
                                </div>

                                <div>
                                    <strong>{request.requestor}</strong>

                                    <p>
                                        {request.department}
                                    </p>
                                </div>

                            </div>


                            {/* DATE */}
                            <div className="date-info">

                                <strong>
                                    {request.date}
                                </strong>

                                <p>
                                    {request.time}
                                </p>

                            </div>


                            {/* ACTION */}
                            <div className="request-actions">

                                {request.status === 'pending' ? (
                                    <>
                                        <button
                                            className="approve-btn"
                                            onClick={() => approveRequest(request.id)}
                                        >
                                            ✓ Approve
                                        </button>

                                        <button
                                            className="reject-btn"
                                            onClick={() => rejectRequest(request.id)}
                                        >
                                            × Reject
                                        </button>
                                    </>
                                ) : (
                                    <span className={`status-label ${request.status}`}>
                                        {request.status}
                                    </span>
                                )}

                                <button className="details-btn">
                                    ◉ View
                                    <br />
                                    Details
                                </button>

                            </div>

                        </div>

                    ))}

                </div>


                {/* FOOTER */}
                <div className="table-footer">

                    <span>
                        Showing 1 to {filteredRequests.length} of {requests.length} pending requests
                    </span>

                    <div className="pagination">

                        <button disabled>
                            Prev
                        </button>

                        <button className="active">
                            1
                        </button>

                        <button>
                            2
                        </button>

                        <button>
                            Next
                        </button>

                    </div>

                </div>

            </div>

        </div>
    );
};

export default MisApproval;