import { useState, useEffect, Suspense, useRef } from 'react'; 
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { signOut, getRedirectResult, onAuthStateChanged } from 'firebase/auth';
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
  const initialRedirectDone = useRef(false);

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

    // Catch any errors from the Microsoft SSO redirect before auth state changes
    getRedirectResult(auth).then((result) => {
      if (result) {
        console.log("Successfully logged in via redirect!", result.user);
      }
    }).catch(err => {
      console.error("Redirect Error:", err);
      setLoginError("Login failed during redirect: " + err.message);
    });

    // 1. Let Firebase automatically detect the returned session
    // 1. Let Firebase automatically detect the returned session
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        
        // --- NEW: Check if user logged in via Email/Password (Super Admin) ---
        const isSuperAdminProvider = user.providerData.some(p => p.providerId === 'password');

        const isStiEmail = user.email && (
          user.email.endsWith('@globalcity.sti.edu.ph') || 
          user.email.endsWith('@sti.edu.ph') ||
          user.email.endsWith('@globalcity.sti.edu')
        );

        // Bypass the STI email block if they are using the Super Admin login method
        if (!isStiEmail && !isSuperAdminProvider) {
          await signOut(auth);
          setLoginError("Access denied. Only STI institutional accounts are allowed.");
          setIsAuthenticated(false);
          setIsAuthLoading(false);
          return;
        }

        try {
          const userRef = doc(db, 'users', user.uid);
          
          // 1. OPTIMIZATION: Check for cached role to instantly unblock the UI
          const cachedRole = localStorage.getItem(`userRole_${user.uid}`);
          if (cachedRole) {
            setUserRole(cachedRole);
            setIsAuthenticated(true);
            setIsAuthLoading(false); 
          }

          // 2. Fetch fresh data from Firestore
          const userSnap = await getDoc(userRef);
          const nowIso = new Date().toISOString();

          let resolvedRole = 'requestor';

          if (userSnap.exists()) {
            resolvedRole = userSnap.data().role || 'requestor';
            
            // OPTIMIZATION: Non-blocking write
            updateDoc(userRef, {
              status: 'Active',
              lastActive: nowIso
            }).catch(err => console.error("Heartbeat update failed:", err));
            
          } else {
            const d = new Date();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const liveDate = `${month}/${day}/${d.getFullYear()}`;
            
            const rawName = user.displayName || "Super Admin";
            
            // --- NEW: Force Super Admin role for Email/Password logins ---
            if (isSuperAdminProvider) {
              resolvedRole = 'super admin';
            }
            // 2. Force Endorser role for specific email domain
            else if (user.email && user.email.endsWith('@globalcity.sti.edu')) {
              resolvedRole = 'endorser';
            } 
            // 3. Fallback to name-based logic for other domains (e.g. .edu.ph)
            else if (/faculty/i.test(rawName)) {
              resolvedRole = 'endorser';
            } else if (/student/i.test(rawName)) {
              resolvedRole = 'requestor';
            } else {
              resolvedRole = 'requestor'; // Fallback for unknown formats
            }

            // OPTIMIZATION: Non-blocking write
            setDoc(userRef, {
              email: user.email,
              name: rawName,
              role: resolvedRole,
              uid: user.uid,
              dateJoined: liveDate,
              officeLocation: '',
              phone: '',
              status: 'Active',
              lastActive: nowIso
            }).catch(err => console.error("User creation failed:", err));
          }

          // 3. Update the state and the cache with the verified database role
          localStorage.setItem(`userRole_${user.uid}`, resolvedRole);
          setUserRole(resolvedRole);
          setIsAuthenticated(true);
          
          // Only redirect if they are sitting on the login page ("/")
          if (!initialRedirectDone.current && location.pathname === '/') {
             if (resolvedRole.toLowerCase() === 'requestor') {
                navigate('/reserve', { replace: true });
             } else {
                navigate('/dashboard', { replace: true });
             }
             initialRedirectDone.current = true;
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
        onLogout={async () => {
          // 1. Clear local storage cache
          if (auth.currentUser) {
            localStorage.removeItem(`userRole_${auth.currentUser.uid}`);
          }
          
          // 2. Clear URL FIRST so child components unmount immediately
          navigate('/', { replace: true });

          // 3. Destroy authenticated state to kill child component listeners
          setIsAuthenticated(false); 
          setUserRole('requestor'); 
          
          // 4. Delay the Firebase logout slightly so React finishes unmounting 
          setTimeout(async () => {
            await signOut(auth);
          }, 150); // Increased timeout to ensure full unmount
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