import React, { useState } from 'react';
import { signInWithRedirect, signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, microsoftProvider } from '../Firebase';
import '../styles/Login.scss';

export default function Login({ error, setError }) {
  const [showForm, setShowForm] = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const openModal = () => {
    setShowForm(true);
    if (setError) setError('');
  };

  const closeModal = () => {
    setShowForm(false);
    setShowAdminForm(false);
    setAdminEmail('');
    setAdminPassword('');
    if (setError) setError('');
  };

  const handleMicrosoftLogin = async (e) => {
    e.preventDefault();
    if (setError) setError('');
    try {
      if (window.location.hostname === 'localhost') {
        await signInWithPopup(auth, microsoftProvider);
      } else {
        await signInWithRedirect(auth, microsoftProvider);
      }
    } catch (err) {
      console.error("Error signing in with Microsoft:", err.message);
      if (setError) setError("Microsoft login failed. Please try again.");
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (setError) setError('');
    try {
      // Authenticate via standard Firebase Email/Password
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    } catch (err) {
      console.error("Error signing in as admin:", err.message);
      if (setError) setError("Invalid Super Admin credentials.");
    }
  };

  React.useEffect(() => {
    if (error) {
      setShowForm(true);
    }
  }, [error]);

  return (
    <div className="landing-page">
      <div className="top-nav-bar">
        <div className="spacer"></div>
        <button className="top-login-btn" onClick={openModal}>
          Log in
        </button>
      </div>

      <div className="brand-header">
        <div className="sti-logo-container">
          <h1 className="brand-title">STI Reservation System</h1>
        </div>
      </div>

      <div className="landing-content">
        {showForm && (
          <div className="login-modal-overlay">
            <div className="login-modal-content" onClick={(e) => e.stopPropagation()}>
              
              <div className="modal-header">
                <i className="ph ph-x close-icon" onClick={closeModal}></i>
              </div>

              <div className="modal-body">
                {error && <div style={{color: '#dc2626', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center'}}>{error}</div>}
                
                <button className="btn-office" onClick={handleMicrosoftLogin}>
                  <i className="ph-fill ph-windows-logo"></i>
                  Log in with Microsoft Entra ID  
                </button>

                {/* SUPER ADMIN TOGGLE */}
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <button 
                    type="button" 
                    onClick={() => setShowAdminForm(!showAdminForm)}
                    style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {showAdminForm ? "Hide Admin Login" : "Admin Login"}
                  </button>
                </div>

                {/* SUPER ADMIN FORM */}
                {showAdminForm && (
                  <form onSubmit={handleAdminLogin} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input 
                      type="email" 
                      placeholder="Admin Email" 
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    <input 
                      type="password" 
                      placeholder="Password" 
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    <button type="submit" style={{ padding: '10px', background: '#0f172a', color: 'white', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                      Login as Admin
                    </button>
                  </form>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}