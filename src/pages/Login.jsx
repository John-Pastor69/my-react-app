import React, { useState } from 'react';
import { signInWithRedirect, signInWithPopup } from 'firebase/auth';
import { auth, microsoftProvider } from '../Firebase';
import '../styles/Login.scss';

export default function Login({ error, setError }) {
  const [showForm, setShowForm] = useState(false);

  const openModal = () => {
    setShowForm(true);
    if (setError) setError('');
  };

  const closeModal = () => {
    setShowForm(false);
    if (setError) setError('');
  };

  const handleMicrosoftLogin = async (e) => {
    e.preventDefault();
    if (setError) setError('');
    try {
      if (window.location.hostname === 'localhost') {
        // Authenticate via Microsoft SSO Popup for local development
        await signInWithPopup(auth, microsoftProvider);
      } else {
        // Authenticate via Microsoft SSO Redirect for live deployment
        await signInWithRedirect(auth, microsoftProvider);
      }
    } catch (err) {
      console.error("Error signing in with Microsoft:", err.message);
      if (setError) setError("Microsoft login failed. Please try again.");
    }
  };

  // If there's an external error passed in (e.g., from App.jsx after a failed redirect), auto-open the modal
  React.useEffect(() => {
    if (error) {
      setShowForm(true);
    }
  }, [error]);

  return (
    <div className="landing-page">
      
      {/* TOP NAV BAR */}
      <div className="top-nav-bar">
        <div className="spacer"></div>
        <button className="top-login-btn" onClick={openModal}>
          Log in
        </button>
      </div>

      {/* STI BRANDING HEADER */}
      <div className="brand-header">
        <div className="sti-logo-container">
          <h1 className="brand-title">STI Reservation System</h1>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="landing-content">
        
        {showForm && (
          <div className="login-modal-overlay">
            <div className="login-modal-content" onClick={(e) => e.stopPropagation()}>
              
              <div className="modal-header">
                <i className="ph ph-x close-icon" onClick={closeModal}></i>
              </div>

              <div className="modal-body">
                {/* Error message banner */}
                {error && <div style={{color: '#dc2626', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center'}}>{error}</div>}
                
                <button className="btn-office" onClick={handleMicrosoftLogin}>
                  <i className="ph-fill ph-windows-logo"></i>
                  Log in with Microsoft Entra ID  
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}