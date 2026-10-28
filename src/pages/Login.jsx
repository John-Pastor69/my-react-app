import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../Firebase'; 
import { NEW_LOGIN_KEY } from '../services/browserSession';
import { DEFAULT_COURSE_OPTIONS, DEFAULT_DEPARTMENT_OPTIONS } from '../services/signupOptions';
import '../styles/Login.scss';

export default function Login({ error, setError }) {
  const [showForm, setShowForm] = useState(false);
  const [isLogin, setIsLogin] = useState(true); 
  const [showTerms, setShowTerms] = useState(false);

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
  const [signupOptions, setSignupOptions] = useState({
    courses: DEFAULT_COURSE_OPTIONS,
    departments: DEFAULT_DEPARTMENT_OPTIONS
  });
  const [signupOptionsError, setSignupOptionsError] = useState('');

  const themeBlue = '#0033A0';
  const lightBlueBorder = '#93C5FD';

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'app_settings', 'signupOptions'),
      (snapshot) => {
        const data = snapshot.data() || {};
        setSignupOptions({
          courses: Array.isArray(data.courses) ? data.courses : DEFAULT_COURSE_OPTIONS,
          departments: Array.isArray(data.departments) ? data.departments : DEFAULT_DEPARTMENT_OPTIONS
        });
        setSignupOptionsError('');
      },
      (optionsError) => {
        console.error('Failed to load signup options:', optionsError);
        setSignupOptionsError('Signup options could not be loaded. Please try again later.');
      }
    );

    return () => unsubscribe();
  }, []);

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

    if (!isLogin) {
      if (!/^[A-Za-z]+$/.test(firstName) || !/^[A-Za-z]+$/.test(lastName)) {
        if (setError) setError('First and last names may contain letters only.');
        return;
      }

      if (firstName.length > 20 || lastName.length > 20) {
        if (setError) setError('First and last names must be 20 characters or fewer.');
        return;
      }

      if (email.length > 40) {
        if (setError) setError('Email address must be 40 characters or fewer.');
        return;
      }

      if (password.length > 30) {
        if (setError) setError('Password must be 30 characters or fewer.');
        return;
      }

      if ((tag === 'Student' || tag === 'Student Leader') && !/^[0-9]{11}$/.test(studentNumber)) {
        if (setError) setError('Student number must contain exactly 11 digits.');
        return;
      }

      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[^A-Za-z0-9\s]/.test(password)) {
        if (setError) setError('Password must contain an uppercase letter, a lowercase letter, and at least one symbol.');
        return;
      }
    }

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
          department: ['Admin Staff', 'Admin and Staff', 'Faculty'].includes(tag) ? department : '',
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
                {error && <div role="alert" aria-live="assertive" style={{color: '#dc2626', fontSize: '13px', fontWeight: 'bold', marginBottom: '12px', textAlign: 'center'}}>{error}</div>}
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
                            onChange={(e) => setFirstName(e.target.value.replace(/[^A-Za-z]/g, ''))}
                            maxLength={20}
                            pattern="[A-Za-z]+"
                            title="Use letters only."
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
                            onChange={(e) => setLastName(e.target.value.replace(/[^A-Za-z]/g, ''))}
                            maxLength={20}
                            pattern="[A-Za-z]+"
                            title="Use letters only."
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
                              onChange={(e) => setStudentNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
                              inputMode="numeric"
                              pattern="[0-9]{11}"
                              maxLength={11}
                              title="Enter exactly 11 digits."
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
                              disabled={Boolean(signupOptionsError)}
                            >
                              <option value="" disabled>Select Course</option>
                              {signupOptions.courses.map((group) => (
                                <optgroup label={group.group} key={group.group}>
                                  {group.options.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      {(['Admin Staff', 'Admin and Staff', 'Faculty'].includes(tag)) && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <label style={labelStyle}>Department / Office</label>
                          <select 
                            value={department} 
                            onChange={(e) => setDepartment(e.target.value)} 
                            required 
                            style={inputStyle}
                            disabled={Boolean(signupOptionsError)}
                          >
                            <option value="" disabled>Select Department</option>
                            {signupOptions.departments.map((group) => (
                              <optgroup label={group.group} key={group.group}>
                                {group.options.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                  {!isLogin && signupOptionsError && (
                    <p role="alert" style={{ color: '#dc2626', fontSize: '13px', fontWeight: 'bold' }}>
                      {signupOptionsError}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={labelStyle}>Email Address</label>
                    <input 
                      type="email" 
                      placeholder="Email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={isLogin ? undefined : 40}
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
                      maxLength={isLogin ? undefined : 30}
                      pattern={isLogin ? undefined : '(?=.*[A-Z])(?=.*[a-z])(?=.*[^A-Za-z0-9\\s]).*'}
                      title={isLogin ? undefined : 'Include an uppercase letter, a lowercase letter, and a symbol.'}
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
                        maxLength={30}
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
                      <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.4' }}>
                        I agree to the <button
                          type="button"
                          onClick={() => setShowTerms(true)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            width: 'auto',
                            borderRadius: 0,
                            display: 'inline',
                            color: themeBlue,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            font: 'inherit'
                          }}
                        >Terms and Conditions</button> and consent to the collection of my data for the facility reservation system.
                      </div>
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
            {showTerms && (
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="terms-title"
                onClick={() => setShowTerms(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 1100,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  backgroundColor: 'rgba(0, 0, 0, 0.55)'
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    maxWidth: '600px',
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    padding: '24px',
                    borderTop: `6px solid ${themeBlue}`,
                    borderRadius: '8px',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    lineHeight: 1.5
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                    <h2 id="terms-title" style={{ margin: 0, color: themeBlue }}>Terms and Conditions</h2>
                    <button
                      type="button"
                      aria-label="Close Terms and Conditions"
                      onClick={() => setShowTerms(false)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: themeBlue,
                        fontSize: '24px',
                        cursor: 'pointer'
                      }}
                    >
                      &times;
                    </button>
                  </div>

                  <p>By creating an account and using the STI Global City Reservation System, you agree to the following terms.</p>

                  <h3>Information collected</h3>
                  <p>The system collects information needed to manage your account and facility reservations, including:</p>
                  <ul>
                    <li>Your first and last name, email address, account type, and authentication account details. Your password is handled by Firebase Authentication and is not included in the user profile document created by this app.</li>
                    <li>For students and student leaders: your student number and course or program.</li>
                    <li>For administrators, staff, and faculty: your department or office.</li>
                    <li>Account records generated by the system, such as your account ID, assigned role, email-verification status, and account creation time.</li>
                    <li>When you submit a reservation: contact details, requestor information, endorser name/designation/email, event name and purpose, participant count, event type, requested dates and times, schedule, facilities or room, equipment and utilities, and air-conditioning requirements when applicable.</li>
                    <li>Reservation records needed to process and track requests, such as reference number, status, timestamps, and approval or modification history.</li>
                  </ul>

                  <h3>How information is used</h3>
                  <p>Your information is used to create and manage your account, verify your email, determine system access, prepare reservation requests, check availability, and allow authorized staff and relevant approvers to review, process, and communicate about reservations. The system uses Firebase services for authentication and data storage and sends email for verification and reservation-related communications.</p>

                  <h3>Your responsibilities</h3>
                  <p>Provide accurate information, keep your sign-in credentials private, and use the system only for legitimate facility reservation purposes. Do not use another person’s account or submit information about others unless it is needed for a reservation and you are authorized to provide it.</p>

                  <h3>Access and retention</h3>
                  <p>Account and reservation information may be accessed by authorized system personnel and the relevant reviewers or approvers to perform their duties. Records are retained as needed to operate the reservation system and meet applicable institutional recordkeeping requirements. Contact the system administrator for questions or requests about your information.</p>

                  <p>By checking the agreement box, you confirm that you have read these terms and consent to the collection and use of information described above for operating the account and reservation system.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}