import React, { useState } from 'react';
import "../styles/Approval.scss";
import PendingRequest from './PendingRequest';

const MisApproval = () => {
    const [requests, setRequests] = useState([
        { id: 1, event: 'Annual Tech Symposium', submitted: 'Oct 20, 2023', equipment: 'Projector, Laptop, Mic', requestor: 'Alex Johnson', department: 'IT Department', date: 'Oct 24, 2023', time: '09:00 AM - 05:00 PM', type: 'laptop', status: 'pending' },
        { id: 2, event: 'Team Offsite Workshop', submitted: 'Oct 22, 2023', equipment: 'Monitor, Webcam', requestor: 'Sarah Lee', department: 'HR Department', date: 'Oct 28, 2023', time: '10:00 AM - 02:00 PM', type: 'monitor', status: 'pending' },
        { id: 3, event: 'Q3 Marketing Review', submitted: 'Oct 23, 2023', equipment: 'Video Conferencing Kit', requestor: 'James Cruz', department: 'Marketing', date: 'Nov 02, 2023', time: '01:00 PM - 03:30 PM', type: 'camera', status: 'pending' },
        { id: 4, event: 'Client Pitch Presentation', submitted: 'Oct 24, 2023', equipment: 'Projector, Clicker, HDMI', requestor: 'Nina Reyes', department: 'Sales', date: 'Nov 05, 2023', time: '11:00 AM - 12:30 PM', type: 'wifi', status: 'pending' },
        { id: 5, event: 'Department All-Hands', submitted: 'Oct 25, 2023', equipment: 'Wireless Mic, PA System', requestor: 'Marco Tan', department: 'Operations', date: 'Nov 10, 2023', time: '03:00 PM - 04:30 PM', type: 'mic', status: 'pending' },
        { id: 6, event: 'Leadership Summit 2023', submitted: 'Oct 26, 2023', equipment: 'LED Wall, Switcher, Cables', requestor: 'David Kim', department: 'Executive Office', date: 'Nov 15, 2023', time: '08:00 AM - 06:00 PM', type: 'cable', status: 'pending' },
        { id: 7, event: 'Q1 Budget Planning', submitted: 'Oct 27, 2023', equipment: 'Projector, Whiteboard', requestor: 'Diana Prince', department: 'Finance', date: 'Nov 18, 2023', time: '10:00 AM - 12:00 PM', type: 'laptop', status: 'pending' },
        { id: 8, event: 'New Hire Orientation', submitted: 'Oct 28, 2023', equipment: 'Laptops, Welcome Kits', requestor: 'Clark Kent', department: 'HR Department', date: 'Nov 20, 2023', time: '09:00 AM - 04:00 PM', type: 'laptop', status: 'pending' },
        { id: 9, event: 'Product Launch Webinar', submitted: 'Oct 29, 2023', equipment: 'HD Camera, Ring Light, Mic', requestor: 'Bruce Wayne', department: 'Marketing', date: 'Nov 22, 2023', time: '02:00 PM - 04:00 PM', type: 'camera', status: 'pending' },
        { id: 10, event: 'Board of Directors Meeting', submitted: 'Oct 30, 2023', equipment: 'Executive Conference Setup', requestor: 'Lex Luthor', department: 'Executive Office', date: 'Nov 25, 2023', time: '10:00 AM - 01:00 PM', type: 'monitor', status: 'pending' },
        { id: 11, event: 'IT Security Training', submitted: 'Oct 31, 2023', equipment: 'Projector, Network Cables', requestor: 'Barry Allen', department: 'IT Department', date: 'Nov 28, 2023', time: '01:00 PM - 05:00 PM', type: 'cable', status: 'pending' },
        { id: 12, event: 'Annual Holiday Party', submitted: 'Nov 01, 2023', equipment: 'PA System, Wireless Mics, Speakers', requestor: 'Arthur Curry', department: 'Operations', date: 'Dec 15, 2023', time: '06:00 PM - 11:00 PM', type: 'mic', status: 'pending' }
    ]);

    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRequest, setSelectedRequest] = useState(null);

    const itemsPerPage = 5;

    const handleSearch = (e) => {
        setSearch(e.target.value);
        setCurrentPage(1);
    };

    const approveRequest = (id) => {
        setRequests(requests.map((request) =>
            request.id === id ? { ...request, status: 'approved' } : request
        ));
    };

    const rejectRequest = (id) => {
        setRequests(requests.map((request) =>
            request.id === id ? { ...request, status: 'rejected' } : request
        ));
    };

    const undoRequest = (id) => {
        setRequests(requests.map((request) =>
            request.id === id ? { ...request, status: 'pending' } : request
        ));
    };

    const filteredRequests = requests.filter((request) =>
        request.event.toLowerCase().includes(search.toLowerCase()) ||
        request.requestor.toLowerCase().includes(search.toLowerCase()) ||
        request.department.toLowerCase().includes(search.toLowerCase())
    );

    const totalPages = Math.max(1, Math.ceil(filteredRequests.length / itemsPerPage));
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredRequests.slice(indexOfFirstItem, indexOfLastItem);

    const pendingCount = requests.filter((req) => req.status === 'pending').length;
    const approvedCount = requests.filter((req) => req.status === 'approved').length;
    const rejectedCount = requests.filter((req) => req.status === 'rejected').length;

    return (
        <div className="mis-approval">
            <div className="approval-header">
                <div className="header-title">
                    <h1>Approval Overview</h1>
                </div>
            </div>

            <div className="approval-summary">
                <div className="summary-card">
                    <div className="summary-icon pending">◷</div>
                    <div className="summary-info">
                        <span>Pending</span>
                        <strong>{pendingCount}</strong>
                    </div>
                </div>

                <div className="summary-card">
                    <div className="summary-icon approved">✓</div>
                    <div className="summary-info">
                        <span>Approved</span>
                        <strong>{approvedCount}</strong>
                    </div>
                </div>

                <div className="summary-card">
                    <div className="summary-icon rejected">×</div>
                    <div className="summary-info">
                        <span>Rejected</span>
                        <strong>{rejectedCount}</strong>
                    </div>
                </div>
            </div>

            <div className="requests-container">
                <div className="requests-header">
                    <div className="requests-title">
                        <h2>Pending Request</h2>
                        <p>Review and manage facility reservation requests.</p>
                    </div>

                    <div className="request-tools">
                        <div className="search-field">
                            <span className="search-icon" aria-hidden="true">⌕</span>
                            <input
                                type="text"
                                placeholder="Search requests..."
                                value={search}
                                onChange={handleSearch}
                            />
                        </div>
                        <button type="button" className="tool-btn">⚑ <span>Filter</span></button>
                        <button type="button" className="tool-btn">↕ <span>Sort</span></button>
                    </div>
                </div>

                <div className="request-table">
                    <div className="table-scroll-content">
                        <div className="table-head">
                            <span>EVENT NAME</span>
                            <span>REQUESTOR</span>
                            <span>DATE</span>
                            <span>ACTION</span>
                        </div>

                        {currentItems.length > 0 ? (
                            currentItems.map((request) => (
                                <div className={`request-row ${request.status}`} key={request.id}>
                                    <div className="event-info">
                                        <div className={`event-icon ${request.type}`} aria-hidden="true">
                                            <span className="icon-glyph">{request.type}</span>
                                        </div>
                                        <div className="event-text">
                                            <strong>{request.event}</strong>
                                            <p>Submitted {request.submitted} · {request.equipment}</p>
                                        </div>
                                    </div>

                                    <div className="requestor-info">
                                        <div className="avatar">{request.requestor.charAt(0)}</div>
                                        <div className="requestor-text">
                                            <strong>{request.requestor}</strong>
                                            <p>{request.department}</p>
                                        </div>
                                    </div>

                                    <div className="date-info">
                                        <strong>{request.date}</strong>
                                        <p>{request.time}</p>
                                    </div>

                                    <div className="request-actions">
                                        {request.status === 'pending' ? (
                                            <>
                                                <button
                                                    type="button"
                                                    className="approve-btn"
                                                    onClick={() => approveRequest(request.id)}
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    type="button"
                                                    className="reject-btn"
                                                    onClick={() => rejectRequest(request.id)}
                                                >
                                                    × Reject
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <span className={`status-label ${request.status}`}>
                                                    {request.status}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="undo-btn"
                                                    onClick={() => undoRequest(request.id)}
                                                >
                                                    ⟲ Undo
                                                </button>
                                            </>
                                        )}

                                        <button
                                            type="button"
                                            className="details-btn"
                                            onClick={() => setSelectedRequest(request)}
                                        >
                                            ◉ View Details
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state">
                                No matching requests found.
                            </div>
                        )}
                    </div>
                </div>

                <div className="table-footer">
                    <span>
                        Showing {filteredRequests.length === 0 ? 0 : indexOfFirstItem + 1} to{' '}
                        {Math.min(indexOfLastItem, filteredRequests.length)} of {filteredRequests.length} requests
                    </span>

                    <div className="pagination">
                        <button
                            type="button"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage((prev) => prev - 1)}
                        >
                            Prev
                        </button>

                        {Array.from({ length: totalPages }, (_, index) => (
                            <button
                                type="button"
                                key={index + 1}
                                className={currentPage === index + 1 ? 'active' : ''}
                                onClick={() => setCurrentPage(index + 1)}
                            >
                                {index + 1}
                            </button>
                        ))}

                        <button
                            type="button"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage((prev) => prev + 1)}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {selectedRequest && (
                <div className="modal-overlay" onClick={() => setSelectedRequest(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            className="close-modal-btn"
                            onClick={() => setSelectedRequest(null)}
                            aria-label="Close"
                        >
                            ✕
                        </button>

                        <PendingRequest data={selectedRequest} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default MisApproval;
