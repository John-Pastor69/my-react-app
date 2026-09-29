import { useState } from 'react'; 
import { Routes, Route, Navigate } from 'react-router-dom';
import SideBar from './pages/SideBar';
import TopBar from './pages/TopBar'; 
import './App.css'; 

import Login from './pages/Login';

import DashboardRouter from './pages/routers/DashboardRouter';
import CalendarRouter from './pages/routers/CalendarRouter';
import ApprovalRouter from './pages/routers/ApprovalRouter';
import UserManagementRouter from './pages/routers/UserManagementRouter';
import EquipmentManagementRouter from './pages/routers/EquipmentRouter';
import ProfileRouter from './pages/routers/ProfileRouter';
import ReservationRouter from './pages/routers/ReservationRouter'
import ScheduleRouter from './pages/routers/ScheduleRouter';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false); 
  const [userRole, setUserRole] = useState('requestor');

  // If not logged in, only show the Login page
  if (!isAuthenticated) {
    return <Login onLogin={(role) => {
      setIsAuthenticated(true);
      setUserRole(role);
    }} />;
  }

  return (
    <div className="app-container">
      <SideBar 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        onLogout={() => {
         setIsAuthenticated(false); 
         setUserRole('requestor'); 
        }} 
        userRole={userRole} 
      />
      <div className="main-content">
        <TopBar toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        <div className="page-content">
          <Routes> 
            
            {/* 1. Dynamic Login Redirect */}
            <Route 
              path="/" 
              element={
                userRole.toLowerCase() === 'requestor' 
                  ? <Navigate to="/reserve" replace /> 
                  : <Navigate to="/dashboard" replace />
              } 
            />

            {/* 2. Protected Dashboard Route */}
            <Route 
              path="/dashboard" 
              element={
                userRole.toLowerCase() === 'requestor'
                  ? <Navigate to="/reserve" replace />
                  : <DashboardRouter currentUserRole={userRole.toLowerCase()} />
              }
            />

            <Route 
              path="/reserve" 
              element={<ReservationRouter currentUserRole={userRole.toLowerCase()} />}
            />

            <Route 
              path="/schedule" 
              element={<ScheduleRouter currentUserRole={userRole.toLowerCase()} />}
            />

            <Route 
              path="/approval" 
              element={<ApprovalRouter currentUserRole={userRole.toLowerCase()} />}
            />
            <Route 
              path="/equipment" 
              element={<EquipmentManagementRouter currentUserRole={userRole.toLowerCase()} />}
            />
            <Route 
              path="/user" 
              element={<UserManagementRouter currentUserRole={userRole.toLowerCase()} />}
            />
            <Route 
              path="/calendar" 
              element={<CalendarRouter currentUserRole={userRole.toLowerCase()} />}
            />
            <Route 
              path="/account" 
              element={<ProfileRouter currentUserRole={userRole.toLowerCase()} />}
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}