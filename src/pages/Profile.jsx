import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { deleteUser, reauthenticateWithPopup, reauthenticateWithRedirect } from 'firebase/auth';
import { useSearchParams } from 'react-router-dom';
import { auth, db, microsoftProvider } from '../Firebase'; 
import * as OTPAuth from 'otpauth'; 
import QRCode from 'qrcode'; 
import '../styles/Profile.scss';

const MAX_GIF_SIZE = 10 * 1024 * 1024;

const Profile = ({ currentUserRole }) => {
  const [searchParams] = useSearchParams();
  const requestedProfileId = searchParams.get('userId');
  const normalizedUserRole = (currentUserRole || '').toLowerCase().trim().replace(/_/g, ' ');
  const canViewOtherProfiles = ['mis', 'mis admin', 'building admin', 'super admin'].includes(normalizedUserRole);
  const viewedProfileId = canViewOtherProfiles ? requestedProfileId : '';
  const isViewingOtherProfile = Boolean(viewedProfileId);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [profileLoadError, setProfileLoadError] = useState('');

  const [avatarFile, setAvatarFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);

  // --- GITHUB-STYLE DELETE ACCOUNT STATES ---
  const [deleteStep, setDeleteStep] = useState(0); // 0: closed, 1: warning, 2: confirmation
  const [deleteVerification, setDeleteVerification] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // --- 2FA STATES ---
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [pendingSecret, setPendingSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');

  const [expandedImage, setExpandedImage] = useState(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    officeLocation: '',
    department: '',
    phone: '',
    role: '',
    status: 'Active',
    dateJoined: '',
    avatarUrl: '',
    bannerUrl: ''
  });
  const isSuperAdminProfile = formData.role.toLowerCase().trim().replace(/_/g, ' ') === 'super admin';
            
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setProfileLoadError('');

        if (!viewedProfileId && localStorage.getItem('pendingAccountDeletion') === 'true') {
          localStorage.removeItem('pendingAccountDeletion'); 
          try {
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, { status: 'Inactive', lastActive: new Date().toISOString() });
            await deleteDoc(userDocRef);
            await deleteUser(user);
            window.location.href = '/'; 
            return; 
          } catch (e) {
            console.error("Failed to finish deletion after redirect:", e);
          }
        }

        try {
          const docRef = doc(db, 'users', viewedProfileId || user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const isHiddenSuperAdmin = (data.role || '').toLowerCase().trim().replace(/_/g, ' ') === 'super admin'
              && docSnap.id !== user.uid;
            if (isHiddenSuperAdmin) {
              setProfileLoadError('This user profile could not be found.');
              return;
            }
            const fullName = data.name || '';
            
            let parsedLastName = '';
            let parsedFirstName = '';

            if (fullName.includes(',')) {
              const nameParts = fullName.split(',');
              parsedLastName = nameParts[0].trim(); 
              parsedFirstName = (nameParts[1] || '').replace(/\s*\(.*\)$/, '').trim(); 
            } else {
              parsedFirstName = fullName; 
            }

            let joinedDate = data.dateJoined;
            if (!joinedDate && !viewedProfileId && user.metadata?.creationTime) {
              const d = new Date(user.metadata.creationTime);
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const year = d.getFullYear();
              joinedDate = `${month}/${day}/${year}`;
            }

            setFormData(prev => ({
              ...prev,
              firstName: parsedFirstName,
              lastName: parsedLastName,
              email: data.email || (viewedProfileId ? '' : user.email || ''),
              role: data.role ? data.role.toUpperCase() : '',
              status: data.status || 'Active',
              dateJoined: joinedDate || 'N/A', 
              officeLocation: data.officeLocation || '',
              department: data.department || '',
              phone: data.phone || '',
              avatarUrl: data.avatarUrl || '',
              bannerUrl: data.bannerUrl || ''
            }));

            // Set 2FA status from DB (Treat as enabled unless explicitly false)
            setIs2FAEnabled(data.twoFactorEnabled !== false);
            
          } else {
            setProfileLoadError('This user profile could not be found.');
          }
        } catch (error) {
          console.error("Error fetching profile data:", error);
          setProfileLoadError('Could not load this profile. Please try again.');
        }
      }
    });

    return () => unsubscribe(); 
  }, [viewedProfileId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const sanitizedValue = name === 'phone' ? value.replace(/[^0-9]/g, '').slice(0, 11) : value;
    setFormData(prev => ({ ...prev, [name]: sanitizedValue }));
  };

  const handleImageChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if ((file.type === 'image/gif' || /\.gif$/i.test(file.name)) && file.size > MAX_GIF_SIZE) {
      setSaveError('GIF files must be 50 MB or smaller.');
      e.target.value = '';
      return;
    }

    setSaveError('');
    const previewUrl = URL.createObjectURL(file);

    if (type === 'avatar') {
      setAvatarFile(file);
      setAvatarPreview(previewUrl);
    } else if (type === 'banner') {
      setBannerFile(file);
      setBannerPreview(previewUrl);
    }
  };

  const toggleEditMode = () => {
    setIsEditing(!isEditing);
    setSaveSuccess(false); 
    setSaveError('');
    
    if (isEditing) {
      setAvatarPreview(null);
      setBannerPreview(null);
      setAvatarFile(null);
      setBannerFile(null);
    }
  };

  const handleSave = async () => {
    if (!isEditing) return;
    
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError('');

    try {
      const user = auth.currentUser;
      
      if (user) {
        let updatedAvatarUrl = formData.avatarUrl;
        let updatedBannerUrl = formData.bannerUrl;

        const uploadToCloudinary = async (file) => {
          const data = new FormData();
          data.append('file', file);
          data.append('upload_preset', 'osmsg1ns'); 
          
          const res = await fetch('https://api.cloudinary.com/v1_1/a2hopaxe/image/upload', {
            method: 'POST',
            body: data
          });
          
          const uploadedImage = await res.json();
          if (!res.ok || !uploadedImage.secure_url) {
            throw new Error(
              uploadedImage.error?.message || 'Cloudinary could not upload this image. Check the file format, size, or upload preset.'
            );
          }
          return uploadedImage.secure_url;
        };

        if (avatarFile) {
          updatedAvatarUrl = await uploadToCloudinary(avatarFile);
        }

        if (bannerFile) {
          updatedBannerUrl = await uploadToCloudinary(bannerFile);
        }

        const userDocRef = doc(db, 'users', user.uid);
        
        await updateDoc(userDocRef, {
          phone: formData.phone,
          officeLocation: formData.officeLocation,
          department: formData.department,
          avatarUrl: updatedAvatarUrl,
          bannerUrl: updatedBannerUrl
        });

        setFormData(prev => ({
          ...prev,
          avatarUrl: updatedAvatarUrl,
          bannerUrl: updatedBannerUrl
        }));

        setAvatarFile(null);
        setBannerFile(null);
        setSaveSuccess(true);
        setIsEditing(false); 

        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (error) {
      console.error("Error saving profile data:", error);
      setSaveError(error.message || 'Could not save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- 2FA OPT-OUT / ENABLE HANDLERS ---
  const handleInitiate2FA = async () => {
    if (is2FAEnabled) {
      if (window.confirm('Are you sure you want to disable Two-Factor Authentication? It is recommended to keep this enabled.')) {
        try {
          const userDocRef = doc(db, 'users', auth.currentUser.uid);
          await updateDoc(userDocRef, {
            twoFactorEnabled: false,
            twoFactorSecret: null
          });
          setIs2FAEnabled(false);
          alert('2FA has been disabled.');
        } catch (err) {
          console.error('Failed to disable 2FA', err);
          alert('Failed to disable 2FA.');
        }
      }
    } else {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      setPendingSecret(secret);

      const totp = new OTPAuth.TOTP({
        issuer: 'FacilityRes',
        label: formData.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: secret
      });

      const uri = totp.toString();
      
      try {
        const qrUrl = await QRCode.toDataURL(uri);
        setQrCodeDataUrl(qrUrl);
        setShow2FAModal(true);
      } catch (err) {
        console.error('QR Code generation failed', err);
        alert('Failed to generate QR Code.');
      }
    }
  };

  const handleVerifySetup2FA = async () => {
    setTwoFactorError('');
    const totp = new OTPAuth.TOTP({
      issuer: 'FacilityRes',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: pendingSecret
    });

    const delta = totp.validate({ token: verificationCode, window: 1 });

    if (delta !== null) {
      try {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userDocRef, {
          twoFactorEnabled: true,
          twoFactorSecret: pendingSecret
        });
        setIs2FAEnabled(true);
        setShow2FAModal(false);
        setVerificationCode('');
        alert('Two-Factor Authentication is now enabled!');
      } catch (err) {
        setTwoFactorError('Failed to save settings to database.');
      }
    } else {
      setTwoFactorError('Invalid code. Please try again.');
    }
  };

  // --- GITHUB-STYLE DELETE HANDLERS ---
  const closeDeleteModal = () => {
    setDeleteStep(0);
    setDeleteVerification('');
  };

  const handleDeleteAccount = async () => {
    if (deleteVerification !== 'delete my account') return;
    setIsDeleting(true);
    
    try {
      const user = auth.currentUser;
      if (user) {
        try {
          if (window.location.hostname === 'localhost') {
            await reauthenticateWithPopup(user, microsoftProvider);
          } else {
            localStorage.setItem('pendingAccountDeletion', 'true');
            await reauthenticateWithRedirect(user, microsoftProvider);
            return; 
          }
        } catch (reauthError) {
          console.error("Re-authentication failed:", reauthError);
          alert("We could not verify your identity. Account deletion cancelled.");
          setIsDeleting(false);
          closeDeleteModal();
          return; 
        }

        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { status: 'Inactive', lastActive: new Date().toISOString() });
        
        await deleteDoc(userDocRef);
        await deleteUser(user);
        window.location.href = '/'; 
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("An error occurred while deleting your account.");
    } finally {
      setIsDeleting(false);
      closeDeleteModal();
    }
  };

  return (
    <div className="profile-container">
      {profileLoadError && <p className="profile-save-error" role="alert">{profileLoadError}</p>}
      
      <div className="profile-hero">
        <div 
          className="banner-bg" 
          onClick={() => {
            if (!isEditing && (bannerPreview || formData.bannerUrl)) {
              setExpandedImage(bannerPreview || formData.bannerUrl);
            }
          }}
          style={{ 
            backgroundImage: bannerPreview 
              ? `url(${bannerPreview})` 
              : formData.bannerUrl 
                ? `url(${formData.bannerUrl})` 
                : 'linear-gradient(135deg, #475569 0%, #1E293B 100%)'
          }}
        >
          {isEditing && (
            <label className="edit-overlay banner-overlay">
              <input type="file" accept="image/*,.gif" onChange={(e) => handleImageChange(e, 'banner')} hidden />
              <i className="ph-fill ph-camera"></i> Change Cover
            </label>
          )}
        </div>
        
        <div className="profile-header-content">
          <div className="profile-identity">
            <div className="avatar-container">
              <img 
                onClick={() => {
                  if (!isEditing) {
                    setExpandedImage(
                      avatarPreview || 
                      formData.avatarUrl || 
                      `https://ui-avatars.com/api/?name=${formData.firstName || 'User'}+${formData.lastName || ''}&background=1E293B&color=fff&size=120`
                    );
                  }
                }}
                src={
                  avatarPreview || 
                  formData.avatarUrl || 
                  `https://ui-avatars.com/api/?name=${formData.firstName || 'User'}+${formData.lastName || ''}&background=1E293B&color=fff&size=120`
                } 
                alt="Avatar" 
              />
              {isEditing && (
                <label className="edit-overlay avatar-overlay">
                  <input type="file" accept="image/*,.gif" onChange={(e) => handleImageChange(e, 'avatar')} hidden />
                  <i className="ph-fill ph-camera"></i>
                </label>
              )}
              <div 
                className={`status-indicator ${formData.status === 'Active' ? 'status-active' : 'status-inactive'}`}
                title={formData.status}
              ></div> 
            </div>
            
            <div className="user-titles">
              <div className="name-row">
                <h2>{formData.firstName || 'Your'} {formData.lastName || 'Name'}</h2>
                <span className="role-badge">{formData.role || 'Role'}</span>
              </div>
            </div>
          </div>

          {!isViewingOtherProfile && (
            <div className="profile-actions">
              <button className="btn-edit" onClick={toggleEditMode}>
                <i className={isEditing ? "ph ph-x" : "ph ph-pencil-simple"}></i>
                {isEditing ? "Cancel Editing" : "Edit Profile"}
              </button>
              <button
                className={isEditing ? "btn-update-primary" : "btn-save"}
                onClick={handleSave}
                disabled={!isEditing || isSaving}
              >
                {isSaving ? (
                  <><i className="ph ph-spinner"></i> Saving...</>
                ) : saveSuccess ? (
                  <><i className="ph ph-check-circle"></i> Saved!</>
                ) : (
                  <><i className="ph ph-floppy-disk"></i> Save Changes</>
                )}
              </button>
              {saveError && <p className="profile-save-error" role="alert">{saveError}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="profile-content-grid">
        
        <div className="profile-main-forms">
          <div className="form-section card-style">
            <div className="section-title">
              <div className="icon-wrap bg-blue-soft"><i className="ph-fill ph-user"></i></div>
              <h3>Personal Information</h3>
            </div>
            
            <div className="form-grid">
              <div className="input-group">
                <label>FIRST NAME</label>
                <input type="text" name="firstName" value={formData.firstName} readOnly className="profile-readonly-input" />
              </div>
              <div className="input-group">
                <label>LAST NAME</label>
                <input type="text" name="lastName" value={formData.lastName} readOnly className="profile-readonly-input" />
              </div>
              {!isSuperAdminProfile && (
                <div className="input-group full-width">
                  <label>EMAIL</label>
                  <input type="email" name="email" value={formData.email} readOnly className="profile-readonly-input" />
                </div>
              )}
              <div className="input-group">
                <label>ROLE</label>
                <input type="text" name="role" value={formData.role} readOnly className="profile-readonly-input" />
              </div>
              <div className="input-group">
                <label>DATE JOINED</label>
                <input type="text" name="dateJoined" value={formData.dateJoined} readOnly className="profile-readonly-input" />
              </div>
              <div className="input-group">
                <label>PHONE NUMBER</label>
                <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} maxLength={11} readOnly={!isEditing} placeholder="09XX XXX XXXX" className={`profile-dynamic-input ${isEditing ? 'editing' : ''}`} />
              </div>
              {formData.role?.toLowerCase() !== 'requestor' && (
                <div className="input-group">
                  <label>OFFICE LOCATION</label>
                  <input type="text" name="officeLocation" value={formData.officeLocation} onChange={handleInputChange} readOnly={!isEditing} placeholder="e.g. Floor A, Room 102" className={`profile-dynamic-input ${isEditing ? 'editing' : ''}`} />
                </div>
              )}
              {formData.role?.toLowerCase() === 'endorser' && (
                <div className="input-group">
                  <label>DEPARTMENT</label>
                  <input type="text" name="department" value={formData.department} onChange={handleInputChange} readOnly={!isEditing} placeholder="e.g. SHS, MIS" className={`profile-dynamic-input ${isEditing ? 'editing' : ''}`} />
                </div>
              )}
            </div>
          </div>
        </div>

        {!isViewingOtherProfile && (
          <div className="profile-sidebar">
            
            {/* OPT-IN/OUT SECURITY ZONE */}
            <div className="side-panel card-style security-zone">
              <div className="section-title">
                <div className="icon-wrap bg-indigo-soft"><i className="ph-fill ph-shield-check"></i></div>
                <h3>Security</h3>
              </div>
              <p className="security-desc">
                Protect your account by requiring a code from an authenticator app when you log in.
              </p>
              <div className="two-factor-controls">
                <div className="two-factor-status">
                  <strong className="two-factor-label">Two-Factor Auth</strong>
                  <span className={`two-factor-indicator ${is2FAEnabled ? 'enabled' : 'disabled'}`}>
                    {is2FAEnabled ? '● Enabled' : '○ Disabled'}
                  </span>
                </div>
                <button 
                  className={`btn-two-factor ${is2FAEnabled ? 'active' : ''}`}
                  onClick={handleInitiate2FA}
                >
                  {is2FAEnabled ? 'Disable' : 'Enable 2FA'}
                </button>
              </div>
            </div>

            {/* GITHUB STYLE DANGER ZONE */}
            <div className="side-panel card-style danger-zone">
              <div className="section-title">
                <div className="icon-wrap danger-icon-wrap"><i className="ph-fill ph-warning"></i></div>
                <h3 className="danger-title">Danger Zone</h3>
              </div>
              
              <div className="danger-zone-box">
                <div className="danger-item">
                  <div className="danger-text">
                    <strong>Delete this account</strong>
                    <p>Once you delete an account, there is no going back. Please be certain.</p>
                  </div>
                  <button className="btn-outline-danger" onClick={() => setDeleteStep(1)}>
                    Delete Account
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* 2FA SETUP MODAL */}
        {show2FAModal && (
          <div className="modal-overlay">
            <div className="modal-content text-center two-factor-setup-modal">
              <h3>Setup Authenticator</h3>
              <p className="setup-desc">
                Scan this QR code, or manually enter the setup key into your authenticator app.
              </p>
              
              {qrCodeDataUrl && (
                <div className="qr-code-wrapper">
                  <img src={qrCodeDataUrl} alt="2FA QR Code" />
                </div>
              )}

              {/* Manual Setup Key Display */}
              <div className="manual-key-wrapper">
                <span className="manual-key-label">Setup Key</span>
                <div className="manual-key-action">
                  <code>{pendingSecret}</code>
                  <button 
                    onClick={() => navigator.clipboard.writeText(pendingSecret)}
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <input 
                type="text" 
                className="two-factor-input"
                maxLength={6}
                placeholder="000000" 
                value={verificationCode} 
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              />

              {twoFactorError && <div className="two-factor-error">{twoFactorError}</div>}

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => { setShow2FAModal(false); setVerificationCode(''); setTwoFactorError(''); }}>Cancel</button>
                <button className="btn-verify" disabled={verificationCode.length !== 6} onClick={handleVerifySetup2FA}>
                  Verify & Enable
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GITHUB STYLE DELETE MODALS */}
        {deleteStep > 0 && (
          <div className="modal-overlay">
            <div className="modal-content github-delete-modal">
              <div className="modal-header">
                <h3>Delete Account</h3>
                <button className="close-btn" onClick={closeDeleteModal}>
                  <i className="ph ph-x"></i>
                </button>
              </div>

              {deleteStep === 1 && (
                <div className="delete-step-1">
                  <ul className="consequence-list">
                    <li>This will permanently delete your account and profile information.</li>
                  </ul>
                  <button className="btn-danger-full" onClick={() => setDeleteStep(2)}>
                    I have read and understand these effects
                  </button>
                </div>
              )}

              {deleteStep === 2 && (
                <div className="delete-step-2">
                  <p className="verify-instructions">
                    To confirm, type "<strong>delete my account</strong>" in the box below
                  </p>
                  <input 
                    type="text" 
                    value={deleteVerification} 
                    onChange={(e) => setDeleteVerification(e.target.value)} 
                    autoFocus
                  />
                  <button 
                    className="btn-danger-full" 
                    disabled={deleteVerification !== 'delete my account' || isDeleting} 
                    onClick={handleDeleteAccount}
                  >
                    {isDeleting ? "Deleting..." : "Delete Account"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* IMAGE EXPANSION MODAL */}
        {expandedImage && (
          <div className="modal-overlay" onClick={() => setExpandedImage(null)}>
            <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="btn-close-image" onClick={() => setExpandedImage(null)}>
                <i className="ph ph-x"></i>
              </button>
              <img src={expandedImage} alt="Expanded Fullscreen" />
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
};

export default Profile;