import { useState, useEffect } from 'react'; 
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
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
  const navigate = useNavigate(); // <-- Added for programmatic navigation
  const location = useLocation(); // <-- Added to track route changes

  // --- AUTO-CLOSE SIDEBAR ON NAVIGATION ---
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false); 
  const [userRole, setUserRole] = useState('requestor');
  
  // Loading state to pause the app while Firebase checks the session
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // --- GLOBAL PRESENCE, HEARTBEAT & DB STATUS WRITER ---
  useEffect(() => {
    let heartbeatInterval = null;

    // 1. Detect existing Firebase session on load/refresh
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            setUserRole(userData.role || 'requestor');
            setIsAuthenticated(true);

            // Set status to Active in Firestore on session load
            await updateDoc(userRef, {
              status: 'Active',
              lastActive: new Date().toISOString()
            });

            // Heartbeat: Ping Firestore every 30 seconds to keep Active fresh
            heartbeatInterval = setInterval(async () => {
              if (auth.currentUser) {
                await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                  status: 'Active',
                  lastActive: new Date().toISOString()
                }).catch(err => console.error("Heartbeat failed:", err));
              }
            }, 30000);

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
      
      setIsAuthLoading(false);
    });

    // 2. Write "Inactive" directly to Firestore when closing tab, refreshing, or leaving
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
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleTabClose);
    };
  }, []);

  // --- LOADING SCREEN ---
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

  // --- LOGIN ROUTING ---
  // If not logged in, only show the Login page and force redirect upon manual login
  if (!isAuthenticated) {
    return <Login onLogin={(role) => {
      setIsAuthenticated(true);
      setUserRole(role);
      
      // Force navigation to the correct page exactly when they log in
      if (role.toLowerCase() === 'requestor') {
        navigate('/reserve', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
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
         navigate('/', { replace: true }); // Clear the URL on logout
        }} 
        userRole={userRole} 
      />
      <div className="main-content">
        <TopBar toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        <div className="page-content">
          <Routes> 
            
            {/* 1. Dynamic Login & Catch-All Redirect (Added wildcard *) */}
            <Route 
              path="*" 
              element={
                userRole.toLowerCase() === 'requestor' 
                  ? <Navigate to="/reserve" replace /> 
                  : <Navigate to="/dashboard" replace />
              } 
            />

            {/* 2. Protected Dashboard Routes (Added /* to all nested routers) */}
            <Route 
              path="/dashboard/*" 
              element={
                userRole.toLowerCase() === 'requestor'
                  ? <Navigate to="/reserve" replace />
                  : <DashboardRouter currentUserRole={userRole.toLowerCase()} />
              }
            />

            <Route 
              path="/reserve/*" 
              element={<ReservationRouter currentUserRole={userRole.toLowerCase()} />}
            />

            <Route 
              path="/schedule/*" 
              element={<ScheduleRouter currentUserRole={userRole.toLowerCase()} />}
            />

            <Route 
              path="/approval/*" 
              element={<ApprovalRouter currentUserRole={userRole.toLowerCase()} />}
            />
            <Route 
              path="/equipment/*" 
              element={<EquipmentManagementRouter currentUserRole={userRole.toLowerCase()} />}
            />
            <Route 
              path="/user/*" 
              element={<UserManagementRouter currentUserRole={userRole.toLowerCase()} />}
            />
            <Route 
              path="/facility/*" 
              element={<FacilityRouter currentUserRole={userRole.toLowerCase()} />}
            />
            <Route 
              path="/calendar/*" 
              element={<CalendarRouter currentUserRole={userRole.toLowerCase()} />}
            />
            <Route 
              path="/account/*" 
              element={<ProfileRouter currentUserRole={userRole.toLowerCase()} />}
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}