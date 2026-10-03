import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { auth, db } from '../Firebase'; 
import '../styles/Profile.scss';

const Profile = () => {
  // --- STATE MANAGEMENT ---
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // --- IMAGE STATE ---
  const [avatarFile, setAvatarFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);

  // --- DELETE ACCOUNT STATE ---
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteVerification, setDeleteVerification] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [expandedImage, setExpandedImage] = useState(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    officeLocation: '',
    phone: '',
    role: '',
    status: 'Active',
    dateJoined: '',
    avatarUrl: '',
    bannerUrl: ''
  });
            
  // --- FETCH DATA ON LOAD ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data(); 
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
            if (!joinedDate && user.metadata?.creationTime) {
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
              email: data.email || user.email || '',
              role: data.role ? data.role.toUpperCase() : '',
              status: data.status || 'Active',
              dateJoined: joinedDate || 'N/A', 
              officeLocation: data.officeLocation || '',
              phone: data.phone || '',
              avatarUrl: data.avatarUrl || '',
              bannerUrl: data.bannerUrl || ''
            }));
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      }
    });

    return () => unsubscribe(); 
  }, []);

  // --- HANDLERS ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const sanitizedValue = name === 'phone' ? value.replace(/[^0-9]/g, '').slice(0, 11) : value;
    setFormData(prev => ({ ...prev, [name]: sanitizedValue }));
  };

  const handleImageChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

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
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteVerification !== 'delete my account') return;
    setIsDeleting(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { status: 'Inactive', lastActive: new Date().toISOString() });
        
        await deleteDoc(userDocRef);
        await deleteUser(user);
        window.location.href = '/'; 
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      if (error.code === 'auth/requires-recent-login') {
        alert("Security requirement: Please log out and log back in before deleting your account.");
      } else {
        alert("An error occurred while deleting your account.");
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="profile-container">
      
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
          </div>
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
              <div className="input-group full-width">
                <label>EMAIL</label>
                <input type="email" name="email" value={formData.email} readOnly className="profile-readonly-input" />
              </div>
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
            </div>
          </div>
        </div>

        <div className="profile-sidebar">
          <div className="side-panel card-style danger-zone">
            <div className="section-title">
              <div className="icon-wrap danger-icon-wrap"><i className="ph-fill ph-warning"></i></div>
              <h3>Danger Zone</h3>
            </div>
            <p>This action cannot be undone.</p>
            <button className="btn-deactivate" onClick={() => setShowDeleteModal(true)}><i className="ph ph-prohibit"></i> Delete Account</button>
          </div>
        </div>

        {showDeleteModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Are you sure you want to delete this?</h3>
              <p>To verify, type <em>delete my account</em></p>
              <input type="text" placeholder="delete my account" value={deleteVerification} onChange={(e) => setDeleteVerification(e.target.value)} />
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => { setShowDeleteModal(false); setDeleteVerification(''); }}>Cancel</button>
                <button className="btn-confirm-delete" disabled={deleteVerification !== 'delete my account' || isDeleting} onClick={handleDeleteAccount}>
                  {isDeleting ? "Deleting..." : "Delete Account"}
                </button>
              </div>
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