import { useState, useEffect, Suspense, useRef } from 'react'; 
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { signOut, getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'; 
import { auth, db } from './Firebase';

import SideBar from './pages/SideBar';
import TopBar from './pages/TopBar'; 
import './App.css'; 

import Login from './pages/Login';
import TwoFactorGate from './pages/TwoFactorGate'; 

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
  const isLoggingOut = useRef(false);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const [isAuthenticated, setIsAuthenticated] = useState(false); 
  const [userRole, setUserRole] = useState('requestor');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');

  // --- 2FA ENFORCEMENT STATES ---
  const [twoFactorMode, setTwoFactorMode] = useState(null); // 'setup' | 'verify' | null
  const [twoFactorSecret, setTwoFactorSecret] = useState(null);

  const handleLogout = async () => {
    isLoggingOut.current = true;

    if (auth.currentUser) {
      localStorage.removeItem(`userRole_${auth.currentUser.uid}`);
      localStorage.removeItem(`req2FA_${auth.currentUser.uid}`);
      sessionStorage.removeItem(`2fa_verified_${auth.currentUser.uid}`);
      sessionStorage.removeItem(`active_session_${auth.currentUser.uid}`); 
    }
    
    navigate('/', { replace: true });

    setIsAuthenticated(false); 
    setTwoFactorMode(null);
    setUserRole('requestor'); 
    
    setTimeout(async () => {
      await signOut(auth);
      isLoggingOut.current = false; 
    }, 150); 
  };

  useEffect(() => {
    let heartbeatInterval = null;
    let sessionUnsubscribe = null; 

    getRedirectResult(auth).then((result) => {
      if (result) {
        console.log("Successfully logged in via redirect!", result.user);
      }
    }).catch(err => {
      console.error("Redirect Error:", err);
      setLoginError("Login failed during redirect: " + err.message);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {

      if (isLoggingOut.current) return;

      if (user) {
        
        const isSuperAdminProvider = user.providerData.some(p => p.providerId === 'password');

        const isStiEmail = user.email && (
          user.email.endsWith('@globalcity.sti.edu.ph') || 
          user.email.endsWith('@sti.edu.ph') ||
          user.email.endsWith('@globalcity.sti.edu')
        );

        if (!isStiEmail && !isSuperAdminProvider) {
          await signOut(auth);
          setLoginError("Access denied. Only STI institutional accounts are allowed.");
          setIsAuthenticated(false);
          setIsAuthLoading(false);
          return;
        }

        try {
          const userRef = doc(db, 'users', user.uid);
          
          let localSessionId = sessionStorage.getItem(`active_session_${user.uid}`);
          if (!localSessionId) {
            localSessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
            sessionStorage.setItem(`active_session_${user.uid}`, localSessionId);
          }

          const cachedRole = localStorage.getItem(`userRole_${user.uid}`);
          const requires2FACache = localStorage.getItem(`req2FA_${user.uid}`) === 'true';
          const isVerifiedThisSession = sessionStorage.getItem(`2fa_verified_${user.uid}`) === 'true';

          if (cachedRole && (!requires2FACache || isVerifiedThisSession)) {
            setUserRole(cachedRole);
            setIsAuthenticated(true);
            setIsAuthLoading(false); 
          }

          const userSnap = await getDoc(userRef);
          const nowIso = new Date().toISOString();

          let resolvedRole = 'requestor';

          if (userSnap.exists()) {
            const userData = userSnap.data();
            resolvedRole = userData.role || 'requestor';
            
            // OPT-IN POLICY: Only true if explicitly enabled
            const is2FAPolicyActive = userData.twoFactorEnabled === true;
            
            updateDoc(userRef, {
              status: 'Active',
              lastActive: nowIso,
              activeSessionId: localSessionId 
            }).catch(err => console.error("Heartbeat update failed:", err));

            // OPT-IN 2FA LOGIC
            if (!isVerifiedThisSession && is2FAPolicyActive) {
              if (userData.twoFactorSecret) {
                setTwoFactorSecret(userData.twoFactorSecret);
                setTwoFactorMode('verify');
                localStorage.setItem(`req2FA_${user.uid}`, 'true'); 
              } else {
                // Failsafe: Should not happen if they actually set it up, but just in case
                setTwoFactorMode('setup');
                localStorage.setItem(`req2FA_${user.uid}`, 'true'); 
              }
            } else if (!is2FAPolicyActive) {
              setTwoFactorMode(null); 
              localStorage.removeItem(`req2FA_${user.uid}`);
            }
            
          } else {
            const d = new Date();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const liveDate = `${month}/${day}/${d.getFullYear()}`;
            const rawName = user.displayName || "Super Admin";
            
            if (isSuperAdminProvider) {
              resolvedRole = 'super admin';
            } else if (user.email && user.email.endsWith('@globalcity.sti.edu')) {
              resolvedRole = 'endorser';
            } else if (/faculty/i.test(rawName)) {
              resolvedRole = 'endorser';
            } else if (/student/i.test(rawName)) {
              resolvedRole = 'requestor';
            } else {
              resolvedRole = 'requestor'; 
            }

            setDoc(userRef, {
              email: user.email,
              name: rawName,
              role: resolvedRole,
              uid: user.uid,
              dateJoined: liveDate,
              officeLocation: '',
              phone: '',
              status: 'Active',
              lastActive: nowIso,
              twoFactorEnabled: false, // Default OFF for new users
              activeSessionId: localSessionId 
            }).catch(err => console.error("User creation failed:", err));

            // Since it's off by default, we don't enforce setup anymore
            setTwoFactorMode(null);
            localStorage.removeItem(`req2FA_${user.uid}`);
          }

          localStorage.setItem(`userRole_${user.uid}`, resolvedRole);
          setUserRole(resolvedRole);

          if (sessionUnsubscribe) sessionUnsubscribe(); 
          
          sessionUnsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const dbSessionId = docSnap.data().activeSessionId;
              const currentLocalSession = sessionStorage.getItem(`active_session_${user.uid}`);
              
              if (dbSessionId && currentLocalSession && dbSessionId !== currentLocalSession) {
                console.warn("Account accessed from another location. Logging out.");
                alert("Security Alert: Your account was accessed from another browser or device. You have been automatically logged out here.");
                handleLogout(); 
              }
            }
          });

          if (!localStorage.getItem(`req2FA_${user.uid}`)) {
            setIsAuthenticated(true);
            if (!initialRedirectDone.current && location.pathname === '/') {
               navigate(resolvedRole.toLowerCase() === 'requestor' ? '/reserve' : '/dashboard', { replace: true });
               initialRedirectDone.current = true;
            }
          }

        } catch (error) {
          console.error("Error loading user session:", error);
          setLoginError("Failed to initialize user session.");
          setIsAuthenticated(false); 
        } finally {
          setIsAuthLoading(false);
        }
      } else {
        setIsAuthenticated(false);
        setTwoFactorMode(null);
        setIsAuthLoading(false);
        if (sessionUnsubscribe) sessionUnsubscribe(); 
      }
    });

    const handleTabClose = () => {
      if (auth.currentUser) {
        updateDoc(doc(db, 'users', auth.currentUser.uid), {
          status: 'Inactive',
          lastActive: new Date().toISOString()
        }).catch(err => console.error("Failed to set inactive status:", err));
      }
    };

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
    window.addEventListener('pagehide', handleTabClose); 
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (sessionUnsubscribe) sessionUnsubscribe(); 
      window.removeEventListener('beforeunload', handleTabClose);
      window.removeEventListener('pagehide', handleTabClose);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [navigate]); 

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

  // --- SHOW 2FA GATE ---
  if (twoFactorMode) {
    return (
      <TwoFactorGate 
        mode={twoFactorMode}
        existingSecret={twoFactorSecret}
        uid={auth.currentUser?.uid}
        userEmail={auth.currentUser?.email}
        onSuccess={() => {
          sessionStorage.setItem(`2fa_verified_${auth.currentUser.uid}`, 'true'); 
          
          setTwoFactorMode(null);
          setIsAuthenticated(true);
          localStorage.removeItem(`req2FA_${auth.currentUser.uid}`); 
          if (!initialRedirectDone.current && location.pathname === '/') {
            navigate(userRole.toLowerCase() === 'requestor' ? '/reserve' : '/dashboard', { replace: true });
            initialRedirectDone.current = true;
          }
        }}
        onCancel={handleLogout}
      />
    );
  }

  if (!isAuthenticated) {
    return <Login error={loginError} setError={setLoginError} />;
  }

  return (
    <div className="app-container">
      <SideBar 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        onLogout={handleLogout} 
        userRole={userRole} 
      />
      <div className="main-content">
        <TopBar toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        <div className="page-content">
          <Suspense fallback={<div className="loading-text">Loading..</div>}>
            <Routes> 
              <Route path="*" element={userRole.toLowerCase() === 'requestor' ? <Navigate to="/reserve" replace /> : <Navigate to="/dashboard" replace />} />
              <Route path="/dashboard/*" element={userRole.toLowerCase() === 'requestor' ? <Navigate to="/reserve" replace /> : <DashboardRouter currentUserRole={userRole.toLowerCase()} />} />
              <Route path="/reserve/*" element={<ReservationRouter currentUserRole={userRole.toLowerCase()} />} />
              <Route path="/schedule/*" element={<ScheduleRouter currentUserRole={userRole.toLowerCase()} />} />
              <Route path="/approval/*" element={<ApprovalRouter currentUserRole={userRole.toLowerCase()} />} />
              <Route path="/equipment/*" element={<EquipmentManagementRouter currentUserRole={userRole.toLowerCase()} />} />
              <Route path="/user/*" element={<UserManagementRouter currentUserRole={userRole.toLowerCase()} />} />
              <Route path="/facility/*" element={<FacilityRouter currentUserRole={userRole.toLowerCase()} />} />
              <Route path="/calendar/*" element={<CalendarRouter currentUserRole={userRole.toLowerCase()} />} />
              <Route path="/account/*" element={<ProfileRouter currentUserRole={userRole.toLowerCase()} />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}