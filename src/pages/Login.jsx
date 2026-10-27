import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../Firebase'; 
import { NEW_LOGIN_KEY } from '../services/browserSession';
import '../styles/Login.scss';

export default function Login({ error, setError }) {
  const [showForm, setShowForm] = useState(false);
  const [isLogin, setIsLogin] = useState(true); 

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [tag, setTag] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [course, setCourse] = useState('');
  const [department, setDepartment] = useState(''); 
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [resetMessage, setResetMessage] = useState(''); 
  const [resetCooldown, setResetCooldown] = useState(0);

  const themeBlue = '#0033A0';
  const lightBlueBorder = '#93C5FD';

  // --- 60 SECOND BUTTON COOLDOWN TIMER ---
  useEffect(() => {
    let timer;
    if (resetCooldown > 0) {
      timer = setInterval(() => {
        setResetCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resetCooldown]);

  // --- 10 SECOND MESSAGE DISPLAY TIMER ---
  useEffect(() => {
    let msgTimer;
    if (resetMessage || error) {
      msgTimer = setTimeout(() => {
        setResetMessage('');
        if (setError) setError(''); 
      }, 10000); 
    }
    return () => clearTimeout(msgTimer);
  }, [resetMessage, error, setError]);

  const openModal = () => {
    setShowForm(true);
    if (setError) setError('');
    setResetMessage('');
  };

  const closeModal = () => {
    setShowForm(false);
    setIsLogin(true);
    setFirstName('');
    setLastName('');
    setTag('');
    setStudentNumber('');
    setCourse('');
    setDepartment('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    if (setError) setError('');
    setResetMessage('');
  };

  const handleForgotPassword = async (targetEmail) => {
    if (resetCooldown > 0) return; 
    
    if (setError) setError('');
    setResetMessage('');

    const emailToReset = targetEmail?.trim();

    if (!emailToReset) {
      if (setError) setError('Please type your email address in the field first to reset your password.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, emailToReset);
      setResetMessage('Password reset link sent! Check your email.');
      setResetCooldown(60); 
    } catch (err) {
      console.error("Password reset error:", err.message);
      if (setError) {
        if (err.code === 'auth/user-not-found') {
          setError('No account found with this email address.');
        } else if (err.code === 'auth/invalid-email') {
          setError('Please enter a valid email address format.');
        } else {
          setError('Failed to send reset email. Please try again.');
        }
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (setError) setError('');
    setResetMessage('');

    try {
      sessionStorage.setItem(NEW_LOGIN_KEY, 'true');

      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (password !== confirmPassword) {
          if (setError) setError("Passwords do not match.");
          sessionStorage.removeItem(NEW_LOGIN_KEY);
          return;
        }

        const isValidDomain = email.endsWith('@gmail.com') || 
                              email.endsWith('@outlook.com') || 
                              email.endsWith('@yahoo.com');
        
        if (!isValidDomain) {
          if (setError) setError("You must use a valid @gmail.com, @outlook.com, or @yahoo.com email to register.");
          sessionStorage.removeItem(NEW_LOGIN_KEY);
          return;
        }

        // Set flag so App.jsx doesn't kill the session before we finish writing the document
        sessionStorage.setItem('is_registering', 'true');

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        const fullName = `${firstName} ${lastName}`;
        await updateProfile(userCredential.user, {
          displayName: fullName
        });

        // Generate absolute timestamp for timeCreated
        const now = new Date();

        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          name: fullName,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          accountType: tag,
          role: tag === 'Faculty' ? 'endorser' : 'requestor',
          studentNumber: tag === 'Student' || tag === 'Student Leader' ? studentNumber.trim() : '',
          course: tag === 'Student' || tag === 'Student Leader' ? course : '',
          department: tag === 'Admin Staff' || tag === 'Faculty' ? department : '',
          emailVerified: false, // Default to false upon creation
          timeCreated: now.toISOString() // Record exactly when account was made
        }, { merge: true });

        await sendEmailVerification(userCredential.user);

        // Safely sign out the user now that the document is saved
        await auth.signOut();
        sessionStorage.removeItem('is_registering');
        sessionStorage.removeItem(NEW_LOGIN_KEY);
        
        // Immediately switch to login view and show the success message
        setIsLogin(true);
        setResetMessage('Registration successful! Please check your email inbox to verify your account.');
        
        // Clean up local fields
        setFirstName('');
        setLastName('');
        setTag('');
        setStudentNumber('');
        setCourse('');
        setDepartment('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      sessionStorage.removeItem(NEW_LOGIN_KEY);
      sessionStorage.removeItem('is_registering');
      console.error("Authentication error:", err.message);
      
      if (setError) {
        if (err.code === 'auth/email-already-in-use') {
          setError("This email is already registered. Please log in.");
        } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
          setError("Invalid email or password.");
        } else if (err.code === 'auth/weak-password') {
          setError("Password should be at least 6 characters.");
        } else {
          setError("Authentication failed: " + err.message);
        }
      }
    }
  };

  React.useEffect(() => {
    if (error) {
      setShowForm(true);
    }
  }, [error]);

  const inputStyle = { 
    padding: '10px', 
    borderRadius: '6px', 
    border: `1px solid ${lightBlueBorder}`, 
    fontSize: '14px', 
    width: '100%', 
    boxSizing: 'border-box',
    backgroundColor: '#FAFAFA',
    color: themeBlue
  };

  const labelStyle = {
    fontSize: '13px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '4px',
    textAlign: 'left',
    display: 'block'
  };

  return (
    <div className="landing-page">
      <div className="top-nav-bar">
        <div className="spacer"></div>
        <button className="top-login-btn" onClick={openModal} style={{ backgroundColor: themeBlue, color: '#FFFFFF', fontWeight: 'bold' }}>
          Log in
        </button>
      </div>

      <div className="brand-header">
        <div className="sti-logo-container">
          <h1 className="brand-title" style={{ color: themeBlue }}>STI Global City Reservation System</h1>
        </div>
      </div>

      <div className="landing-content">
        {showForm && (
          <div className="login-modal-overlay">
            <div className="login-modal-content" onClick={(e) => e.stopPropagation()} style={{ borderTop: `6px solid ${themeBlue}` }}>
              
              <div className="modal-header">
                <i className="ph ph-x close-icon" onClick={closeModal} style={{ color: themeBlue }}></i>
              </div>

              <div className="modal-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                {error && <div style={{color: '#dc2626', fontSize: '13px', fontWeight: 'bold', marginBottom: '12px', textAlign: 'center'}}>{error}</div>}
                {resetMessage && <div style={{color: '#16a34a', fontSize: '13px', fontWeight: 'bold', marginBottom: '12px', textAlign: 'center'}}>{resetMessage}</div>}
                
                <h2 style={{ textAlign: 'center', marginBottom: '1rem', color: themeBlue }}>
                  {isLogin ? 'Sign In' : 'Create Account'}
                </h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {!isLogin && (
                    <>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <label style={labelStyle}>First Name</label>
                          <input 
                            type="text" 
                            placeholder="First Name" 
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            required
                            style={inputStyle}
                          />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <label style={labelStyle}>Last Name</label>
                          <input 
                            type="text" 
                            placeholder="Last Name" 
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            required
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={labelStyle}>Account Type</label>
                        <select 
                          value={tag} 
                          onChange={(e) => setTag(e.target.value)} 
                          required 
                          style={inputStyle}
                        >
                          <option value="" disabled>e.g. Student</option>
                          <option value="Student">Student</option>
                          <option value="Student Leader">Student Leader</option>
                          <option value="Admin Staff">Admin Staff</option>
                          <option value="Faculty">Faculty</option>
                        </select>
                      </div>

                      {(tag === 'Student' || tag === 'Student Leader') && (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={labelStyle}>Student Number</label>
                            <input 
                              type="text" 
                              placeholder="e.g 02000212345" 
                              value={studentNumber}
                              onChange={(e) => setStudentNumber(e.target.value)}
                              required
                              style={inputStyle}
                            />
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={labelStyle}>Course / Program</label>
                            <select 
                              value={course} 
                              onChange={(e) => setCourse(e.target.value)} 
                              required 
                              style={inputStyle}
                            >
                              <option value="" disabled>Select Course</option>
                              <optgroup label="Senior High School">
                                <option value="STEM">STEM - Science Technology Engineering Math</option>
                                <option value="HUMSS">HUMSS - Humanities Social Sciences</option>
                                <option value="ABM">ABM - Accountancy Business Management</option>
                                <option value="TVL-ICT">TVL - Information Communications Technology</option>
                                <option value="TVL-HE">TVL - Home Economics</option>
                                <option value="TVL-IA">TVL - Industrial Arts</option>
                              </optgroup>
                              <optgroup label="College">
                                <option value="BSIT">BSIT - Bachelor of Science in Information Technology</option>
                                <option value="BSCS">BSCS - Bachelor of Science in Computer Science</option>
                                <option value="BSBA">BSBA - Bachelor of Science in Business Administration</option>
                                <option value="BSA">BSA - Bachelor of Science in Accountancy</option>
                                <option value="BACOMM">BACOMM - Bachelor of Arts in Communication</option>
                                <option value="BSEDUC">BSEDUC - Bachelor of Elementary Education</option>
                                <option value="BSHM">BSHM - Hospitality Management</option>
                                <option value="BSTM">BSTM - Tourism Management</option>
                              </optgroup>
                            </select>
                          </div>
                        </>
                      )}

                      {(tag === 'Admin Staff' || tag === 'Faculty') && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <label style={labelStyle}>Department / Office</label>
                          <select 
                            value={department} 
                            onChange={(e) => setDepartment(e.target.value)} 
                            required 
                            style={inputStyle}
                          >
                            <option value="" disabled>Select Department</option>
                            <optgroup label="Academic Departments">
                              <option value="SHS Department">Senior High School (SHS) Department</option>
                              <option value="College Department">College Department</option>
                            </optgroup>
                            <optgroup label="Offices & Administration">
                              <option value="MIS">Management Information System (MIS)</option>
                              <option value="Registrar">Registrar's Office</option>
                              <option value="Cashier">Cashier</option>
                              <option value="Student Affairs">Office of Student Affairs</option>
                              <option value="Guidance">Guidance Office</option>
                              <option value="HR">Human Resources</option>
                              <option value="General Services">General Services / Building Admin</option>
                              <option value="Other">Other</option>
                            </optgroup>
                          </select>
                        </div>
                      )}
                    </>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={labelStyle}>Email Address</label>
                    <input 
                      type="email" 
                      placeholder="Email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      style={inputStyle}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    <label style={labelStyle}>Password</label>
                    <input 
                      type="password" 
                      placeholder="Password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      style={inputStyle}
                    />
                    {isLogin && (
                      <div style={{ textAlign: 'right', marginTop: '6px' }}>
                        <button 
                          type="button" 
                          onClick={() => handleForgotPassword(email)}
                          disabled={resetCooldown > 0}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            width: 'auto',
                            padding: 0,
                            borderRadius: 0,
                            display: 'inline-flex',
                            color: resetCooldown > 0 ? '#94A3B8' : '#64748B', 
                            fontSize: '12px', 
                            cursor: resetCooldown > 0 ? 'not-allowed' : 'pointer', 
                            textDecoration: resetCooldown > 0 ? 'none' : 'underline' 
                          }}
                        >
                          {resetCooldown > 0 ? `Wait ${resetCooldown}s to resend` : 'Forgot password?'}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isLogin && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <label style={labelStyle}>Confirm Password</label>
                      <input 
                        type="password" 
                        placeholder="Confirm Password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        style={inputStyle}
                      />
                    </div>
                  )}

                  {/* TERMS AND CONDITIONS CHECKBOX FOR SIGN UP */}
                  {!isLogin && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '8px' }}>
                      <input 
                        type="checkbox" 
                        id="terms" 
                        required 
                        style={{ marginTop: '2px', cursor: 'pointer' }} 
                      />
                      <label htmlFor="terms" style={{ fontSize: '12px', color: '#475569', lineHeight: '1.4' }}>
                        I agree to the <a href="#" style={{ color: themeBlue, textDecoration: 'underline' }}>Terms and Conditions</a> and consent to the collection of my data for the facility reservation system.
                      </label>
                    </div>
                  )}
                  
                  <button type="submit" style={{ padding: '12px', background: themeBlue, color: '#FFFFFF', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>
                    {isLogin ? 'Log In' : 'Sign Up'}
                  </button>
                </form>

                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <button 
                    type="button" 
                    onClick={() => setIsLogin(!isLogin)}
                    style={{ background: 'none', border: 'none', color: themeBlue, fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold' }}
                  >
                    {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}