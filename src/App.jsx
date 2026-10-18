import { useState, useEffect, lazy, Suspense } from 'react'; 
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './Firebase';

import SideBar from './pages/SideBar';
import TopBar from './pages/TopBar'; 
import './App.css'; 

import Login from './pages/Login';

const DashboardRouter = lazy(() => import('./pages/routers/DashboardRouter'));
const CalendarRouter = lazy(() => import('./pages/routers/CalendarRouter'));
const ApprovalRouter = lazy(() => import('./pages/routers/ApprovalRouter'));
const UserManagementRouter = lazy(() => import('./pages/routers/UserManagementRouter'));
const EquipmentManagementRouter = lazy(() => import('./pages/routers/EquipmentRouter'));
const ProfileRouter = lazy(() => import('./pages/routers/ProfileRouter'));
const ReservationRouter = lazy(() => import('./pages/routers/ReservationRouter'));
const ScheduleRouter = lazy(() => import('./pages/routers/ScheduleRouter'));
const FacilityRouter = lazy(() => import('./pages/routers/FacilityRouter'));

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate(); 
  const location = useLocation(); 

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
        setIsAuthenticated(true);
        setIsAuthLoading(false); // Dismiss loading screen immediately

        // Run Firestore read and status update in the background without blocking the UI
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            setUserRole(userSnap.data().role || 'requestor');
          }

          await updateDoc(userRef, {
            status: 'Active',
            lastActive: new Date().toISOString()
          });
        } catch (error) {
          console.error("Error updating background session:", error);
        }
      } else {
        setIsAuthenticated(false);
        setIsAuthLoading(false);
      }
    });

    // 2. Handle standard tab closures and iOS Safari tab closures
    const handleTabClose = () => {
      if (auth.currentUser) {
        updateDoc(doc(db, 'users', auth.currentUser.uid), {
          status: 'Inactive',
          lastActive: new Date().toISOString()
        }).catch(err => console.error("Failed to set inactive status:", err));
      }
    };

    // 3. Handle mobile backgrounding (minimizing app, switching tabs, locking phone)
    const handleVisibilityChange = () => {
      if (auth.currentUser) {
        if (document.visibilityState === 'hidden') {
          updateDoc(doc(db, 'users', auth.currentUser.uid), {
            status: 'Inactive',
            lastActive: new Date().toISOString()
          }).catch(err => console.error("Failed to set inactive status:", err));
        } else if (document.visibilityState === 'visible') {
          updateDoc(doc(db, 'users', auth.currentUser.uid), {
            status: 'Active',
            lastActive: new Date().toISOString()
          }).catch(err => console.error("Failed to set active status:", err));
        }
      }
    };

    window.addEventListener('beforeunload', handleTabClose);
    window.addEventListener('pagehide', handleTabClose); // Critical for iOS Safari
    document.addEventListener('visibilitychange', handleVisibilityChange); // Critical for mobile phones

    return () => {
      unsubscribe();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleTabClose);
      window.removeEventListener('pagehide', handleTabClose);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
          <Suspense fallback={<div className="loading-text">Loading page...</div>}>

            <Routes> 
            
              {/* 1. Dynamic Login & Catch-All Redirect */}
              <Route 
                path="*" 
                element={
                  userRole.toLowerCase() === 'requestor' 
                    ? <Navigate to="/reserve" replace /> 
                    : <Navigate to="/dashboard" replace />
                } 
              />

              {/* 2. Protected Dashboard Routes */}
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
          </Suspense>
        </div>
      </div>
    </div>
  );
}