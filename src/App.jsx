import { useState, useEffect, Suspense, useRef, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth'; 
import { doc, updateDoc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'; 
import { auth, db } from './Firebase';
import { acquireTabAccess, clearAccountStorage, clearBrowserCaches, getBrowserSessionId, LOGOUT_EVENT_KEY, NEW_LOGIN_KEY } from './services/browserSession';

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
  const navigation = useRef({ navigate, pathname: location.pathname });
  useEffect(() => {
    navigation.current = { navigate, pathname: location.pathname };
  }, [navigate, location.pathname]);
  const initialRedirectDone = useRef(false);
  const isLoggingOut = useRef(false);
  const sessionUid = useRef(null);
  const tabAccess = useRef(null);
  const profileCollection = useRef('users');

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const [isAuthenticated, setIsAuthenticated] = useState(false); 
  const [userRole, setUserRole] = useState('requestor');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [tabBlocked, setTabBlocked] = useState('');

  // --- 2FA ENFORCEMENT STATES ---
  const [twoFactorMode, setTwoFactorMode] = useState(null); // 'setup' | 'verify' | null
  const [twoFactorSecret, setTwoFactorSecret] = useState(null);

  const handleLogout = useCallback(async () => {
    isLoggingOut.current = true;
    localStorage.setItem(LOGOUT_EVENT_KEY, crypto.randomUUID());
    clearAccountStorage();
    
    navigation.current.navigate('/', { replace: true });

    setIsAuthenticated(false); 
    setTwoFactorMode(null);
    setTwoFactorSecret(null);
    setUserRole('requestor'); 
    initialRedirectDone.current = false;
    try {
      await signOut(auth);
    } finally {
      tabAccess.current?.release();
      tabAccess.current = null;
      isLoggingOut.current = false; 
      await clearBrowserCaches();
    }
  }, []);

  useEffect(() => {
    let heartbeatInterval = null;
    let sessionUnsubscribe = null; 
    let disposed = false;
    let authVersion = 0;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const version = ++authVersion;
      if (sessionUnsubscribe) {
        sessionUnsubscribe();
        sessionUnsubscribe = null;
      }

      if (isLoggingOut.current || sessionStorage.getItem('is_registering') === 'true') return;

      if (user) {
        setIsAuthenticated(false);
        setIsAuthLoading(true);
        setTwoFactorMode(null);
        setTwoFactorSecret(null);
        setTabBlocked('');

        const takeover = sessionStorage.getItem(NEW_LOGIN_KEY) === 'true';
        sessionStorage.removeItem(NEW_LOGIN_KEY);
        let access;
        try {
          if (tabAccess.current && tabAccess.current.uid !== user.uid) {
            tabAccess.current.release();
            tabAccess.current = null;
          }
          access = tabAccess.current || await acquireTabAccess(user.uid, navigator.locks, { takeover });
        } catch (error) {
          if (disposed || version !== authVersion) return;
          setTabBlocked(error.message);
          setIsAuthLoading(false);
          await signOut(auth);
          return;
        }
        if (disposed || version !== authVersion || isLoggingOut.current) {
          access?.release();
          return;
        }
        if (!access) {
          setTabBlocked('Your account is already open in another tab. Return to that tab. To use this one, close the other tab, then reload this page and sign in.');
          setIsAuthLoading(false);
          await signOut(auth);
          if (window.opener) window.close();
          return;
        }
        tabAccess.current = access;
        sessionUid.current = user.uid;
        access.lost.then(async () => {
          if (disposed || tabAccess.current !== access) return;
          ++authVersion;
          sessionUnsubscribe?.();
          sessionUnsubscribe = null;
          tabAccess.current = null;
          sessionUid.current = null;
          sessionStorage.removeItem(`2fa_verified_${user.uid}`);
          setIsAuthenticated(false);
          setTwoFactorMode(null);
          setTwoFactorSecret(null);
          setIsAuthLoading(false);
          setTabBlocked('This session ended because your account was signed in on another tab or window.');
          await signOut(auth);
          if (window.opener) window.close();
        });
        
        try {
          let isSuperAdmin = false;
          let userDocSnap = null;
          let resolvedRole = 'requestor';
          let userRef = null;

          // 1. Check if they exist in the super_users collection FIRST
          const superAdminRef = doc(db, 'super_users', user.uid);
          const superAdminSnap = await getDoc(superAdminRef);

          if (superAdminSnap.exists()) {
            isSuperAdmin = true;
            profileCollection.current = 'super_users';
            userDocSnap = superAdminSnap;
            resolvedRole = 'super admin';
            userRef = superAdminRef;
          } else {
            profileCollection.current = 'users';
            // 2. If not a Super Admin, enforce the domain check for normal users
            const isValidDomain = user.email && (
              user.email.endsWith('@gmail.com') || 
              user.email.endsWith('@outlook.com') ||
              user.email.endsWith('@yahoo.com') 
            );

            if (!isValidDomain) {
              await signOut(auth);
              setLoginError("Access denied. Only @gmail.com, @outlook.com, or @yahoo.com domains are allowed.");
              setIsAuthenticated(false);
              setIsAuthLoading(false);
              return;
            }

            // 3. Check the normal users collection
            userRef = doc(db, 'users', user.uid);
            userDocSnap = await getDoc(userRef);
          }

          if (userDocSnap.exists() && (userDocSnap.data().status || '').toLowerCase().trim() === 'blocked') {
            tabAccess.current?.release();
            tabAccess.current = null;
            setLoginError('Your Account is Blocked. Contact MIS personally for support.');
            setIsAuthenticated(false);
            setTwoFactorMode(null);
            setTwoFactorSecret(null);   
            await signOut(auth);
            return;
          }

          if (!isSuperAdmin && !user.emailVerified) {
            if (sessionStorage.getItem('is_registering') === 'true') {
              return;
            }

            await signOut(auth);
            setLoginError("Please check your inbox and verify your email before logging in.");
            setIsAuthenticated(false);
            setIsAuthLoading(false);
            return;
          }
          
          const localSessionId = await getBrowserSessionId(user.uid);
          if (disposed || version !== authVersion || auth.currentUser !== user || isLoggingOut.current) return;
          const isVerifiedThisSession = sessionStorage.getItem(`2fa_verified_${user.uid}`) === localSessionId;

          if (disposed || version !== authVersion || auth.currentUser !== user || isLoggingOut.current) return;
          const nowIso = new Date().toISOString();

          let needsTwoFactor = false;

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            // If they are a super admin, we keep the 'super admin' role set above. Otherwise, read from doc.
            if (!isSuperAdmin) {
              resolvedRole = userData.role || (userData.accountType === 'Faculty' ? 'endorser' : 'requestor');
            }
            
            const is2FAPolicyActive = userData.twoFactorEnabled === true;
            needsTwoFactor = is2FAPolicyActive && !isVerifiedThisSession;
            
            updateDoc(userRef, {
              status: 'Online',
              lastActive: nowIso,
              activeSessionId: localSessionId,
              emailVerified: true // Set field to true once they log in successfully after verifying
            }).catch(err => console.error("Heartbeat update failed:", err));

            if (!isVerifiedThisSession && is2FAPolicyActive) {
              if (userData.twoFactorSecret) {
                setTwoFactorSecret(userData.twoFactorSecret);
                setTwoFactorMode('verify');
                localStorage.setItem(`req2FA_${user.uid}`, 'true'); 
              } else {
                setTwoFactorMode('setup');
                localStorage.setItem(`req2FA_${user.uid}`, 'true'); 
              }
            } else if (!is2FAPolicyActive) {
              setTwoFactorMode(null); 
              localStorage.removeItem(`req2FA_${user.uid}`);
            }
            
          } else {
            // --- NEW USER CREATION LOGIC (Only runs for normal users) ---
            if (isSuperAdmin) {
               // This block should never run for super admins since we already verified their document exists above.
               console.error("Super admin document missing during initialization.");
               return; 
            }

            const d = new Date();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const liveDate = `${month}/${day}/${d.getFullYear()}`;
            const rawName = user.displayName || "New User";
            
            if (/faculty|endorser/i.test(rawName)) {
              resolvedRole = 'endorser';
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
              status: 'Online',
              lastActive: nowIso,
              twoFactorEnabled: false, 
              activeSessionId: localSessionId 
            }, { merge: true }).catch(err => console.error("User creation failed:", err));

            setTwoFactorMode(null);
            localStorage.removeItem(`req2FA_${user.uid}`);
          }

          localStorage.setItem(`userRole_${user.uid}`, resolvedRole);
          setUserRole(resolvedRole);

          if (sessionUnsubscribe) sessionUnsubscribe(); 
          
          sessionUnsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const profileData = docSnap.data();
              if ((profileData.status || '').toLowerCase().trim() === 'blocked') {
                setLoginError('Your Account is Blocked. Appeal to MIS personally for more details.');
                setIsAuthenticated(false);
                setTwoFactorMode(null);
                setTwoFactorSecret(null);
                void signOut(auth).catch((error) => {
                  console.error('Failed to sign out blocked user:', error);
                });
                return;
              }

              const dbSessionId = profileData.activeSessionId;
              const currentLocalSession = localStorage.getItem(`active_session_${user.uid}`);
              
              if (dbSessionId && currentLocalSession && dbSessionId !== currentLocalSession) {
                console.warn("Account accessed from another location. Logging out.");
                alert("Security Alert: Your account was accessed from another browser or device. You have been automatically logged out here.");
                handleLogout(); 
              }
            }
          });

          if (!needsTwoFactor) {
            setIsAuthenticated(true);
            if (!initialRedirectDone.current && navigation.current.pathname === '/') {
               navigation.current.navigate(resolvedRole.toLowerCase() === 'requestor' ? '/reserve' : '/dashboard', { replace: true });
               initialRedirectDone.current = true;
            }
          }

        } catch (error) {
          if (disposed || version !== authVersion || isLoggingOut.current) return;
          console.error("Error loading user session:", error);
          setLoginError("Failed to initialize user session.");
          setIsAuthenticated(false); 
        } finally {
          if (!disposed && version === authVersion) setIsAuthLoading(false);
        }
      } else {
        tabAccess.current?.release();
        tabAccess.current = null;
        profileCollection.current = 'users';
        if (sessionUid.current) {
          setTabBlocked('');
          clearAccountStorage();
          void clearBrowserCaches();
        }
        sessionUid.current = null;
        initialRedirectDone.current = false;
        setIsAuthenticated(false);
        setTwoFactorMode(null);
        setTwoFactorSecret(null);
        setUserRole('requestor');
        setIsAuthLoading(false);
        if (sessionUnsubscribe) sessionUnsubscribe(); 
      }
    });

    const syncSession = (event) => {
      if (event.key === LOGOUT_EVENT_KEY && event.newValue) {
        void handleLogoutFromAnotherTab();
      }
    };
    const handleLogoutFromAnotherTab = async () => {
      clearAccountStorage();
      setIsAuthenticated(false);
      setTwoFactorMode(null);
      setTwoFactorSecret(null);
      await signOut(auth);
      await clearBrowserCaches();
    };
    window.addEventListener('storage', syncSession);

    const handleTabClose = () => {
      if (auth.currentUser && tabAccess.current) {
        const userRef = doc(db, profileCollection.current, auth.currentUser.uid);
            
        updateDoc(userRef, {
          status: 'Offline',
          lastActive: new Date().toISOString()
        }).catch(err => console.error("Failed to set inactive status:", err));
      }
    };

    const handleVisibilityChange = () => {
      if (auth.currentUser && tabAccess.current) {
        if (document.visibilityState === 'visible') {
          const userRef = doc(db, profileCollection.current, auth.currentUser.uid);

          updateDoc(userRef, {
            status: 'Online',
            lastActive: new Date().toISOString()
          }).catch(err => console.error("Failed to set active status:", err));
        }
      }
    };

    window.addEventListener('beforeunload', handleTabClose);
    window.addEventListener('pagehide', handleTabClose); 
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      tabAccess.current?.release();
      tabAccess.current = null;
      unsubscribe();
      window.removeEventListener('storage', syncSession);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (sessionUnsubscribe) sessionUnsubscribe(); 
      window.removeEventListener('beforeunload', handleTabClose);
      window.removeEventListener('pagehide', handleTabClose);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleLogout]);

  if (tabBlocked) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F8FAFC', padding: '24px' }}>
        <section role="alert" style={{ maxWidth: '440px', textAlign: 'center', color: '#0f172a' }}>
          <h1>Session already in use</h1>
          <p>{tabBlocked}</p>
          <button onClick={() => window.location.reload()}>Check again</button>
        </section>
      </main>
    );
  }

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
        userCollection={userRole === 'super admin' ? 'super_users' : 'users'}
        userEmail={auth.currentUser?.email}
        onSuccess={() => {
          sessionStorage.setItem(`2fa_verified_${auth.currentUser.uid}`, localStorage.getItem(`active_session_${auth.currentUser.uid}`));
          
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
        <TopBar toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} userRole={userRole}/>
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