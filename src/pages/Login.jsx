import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../Firebase'; 
import { NEW_LOGIN_KEY } from '../services/browserSession';
import {
  DEFAULT_ACCOUNT_TYPES,
  DEFAULT_COURSE_OPTIONS,
  DEFAULT_DEPARTMENT_OPTIONS,
  DEFAULT_SIGNUP_DROPDOWNS,
  filterSignupTextValue,
  normalizeAccountTypes,
  normalizeSignupDropdowns
} from '../services/signupOptions';
import '../styles/Login.scss';

export default function Login({ error, setError }) {
  const [showForm, setShowForm] = useState(false);
  const [isLogin, setIsLogin] = useState(true); 
  const [showTerms, setShowTerms] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [middleInitial, setMiddleInitial] = useState('');
  const [lastName, setLastName] = useState('');
  const [tag, setTag] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [signupDropdownValue, setSignupDropdownValue] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState({});
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [resetMessage, setResetMessage] = useState(''); 
  const [resetCooldown, setResetCooldown] = useState(0);
  const [signupOptions, setSignupOptions] = useState({
    accountTypes: normalizeAccountTypes(DEFAULT_ACCOUNT_TYPES),
    dropdownTypes: DEFAULT_SIGNUP_DROPDOWNS
  });
  const [signupOptionsError, setSignupOptionsError] = useState('');

  const themeBlue = '#0033A0';
  const lightBlueBorder = '#93C5FD';

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'app_settings', 'signupOptions'),
      (snapshot) => {
        const data = snapshot.data() || {};
        const courses = Array.isArray(data.courses) ? data.courses : DEFAULT_COURSE_OPTIONS;
        const departments = Array.isArray(data.departments) ? data.departments : DEFAULT_DEPARTMENT_OPTIONS;
        const accountTypes = Array.isArray(data.accountTypes) ? data.accountTypes : DEFAULT_ACCOUNT_TYPES;
        setSignupOptions({
          accountTypes: normalizeAccountTypes(
            accountTypes,
            courses,
            departments
          ),
          dropdownTypes: normalizeSignupDropdowns(data.dropdownTypes, accountTypes)
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
    setMiddleInitial('');
    setLastName('');
    setTag('');
    setStudentNumber('');
    setSignupDropdownValue('');
    setCustomFieldValues({});
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
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
      if (!/^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(firstName.trim())
        || !/^[A-Za-z]+$/.test(middleInitial)
        || !/^[A-Za-z]+$/.test(lastName)) {
        if (setError) setError('Enter a valid first name, middle initial, and last name.');
        return;
      }

      if (firstName.trim().length > 20 || lastName.length > 20) {
        if (setError) setError('First and last names must be 20 characters or fewer.');
        return;
      }

      if (email.length > 40) {
        if (setError) setError('Email address must be 40 characters or fewer.');
        return;
      }

      if (!signupOptions.accountTypes.some((accountType) => accountType.value === tag)) {
        if (setError) setError('Select a valid account type.');
        return;
      }

      if (password.length > 30) {
        if (setError) setError('Password must be 30 characters or fewer.');
        return;
      }

      if (selectedSignupAccountType?.dropdown === 'courses' && !/^[0-9]{11}$/.test(studentNumber)) {
        if (setError) setError('Student number must contain exactly 11 digits.');
        return;
      }
      if (selectedSignupAccountType?.dropdown && !signupDropdownValue) {
        if (setError) setError('Select a value for the signup dropdown.');
        return;
      }

      const invalidCustomField = (selectedSignupAccountType?.customFields || []).find((field) => {
        const value = customFieldValues[field.id] || '';
        if (!value.trim()) return true;

        if (field.type === 'text') {
          return filterSignupTextValue(value, field.characterTypes) !== value
            || (field.min !== '' && field.min != null && value.length < Number(field.min))
            || (field.max !== '' && field.max != null && value.length > Number(field.max));
        }

        if (field.type === 'number') {
          const numericValue = Number(value);
          return !Number.isFinite(numericValue)
            || (field.min !== '' && field.min != null && numericValue < Number(field.min))
            || (field.max !== '' && field.max != null && numericValue > Number(field.max));
        }

        return false;
      });
      if (invalidCustomField) {
        if (setError) setError(`Complete "${invalidCustomField.label}" with a valid value before signing up.`);
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
        
        const normalizedFirstName = firstName.trim().replace(/\s+/g, ' ');
        const normalizedMiddleInitial = middleInitial.trim().toUpperCase();
        const fullName = `${normalizedFirstName} ${normalizedMiddleInitial}. ${lastName.trim()}`;
        await updateProfile(userCredential.user, {
          displayName: fullName
        });

        // Generate absolute timestamp for timeCreated
        const now = new Date();

        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          name: fullName,
          firstName: normalizedFirstName,
          middleInitial: normalizedMiddleInitial,
          lastName: lastName.trim(),
          accountType: tag,
          role: selectedSignupAccountType?.role || 'requestor',
          studentNumber: selectedSignupAccountType?.dropdown === 'courses' ? studentNumber.trim() : '',
          course: selectedSignupAccountType?.dropdown === 'courses' ? signupDropdownValue : '',
          department: selectedSignupAccountType?.dropdown === 'departments' ? signupDropdownValue : '',
          signupDropdown: selectedSignupAccountType?.dropdown ? {
            id: selectedSignupAccountType.dropdown,
            label: selectedSignupDropdownType?.label || selectedSignupAccountType.dropdown,
            value: signupDropdownValue
          } : null,
          customAttributes: Object.fromEntries([
            ...(selectedSignupAccountType?.dropdown
              ? [[`dropdown:${selectedSignupAccountType.dropdown}`, signupDropdownValue]]
              : []),
            ...(selectedSignupAccountType?.customFields || [])
              .filter((field) => (customFieldValues[field.id] || '').trim())
              .map((field) => [`field:${field.id}`, customFieldValues[field.id].trim()])
          ]),
          customFields: (selectedSignupAccountType?.customFields || [])
            .filter((field) => (customFieldValues[field.id] || '').trim())
            .map((field) => ({
              id: field.id,
              label: field.label,
              value: customFieldValues[field.id].trim()
            })),
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
        setMiddleInitial('');
        setLastName('');
        setTag('');
        setStudentNumber('');
        setSignupDropdownValue('');
        setCustomFieldValues({});
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setShowConfirmPassword(false);
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
  const selectedSignupAccountType = signupOptions.accountTypes.find((accountType) => accountType.value === tag);
  const selectedSignupDropdownType = signupOptions.dropdownTypes.find(
    (dropdown) => dropdown.value === selectedSignupAccountType?.dropdown
  );
  const signupOptionGroups = (selectedSignupAccountType?.options || []).reduce((groups, option) => {
    const groupName = option.group || '';
    let group = groups.find((item) => item.group === groupName);
    if (!group) {
      group = { group: groupName, options: [] };
      groups.push(group);
    }
    group.options.push(option);
    return groups;
  }, []);

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
                            onChange={(e) => setFirstName(e.target.value.replace(/[^A-Za-z ]/g, ''))}
                            maxLength={20}
                            pattern="[A-Za-z ]+"
                            title="Use letters and spaces only."
                            required
                            style={inputStyle}
                          />
                        </div>
                        <div style={{ width: '4.5rem', display: 'flex', flexDirection: 'column' }}>
                          <label style={labelStyle}>MI</label>
                          <input
                            type="text" 
                            placeholder="MI"
                            value={middleInitial}
                            onChange={(e) => setMiddleInitial(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 1))}
                            maxLength={1}
                            pattern="[A-Za-z]"
                            title="Enter one letter."
                            required
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
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

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={labelStyle}>Account Type</label>
                        <select 
                          value={tag} 
                          onChange={(e) => {
                            setTag(e.target.value);
                            setSignupDropdownValue('');
                            setStudentNumber('');
                            setCustomFieldValues({});
                          }}
                          required 
                          style={inputStyle}
                        >
                          <option value="" disabled>e.g. Student</option>
                          {signupOptions.accountTypes.map((accountType) => (
                            <option key={accountType.value} value={accountType.value}>{accountType.label}</option>
                          ))}
                        </select>
                      </div>

                      {(selectedSignupAccountType?.customFields || []).map((field) => (
                        <div key={field.id} style={{ display: 'flex', flexDirection: 'column' }}>
                          <label style={labelStyle}>{field.label}</label>
                          <input
                            type={field.type || 'text'}
                            className={field.type === 'number' ? 'signup-number-input' : undefined}
                            placeholder={`Enter ${field.label}`}
                            min={field.type === 'number' && field.min != null && field.min !== '' ? field.min : undefined}
                            max={field.type === 'number' && field.max != null && field.max !== '' ? field.max : undefined}
                            minLength={field.type === 'text' && field.min != null && field.min !== '' ? Number(field.min) : undefined}
                            maxLength={field.type === 'text' && field.max != null && field.max !== '' ? Number(field.max) : undefined}
                            step={field.type === 'number' ? 'any' : undefined}
                            required
                            value={customFieldValues[field.id] || ''}
                            onChange={(event) => setCustomFieldValues((current) => ({
                              ...current,
                              [field.id]: field.type === 'text'
                                ? filterSignupTextValue(event.target.value, field.characterTypes)
                                : event.target.value
                            }))}
                            style={inputStyle}
                          />
                        </div>
                      ))}

                      {selectedSignupAccountType?.dropdown === 'courses' && (
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
                        </>
                      )}

                      {selectedSignupDropdownType && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <label style={labelStyle}>{selectedSignupDropdownType.label}</label>
                          <select 
                            value={signupDropdownValue}
                            onChange={(e) => setSignupDropdownValue(e.target.value)}
                            required 
                            style={inputStyle}
                            disabled={Boolean(signupOptionsError)}
                          >
                            <option value="" disabled>Select {selectedSignupDropdownType.label}</option>
                            {signupOptionGroups.map((group) => (
                              group.group ? (
                                <optgroup label={group.group} key={group.group}>
                                  {group.options.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </optgroup>
                              ) : group.options.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))
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
                  
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={labelStyle}>Password</label>
                    <div className="password-input-wrap">
                      <input 
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        maxLength={isLogin ? undefined : 30}
                        pattern={isLogin ? undefined : '(?=.*[A-Z])(?=.*[a-z])(?=.*[^A-Za-z0-9\\s]).*'}
                        title={isLogin ? undefined : 'Include an uppercase letter, a lowercase letter, and a symbol.'}
                        required
                        style={{ ...inputStyle, paddingRight: '42px' }}
                      />
                      <button
                        type="button"
                        className="password-visibility-toggle"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                      >
                        <i className={`ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'}`} aria-hidden="true"></i>
                      </button>
                    </div>
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
                      <div className="password-input-wrap">
                        <input 
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Confirm Password" 
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          maxLength={30}
                          required
                          style={{ ...inputStyle, paddingRight: '42px' }}
                        />
                        <button
                          type="button"
                          className="password-visibility-toggle"
                          onClick={() => setShowConfirmPassword((visible) => !visible)}
                          aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                          aria-pressed={showConfirmPassword}
                        >
                          <i className={`ph ${showConfirmPassword ? 'ph-eye-slash' : 'ph-eye'}`} aria-hidden="true"></i>
                        </button>
                      </div>
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

                  <p>By creating an account and using the STI Global City Reservation System, you agree to the following terms and consent to the processing of your personal data in accordance with Republic Act No. 10173 (Data Privacy Act of 2012).</p>

                  <h3>Information collected</h3>
                  <p>The system collects information needed to manage your account and facility reservations, including:</p>
                  <ul style={{ paddingLeft: '24px', margin: '0 0 16px' }}>
                    <li>Your first name, middle initial, last name, email address, account type, and phone number. Your password is handled by Firebase Authentication and is not included in the user profile document created by this app.</li>
                    <li>The account-type-specific dropdown selections and signup fields configured by system administrators. These may include course or program, department or office, student number, or other fields. Configured fields may have input limits or character restrictions.</li>
                    <li>Profile images or banners you choose to upload, and two-factor authentication settings and secret if you choose to enable two-factor authentication.</li>
                    <li>Account records generated by the system, such as your account ID, assigned role, email-verification status, and account creation time.</li>
                    <li>When you submit a reservation: contact details, requestor information, endorser name/designation/email, event name and purpose, participant count, event type, requested dates and times, schedule, facilities or room, equipment and utilities, and air-conditioning requirements when applicable.</li>
                    <li>Reservation records needed to process and track requests, such as reference number, status, timestamps, and approval or modification history.</li>
                    <li>Calendar availability information, including unavailable dates and any administrator-provided remarks used to explain those dates.</li>
                  </ul>

                  <h3>How information is used</h3>
                  <p>Your information is used to create and manage your account, verify your email, determine system access, display and manage your profile, prepare reservation requests, check calendar availability, and allow authorized staff and relevant approvers to review, process, and communicate about reservations. Account-type-specific fields may change as administrators update the signup configuration. Some profile fields can be edited by you; others may be read-only based on their configuration. The system uses Firebase services for authentication and data storage, Cloudinary for profile images or banners you upload, and email for verification and reservation-related communications.</p>

                  <h3>Your responsibilities</h3>
                  <p>Provide accurate information, keep your sign-in credentials private, and use the system only for legitimate facility reservation purposes. Do not use another person’s account or submit information about others unless it is needed for a reservation and you are authorized to provide it.</p>

                  <h3>Access and retention</h3>
                  <p>Account and reservation information may be accessed by authorized system personnel and the relevant reviewers or approvers to perform their duties. Records are retained as needed to operate the reservation system and meet applicable institutional recordkeeping requirements. Contact the system administrator for questions or requests about your information.</p>

                  <p>By checking the agreement box, you confirm that you have read these terms and consent to the collection, processing, and use of your personal information as described above, in compliance with Republic Act No. 10173, for operating the account and reservation system.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}