import React, { useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, microsoftProvider } from '../Firebase';
import '../styles/Login.scss';

export default function Login({ onLogin }) {
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const openModal = () => {
    setShowForm(true);
    setError('');
  };

  const closeModal = () => {
    setShowForm(false);
    setError('');
  };

  const handleMicrosoftLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // 1. Authenticate via Microsoft SSO
      const result = await signInWithPopup(auth, microsoftProvider);
      const user = result.user;
      
      // 2. Verify if the email belongs to the STI domain
      const isStiEmail = user.email && (
        user.email.endsWith('@globalcity.sti.edu.ph') || 
        user.email.endsWith('@sti.edu.ph')
      );

      if (!isStiEmail) {
        await signOut(auth);
        setError("Access denied. Only STI institutional accounts are allowed.");
        return;
      }

      // 3. Check Firestore for the user's role
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      let assignedRole = 'Requestor'; // Set default to 'requestor'
      const nowIso = new Date().toISOString(); // Get current timestamp for lastActive

      if (userDoc.exists()) {
        assignedRole = userDoc.data().role; 
        
        // --- SET STATUS TO ACTIVE ON LOGIN ---
        await updateDoc(userDocRef, {
          status: 'Active',
          lastActive: nowIso
        });

      } else {
        // Format live date as MM/DD/YYYY (e.g., 09/26/2026)
        const d = new Date();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const liveDate = `${month}/${day}/${d.getFullYear()}`;

        // Add the new user to Firestore WITH active status
        await setDoc(userDocRef, {
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

      console.log(`Successfully logged in as ${user.email} with role: ${assignedRole}`);
      
      // 4. Pass the role to App.jsx!
      onLogin(assignedRole); 
      
    } catch (error) {
      console.error("Error signing in with Microsoft:", error.message);
      setError("Microsoft login failed. Please try again.");
    }
  };

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
          <div className="sti-yellow-box">
            <span className="globe-icon">🌐</span>
            <span className="sti-text">STI</span>
          </div>
          <h1 className="brand-title">STI Education Services Group</h1>
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
                  Log in with Office 365
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}