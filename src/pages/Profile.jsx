import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'; 
import { useSearchParams } from 'react-router-dom';
import { auth, db } from '../Firebase'; 
import { clearAccountStorage, clearBrowserCaches, LOGOUT_EVENT_KEY } from '../services/browserSession';
import {
  DEFAULT_ACCOUNT_TYPES,
  DEFAULT_COURSE_OPTIONS,
  DEFAULT_DEPARTMENT_OPTIONS,
  DEFAULT_SIGNUP_DROPDOWNS,
  filterSignupTextValue,
  normalizeAccountTypes,
  normalizeSignupDropdowns
} from '../services/signupOptions';
import * as OTPAuth from 'otpauth'; 
import QRCode from 'qrcode'; 
import '../styles/Profile.scss';

const MAX_GIF_SIZE = 10 * 1024 * 1024;

const normalizePhoneNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('09')) return digits.slice(0, 11);
  if (digits.startsWith('639')) return `0${digits.slice(2, 12)}`;
  if (digits.startsWith('9')) return `0${digits.slice(0, 10)}`;
  return digits ? `09${digits.slice(-9)}` : '09';
};

const Profile = ({ currentUserRole }) => {
  const [searchParams] = useSearchParams();
  const requestedProfileId = searchParams.get('userId');
  const normalizedUserRole = (currentUserRole || '').toLowerCase().trim().replace(/_/g, ' ');
  const canViewOtherProfiles = ['mis', 'mis admin', 'building admin', 'super admin'].includes(normalizedUserRole);
  const viewedProfileId = canViewOtherProfiles ? requestedProfileId : '';
  const isViewingOtherProfile = Boolean(viewedProfileId);
  
  // --- DETERMINE TARGET COLLECTION ---
  const myCollection = normalizedUserRole === 'super admin' ? 'super_users' : 'users';
  const fetchCollection = viewedProfileId ? 'users' : myCollection;

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [profileLoadError, setProfileLoadError] = useState('');
  const [signupConfiguration, setSignupConfiguration] = useState({
    accountTypes: normalizeAccountTypes(DEFAULT_ACCOUNT_TYPES),
    dropdownTypes: DEFAULT_SIGNUP_DROPDOWNS
  });

  const [avatarFile, setAvatarFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);

  const [deleteStep, setDeleteStep] = useState(0); 
  const [deleteVerification, setDeleteVerification] = useState('');
  const [deletePassword, setDeletePassword] = useState(''); 
  const [isDeleting, setIsDeleting] = useState(false);

  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [pendingSecret, setPendingSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupHasError, setBackupHasError] = useState(false);

  const [expandedImage, setExpandedImage] = useState(null);

  const [formData, setFormData] = useState({
    firstName: '',
    middleInitial: '',
    lastName: '',
    email: '',
    accountType: '',
    studentNumber: '',
    course: '',
    department: '',
    signupAttributes: {},
    phone: '',
    role: '',
    status: 'Offline',
    dateJoined: '',
    avatarUrl: '',
    bannerUrl: ''
  });
  
  const isSuperAdminProfile = formData.role.toLowerCase().trim().replace(/_/g, ' ') === 'super admin';
  const selectedSignupAccountType = signupConfiguration.accountTypes.find(
    (accountType) => accountType.value === formData.accountType
  );
  const selectedSignupDropdownType = signupConfiguration.dropdownTypes.find(
    (dropdown) => dropdown.value === selectedSignupAccountType?.dropdown
  );
            
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setProfileLoadError('');

        if (!viewedProfileId && localStorage.getItem('pendingAccountDeletion') === 'true') {
          localStorage.removeItem('pendingAccountDeletion'); 
          try {
            const userDocRef = doc(db, myCollection, user.uid);
            await updateDoc(userDocRef, { status: 'Offline', lastActive: new Date().toISOString() });
            await deleteDoc(userDocRef);
            await deleteUser(user);
            localStorage.setItem(LOGOUT_EVENT_KEY, crypto.randomUUID());
            clearAccountStorage();
            await clearBrowserCaches();
            window.location.href = '/'; 
            return; 
          } catch (e) {
            console.error("Failed to finish deletion after redirect:", e);
          }
        }

        try {
          // --- FIX: Querying the correct collection ---
          const docRef = doc(db, fetchCollection, viewedProfileId || user.uid);
          const [docSnap, signupOptionsSnap] = await Promise.all([
            getDoc(docRef),
            getDoc(doc(db, 'app_settings', 'signupOptions'))
          ]);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const signupOptionsData = signupOptionsSnap.data() || {};
            const courses = Array.isArray(signupOptionsData.courses)
              ? signupOptionsData.courses
              : DEFAULT_COURSE_OPTIONS;
            const departments = Array.isArray(signupOptionsData.departments)
              ? signupOptionsData.departments
              : DEFAULT_DEPARTMENT_OPTIONS;
            const accountTypes = normalizeAccountTypes(
              Array.isArray(signupOptionsData.accountTypes)
                ? signupOptionsData.accountTypes
                : DEFAULT_ACCOUNT_TYPES,
              courses,
              departments
            );
            setSignupConfiguration({
              accountTypes,
              dropdownTypes: normalizeSignupDropdowns(
                signupOptionsData.dropdownTypes,
                accountTypes
              )
            });
            const configuredAccountType = accountTypes.find(
              (type) => type.value === data.accountType
            );
            const storedAttributes = data.customAttributes || {};
            const legacyCustomFields = Array.isArray(data.customFields) ? data.customFields : [];
            const signupAttributes = {};
            if (configuredAccountType?.dropdown) {
              const dropdownKey = `dropdown:${configuredAccountType.dropdown}`;
              signupAttributes[dropdownKey] = storedAttributes[dropdownKey]
                ?? (data.signupDropdown?.id === configuredAccountType.dropdown
                  ? data.signupDropdown.value
                  : configuredAccountType.dropdown === 'courses'
                    ? data.course || ''
                    : configuredAccountType.dropdown === 'departments'
                      ? data.department || ''
                      : '');
            }
            (configuredAccountType?.customFields || []).forEach((field) => {
              const fieldKey = `field:${field.id}`;
              const legacyField = legacyCustomFields.find((item) => item.id === field.id);
              signupAttributes[fieldKey] = storedAttributes[fieldKey]
                ?? legacyField?.value
                ?? '';
            });
            const isHiddenSuperAdmin = (data.role || '').toLowerCase().trim().replace(/_/g, ' ') === 'super admin'
              && docSnap.id !== user.uid;
            
            if (isHiddenSuperAdmin) {
              setProfileLoadError('This user profile could not be found.');
              return;
            }
            
            // Fallback for manually created Super Admins
            const fullName = data.name || (normalizedUserRole === 'super admin' && !viewedProfileId ? 'Super Admin' : '');
            
            let parsedLastName = '';
            let parsedFirstName = '';

            if (data.firstName || data.lastName) {
              parsedFirstName = data.firstName || '';
              parsedLastName = data.lastName || '';
            } else if (fullName.includes(',')) {
              const nameParts = fullName.split(',');
              parsedLastName = nameParts[0].trim(); 
              parsedFirstName = (nameParts[1] || '').replace(/\s*\(.*\)$/, '').trim(); 
            } else {
              const nameParts = fullName.trim().split(/\s+/);
              parsedFirstName = nameParts.shift() || '';
              parsedLastName = nameParts.join(' ');
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
              middleInitial: data.middleInitial || '',
              lastName: parsedLastName,
              email: data.email || (viewedProfileId ? '' : user.email || ''),
              accountType: data.accountType || '',
              studentNumber: data.studentNumber || '',
              course: data.course || '',
              signupAttributes,
              role: data.role
                ? data.role.toUpperCase()
                : normalizedUserRole === 'super admin'
                  ? 'SUPER ADMIN'
                  : data.accountType === 'Faculty'
                    ? 'ENDORSER'
                    : 'REQUESTOR',
              status: data.status || 'Active',
              dateJoined: joinedDate || 'N/A', 
              department: data.department || '',
              phone: normalizePhoneNumber(data.phone),
              avatarUrl: data.avatarUrl || '',
              bannerUrl: data.bannerUrl || ''
            }));

            setIs2FAEnabled(data.twoFactorEnabled === true);
            
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
  }, [viewedProfileId, fetchCollection, myCollection, normalizedUserRole]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let sanitizedValue = value;
    if (name === 'phone') {
      const digits = value.replace(/\D/g, '');
      const nationalDigits = digits.startsWith('09') ? digits.slice(2) : digits;
      sanitizedValue = `09${nationalDigits.slice(0, 9)}`;
    }
    setFormData(prev => ({ ...prev, [name]: sanitizedValue }));
  };

  const handleSignupAttributeChange = (key, value, field) => {
    const sanitizedValue = field?.type === 'text'
      ? filterSignupTextValue(value, field.characterTypes)
      : value;
    setFormData((previous) => ({
      ...previous,
      signupAttributes: {
        ...previous.signupAttributes,
        [key]: sanitizedValue
      }
    }));
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

    if (selectedSignupAccountType?.dropdown
      && selectedSignupDropdownType?.editableOnProfile !== false
      && !formData.signupAttributes[`dropdown:${selectedSignupAccountType.dropdown}`]) {
      setSaveError(`Select a value for ${selectedSignupDropdownType?.label || 'the signup dropdown'}.`);
      return;
    }
    if (selectedSignupAccountType?.dropdown === 'courses' && !/^[0-9]{11}$/.test(formData.studentNumber)) {
      setSaveError('Student number must contain exactly 11 digits.');
      return;
    }
    const invalidCustomField = (selectedSignupAccountType?.customFields || [])
      .filter((field) => field.editableOnProfile !== false)
      .find((field) => {
      const value = formData.signupAttributes[`field:${field.id}`] || '';
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
      if (field.type === 'email') {
        return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      }
      return false;
    });
    if (invalidCustomField) {
      setSaveError(`Complete "${invalidCustomField.label}" with a valid value before saving.`);
      return;
    }
    if (!selectedSignupAccountType && !formData.studentNumber.trim()
      && ['student', 'student leader'].includes(formData.accountType.toLowerCase())) {
      setSaveError('Enter your student number.');
      return;
    }

    if (!/^09\d{9}$/.test(formData.phone) && formData.phone !== '09') {
      setSaveError('Enter a complete 11-digit phone number starting with 09.');
      return;
    }
    
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

        // --- FIX: Saving to the correct collection ---
        const userDocRef = doc(db, myCollection, user.uid);
        const customAttributes = Object.fromEntries([
          ...(selectedSignupAccountType?.dropdown
            ? [[
              `dropdown:${selectedSignupAccountType.dropdown}`,
              formData.signupAttributes[`dropdown:${selectedSignupAccountType.dropdown}`] || ''
            ]]
            : []),
          ...(selectedSignupAccountType?.customFields || []).map((field) => [
            `field:${field.id}`,
            formData.signupAttributes[`field:${field.id}`]?.trim() || ''
          ])
        ]);
        const dropdownValue = selectedSignupAccountType?.dropdown
          ? formData.signupAttributes[`dropdown:${selectedSignupAccountType.dropdown}`] || ''
          : '';

        await updateDoc(userDocRef, {
          accountType: formData.accountType,
          studentNumber: selectedSignupAccountType?.dropdown === 'courses' ? formData.studentNumber.trim() : '',
          course: selectedSignupAccountType?.dropdown === 'courses' ? dropdownValue : '',
          phone: formData.phone,
          department: selectedSignupAccountType?.dropdown === 'departments' ? dropdownValue : '',
          signupDropdown: selectedSignupAccountType?.dropdown ? {
            id: selectedSignupAccountType.dropdown,
            label: selectedSignupDropdownType?.label || selectedSignupAccountType.dropdown,
            value: dropdownValue
          } : null,
          customAttributes,
          customFields: (selectedSignupAccountType?.customFields || []).map((field) => ({
            id: field.id,
            label: field.label,
            value: formData.signupAttributes[`field:${field.id}`]?.trim() || ''
          })),
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

  const handleInitiate2FA = async () => {
    if (is2FAEnabled) {
      if (window.confirm('Are you sure you want to disable Two-Factor Authentication? It is recommended to keep this enabled.')) {
        try {
          // --- FIX: Updating 2FA on correct collection ---
          const userDocRef = doc(db, myCollection, auth.currentUser.uid);
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
        // --- FIX: Updating 2FA on correct collection ---
        const userDocRef = doc(db, myCollection, auth.currentUser.uid);
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

  const handleDownloadBackup = async () => {
    if (normalizedUserRole !== 'super admin' || isCreatingBackup) return;

    const collectionsToBackup = [
      'archive',
      'reservations',
      'users',
      'super_users',
      'facilities',
      'equipments',
      'utilities',
      'app_settings'
    ];

    try {
      setIsCreatingBackup(true);
      setBackupMessage('');
      setBackupHasError(false);
      const snapshots = await Promise.all(
        collectionsToBackup.map((collectionName) => getDocs(collection(db, collectionName)))
      );
      const collections = Object.fromEntries(collectionsToBackup.map((collectionName, index) => [
        collectionName,
        snapshots[index].docs.map((backupDoc) => ({
          id: backupDoc.id,
          ...backupDoc.data()
        }))
      ]));
      const backupData = {
        createdAt: new Date().toISOString(),
        collections
      };
      const dateString = new Date().toISOString().split('T')[0];
      const backupBlob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: 'application/json'
      });
      const downloadUrl = URL.createObjectURL(backupBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = `firestore_backup_${dateString}.json`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setBackupMessage('Backup downloaded successfully.');
    } catch (error) {
      console.error('Failed to create Firestore backup:', error);
      setBackupHasError(true);
      setBackupMessage('Backup failed. Check Firestore access and try again.');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const closeDeleteModal = () => {
    setDeleteStep(0);
    setDeleteVerification('');
    setDeletePassword(''); 
  };

  const handleDeleteAccount = async () => {
    if (deleteVerification !== 'delete my account') return;
    setIsDeleting(true);
    
    try {
      const user = auth.currentUser;
      if (user) {
        try {
          const credential = EmailAuthProvider.credential(user.email, deletePassword);
          await reauthenticateWithCredential(user, credential);
        } catch (reauthError) {
          console.error("Re-authentication failed:", reauthError);
          alert("Incorrect password. We could not verify your identity. Account deletion cancelled.");
          setIsDeleting(false);
          closeDeleteModal();
          return; 
        }
        
        const userDocRef = doc(db, myCollection, user.uid);
        
        await updateDoc(userDocRef, { status: 'Offline', lastActive: new Date().toISOString() });
        
        await deleteDoc(userDocRef);
        await deleteUser(user);
        localStorage.setItem(LOGOUT_EVENT_KEY, crypto.randomUUID());
        clearAccountStorage();
        await clearBrowserCaches();
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
      
      {!profileLoadError && (
      <>
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
                className={`status-indicator ${['online', 'active'].includes(formData.status.toLowerCase()) ? 'status-active' : 'status-inactive'}`}
                title={formData.status}
              ></div> 
            </div>
            
            <div className="user-titles">
              <div className="name-row">
                <h2>
                  {[formData.firstName || 'Your', formData.middleInitial ? `${formData.middleInitial}.` : '', formData.lastName || 'Name']
                    .filter(Boolean)
                    .join(' ')}
                </h2>
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
                <label>MI</label>
                <input type="text" name="middleInitial" value={formData.middleInitial} readOnly className="profile-readonly-input" />
              </div>
              <div className="input-group">
                <label>LAST NAME</label>
                <input type="text" name="lastName" value={formData.lastName} readOnly className="profile-readonly-input" />
              </div>
              <div className="input-group">
                <label>ACCOUNT TYPE</label>
                <input
                  type="text"
                  name="accountType"
                  value={formData.accountType || 'N/A'}
                  readOnly
                  className="profile-readonly-input"
                />
              </div>
              {selectedSignupAccountType?.dropdown && (
                <div className="input-group">
                  <label>{(selectedSignupDropdownType?.label || selectedSignupAccountType.dropdown).toUpperCase()}</label>
                  <select
                    value={formData.signupAttributes[`dropdown:${selectedSignupAccountType.dropdown}`] || ''}
                    onChange={(event) => handleSignupAttributeChange(
                      `dropdown:${selectedSignupAccountType.dropdown}`,
                      event.target.value
                    )}
                    disabled={!isEditing || selectedSignupDropdownType?.editableOnProfile === false}
                    required={isEditing && selectedSignupDropdownType?.editableOnProfile !== false}
                    className={`profile-dynamic-input ${isEditing && selectedSignupDropdownType?.editableOnProfile !== false ? 'editing' : 'profile-readonly-select'}`}
                  >
                    <option value="" disabled>Select {selectedSignupDropdownType?.label || 'an option'}</option>
                    {(selectedSignupAccountType.options || []).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {selectedSignupAccountType?.dropdown === 'courses' && (
                <div className="input-group">
                  <label>STUDENT NUMBER</label>
                  <input
                    type="text"
                    name="studentNumber"
                    value={formData.studentNumber}
                    onChange={handleInputChange}
                    readOnly={!isEditing}
                    required={isEditing}
                    className={`profile-dynamic-input ${isEditing ? 'editing' : ''}`}
                  />
                </div>
              )}
              {(selectedSignupAccountType?.customFields || []).map((field) => {
                const fieldKey = `field:${field.id}`;
                return (
                  <div className="input-group" key={field.id}>
                    <label>{field.label.toUpperCase()}</label>
                    <input
                      type={field.type || 'text'}
                      name={fieldKey}
                      value={formData.signupAttributes[fieldKey] || ''}
                      onChange={(event) => handleSignupAttributeChange(fieldKey, event.target.value, field)}
                      readOnly={!isEditing || field.editableOnProfile === false}
                      required={isEditing && field.editableOnProfile !== false}
                      min={field.type === 'number' && field.min != null && field.min !== '' ? field.min : undefined}
                      max={field.type === 'number' && field.max != null && field.max !== '' ? field.max : undefined}
                      minLength={field.type === 'text' && field.min != null && field.min !== '' ? Number(field.min) : undefined}
                      maxLength={field.type === 'text' && field.max != null && field.max !== '' ? Number(field.max) : undefined}
                      className={`profile-dynamic-input ${isEditing && field.editableOnProfile !== false ? 'editing' : ''}`}
                    />
                  </div>
                );
              })}
              <div className="input-group">
                <label>PHONE NUMBER</label>
                {isEditing ? (
                  <div className="profile-phone-input">
                    <span aria-hidden="true">09</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      name="phone"
                      value={formData.phone.slice(2)}
                      onChange={handleInputChange}
                      maxLength={9}
                      aria-label="Phone number, remaining 9 digits after 09"
                      placeholder="XXX XXX XXX"
                      className="profile-dynamic-input editing"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    readOnly
                    placeholder="09XX XXX XXXX"
                    className="profile-dynamic-input"
                  />
                )}
                {isEditing && saveError && !/^09\d{9}$/.test(formData.phone) && formData.phone !== '09' && (
                  <span className="profile-phone-error">{saveError}</span>
                )}
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
            </div>
          </div>
        </div>

        {!isViewingOtherProfile && (
          <div className="profile-sidebar">
            
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
              {normalizedUserRole === 'super admin' && (
                <div className="profile-backup-controls">
                  <p>Download a JSON backup of the application’s Firestore collections.</p>
                  <button
                    type="button"
                    className="btn-profile-backup"
                    onClick={handleDownloadBackup}
                    disabled={isCreatingBackup}
                  >
                    <i className={`ph ${isCreatingBackup ? 'ph-spinner-gap' : 'ph-download-simple'}`} aria-hidden="true"></i>
                    {isCreatingBackup ? 'Creating backup…' : 'Download Firestore Backup'}
                  </button>
                  {backupMessage && (
                    <p className={`profile-backup-message${backupHasError ? ' error' : ''}`} role="status">
                      {backupMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

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
                  <div className="warning-banner">
                    <i className="ph-fill ph-warning-circle"></i>
                    <span>Unexpected bad things will happen if you don't read this!</span>
                  </div>
                  <ul className="consequence-list">
                    <li>This will permanently delete your account and profile information.</li>
                    <li>You will lose access to all pending and approved reservations.</li>
                    <li>There is no way to recover this data once deleted.</li>
                  </ul>
                  <button className="btn-danger-full" onClick={() => setDeleteStep(2)}>
                    I have read and understand these effects
                  </button>
                </div>
              )}

              {deleteStep === 2 && (
                <div className="delete-step-2">
                  <p className="verify-instructions">
                    To confirm, enter your password and type "<strong>delete my account</strong>" below
                  </p>
                  
                  <input 
                    type="password" 
                    placeholder="Enter your password"
                    value={deletePassword} 
                    onChange={(e) => setDeletePassword(e.target.value)} 
                    style={{ marginBottom: '10px' }}
                  />

                  <input 
                    type="text" 
                    placeholder="Type 'delete my account'"
                    value={deleteVerification} 
                    onChange={(e) => setDeleteVerification(e.target.value)} 
                    autoFocus
                  />
                  
                  <button 
                    className="btn-danger-full" 
                    disabled={deleteVerification !== 'delete my account' || !deletePassword || isDeleting} 
                    onClick={handleDeleteAccount}
                  >
                    {isDeleting ? "Deleting..." : "Delete Account"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

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
      </>
      )}
    </div>
  );
};

export default Profile;