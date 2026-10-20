import { useState, useEffect, Suspense } from 'react'; 
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
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
  const navigate = useNavigate(); 
  const location = useLocation(); 

  // --- AUTO-CLOSE SIDEBAR ON NAVIGATION ---
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false); 
  const [userRole, setUserRole] = useState('requestor');
  
  // Loading state to pause the app until Firebase auth AND user role/layout data are fully ready
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // State to hold login errors passed back to the Login component
  const [loginError, setLoginError] = useState('');

  // --- GLOBAL PRESENCE, HEARTBEAT & DB STATUS WRITER ---
  useEffect(() => {
    let heartbeatInterval = null;
    let initialRedirectDone = false; // Prevent multiple redirects on mount

    // 1. Let Firebase automatically detect the returned session
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const isStiEmail = user.email && (
          user.email.endsWith('@globalcity.sti.edu.ph') || 
          user.email.endsWith('@sti.edu.ph')
        );

        if (!isStiEmail) {
          await signOut(auth);
          setLoginError("Access denied. Only STI institutional accounts are allowed.");
          setIsAuthenticated(false);
          setIsAuthLoading(false);
          return;
        }

        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          const nowIso = new Date().toISOString();

          let resolvedRole = 'requestor';

          if (userSnap.exists()) {
            resolvedRole = userSnap.data().role || 'requestor';
            await updateDoc(userRef, {
              status: 'Active',
              lastActive: nowIso
            });
          } else {
            const d = new Date();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const liveDate = `${month}/${day}/${d.getFullYear()}`;

            await setDoc(userRef, {
              email: user.email,
              name: user.displayName || "Unknown User",
              role: 'requestor',
              uid: user.uid,
              dateJoined: liveDate,
              officeLocation: '',
              phone: '',
              status: 'Active',
              lastActive: nowIso
            });
          }

          setUserRole(resolvedRole);
          setIsAuthenticated(true);
          
          // Only redirect if they are sitting on the login page ("/")
          if (!initialRedirectDone && location.pathname === '/') {
             if (resolvedRole.toLowerCase() === 'requestor') {
                navigate('/reserve', { replace: true });
             } else {
                navigate('/dashboard', { replace: true });
             }
             initialRedirectDone = true;
          }

        } catch (error) {
          console.error("Error loading user session:", error);
          setLoginError("Failed to initialize user session.");
          setIsAuthenticated(false); // Force re-login if DB fails
        } finally {
          setIsAuthLoading(false);
        }
      } else {
        // No user is logged in
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
  }, [navigate, location.pathname]);

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
  // If not logged in, only show the Login page
  if (!isAuthenticated) {
    return <Login error={loginError} setError={setLoginError} />;
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