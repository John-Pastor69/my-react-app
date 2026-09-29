import { useState, useEffect } from 'react'; 
import { Routes, Route, Navigate } from 'react-router-dom';
import { doc, updateDoc, getDoc } from 'firebase/firestore'; // Added getDoc
import { auth, db } from './Firebase';

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
import ReservationRouter from './pages/routers/ReservationRouter';
import ScheduleRouter from './pages/routers/ScheduleRouter';
import FacilityRouter from './pages/routers/FacilityRouter';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false); 
  const [userRole, setUserRole] = useState('requestor');
  
  // NEW: Loading state to pause the app while Firebase checks the session
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // --- GLOBAL PRESENCE & SESSION RESTORE ---
  useEffect(() => {
    // 1. Detect existing Firebase session on load/refresh
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          // Fetch the user's role from the database to restore the session properly
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            setUserRole(userData.role || 'requestor');
            setIsAuthenticated(true);

            // Update presence back to Active
            updateDoc(userRef, {
              status: 'Active',
              lastActive: new Date().toISOString()
            }).catch(err => console.error("Failed to set active status:", err));
          } else {
            setIsAuthenticated(false);
          }
        } catch (error) {
          console.error("Error fetching user session:", error);
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
      
      // Stop the loading screen once Firebase is done checking
      setIsAuthLoading(false);
    });

    // 2. Set to Inactive immediately before the user closes the tab, refreshes, or leaves the site
    const handleTabClose = () => {
      if (auth.currentUser) {
        updateDoc(doc(db, 'users', auth.currentUser.uid), {
          status: 'Inactive',
          lastActive: new Date().toISOString()
        }).catch(err => console.error("Failed to set inactive status:", err));
      }
    };

    window.addEventListener('beforeunload', handleTabClose);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', handleTabClose);
    };
  }, []);

  // --- LOADING SCREEN ---
  // Prevents the Login screen from flashing while checking the session
  if (isAuthLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F8FAFC', color: '#64748B', fontFamily: 'system-ui, sans-serif' }}>
         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
           <i className="ph ph-spinner-gap" style={{ fontSize: '32px', animation: 'spin 1s linear infinite' }}></i>
           <h2>Loading Session...</h2>
           <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
         </div>
      </div>
    );
  }

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
              path="/facility" 
              element={<FacilityRouter currentUserRole={userRole.toLowerCase()} />}
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