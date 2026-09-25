import React, { useState } from 'react';
import '../../styles/mis/MisProfile.scss';

const MisProfile = () => {
  // --- STATE MANAGEMENT ---
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Store all form fields in a single state object (starts empty)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    employeeId: '',
    dateJoined: '',
    jobTitle: '',
    role: '',
    department: '',
    officeLocation: '',
    systemAccessLevel: '',
    workSchedule: '',
    supervisor: ''
  });

  // --- HANDLERS ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const toggleEditMode = () => {
    setIsEditing(!isEditing);
    setSaveSuccess(false); // Clear success message if they re-edit
  };

  const handleSave = () => {
    if (!isEditing) return;
    
    setIsSaving(true);
    setSaveSuccess(false);

    // Simulate an API network request
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setIsEditing(false); // Automatically lock the fields after saving

      // Remove the success message after 3 seconds
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    }, 1500);
  };

  return (
    <div className="mis-profile-container">
      
      <div className="profile-hero">
        <div className="banner-bg"></div>
        
        <div className="profile-header-content">
          <div className="profile-identity">
            <div className="avatar-container">
              <img src={`https://ui-avatars.com/api/?name=${formData.firstName || 'User'}+${formData.lastName || ''}&background=1E293B&color=fff&size=120`} alt="Avatar" />
              <div className="status-indicator" style={{ background: '#10B981' }}></div> 
            </div>
            
            <div className="user-titles">
              <div className="name-row">
                <h2>{formData.firstName || 'Your'} {formData.lastName || 'Name'}</h2>
                <span className="role-badge">{formData.role || 'Role'}</span>
              </div>
              <p>{formData.department || 'Department'}</p>
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
        
        {/* LEFT COLUMN: Forms */}
        <div className="profile-main-forms">
          
          <div className="form-section card-style">
            <div className="section-title">
              <div className="icon-wrap bg-blue-soft"><i className="ph ph-user"></i></div>
              <h3>Personal Information</h3>
            </div>
            
            <div className="form-grid">
              <div className="input-group">
                <label>FIRST NAME</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>LAST NAME</label>
                <input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>EMAIL ADDRESS</label>
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>PHONE NUMBER</label>
                <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>EMPLOYEE ID</label>
                <input type="text" name="employeeId" value={formData.employeeId} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>DATE JOINED</label>
                <input type="text" name="dateJoined" value={formData.dateJoined} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
            </div>
          </div>

          <div className="form-section card-style">
            <div className="section-title">
              <div className="icon-wrap bg-indigo-soft"><i className="ph ph-buildings"></i></div>
              <h3>Work Information</h3>
            </div>
            
            <div className="form-grid">
              <div className="input-group">
                <label>JOB TITLE</label>
                <input type="text" name="jobTitle" value={formData.jobTitle} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>ROLE</label>
                <input type="text" name="role" value={formData.role} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>DEPARTMENT</label>
                <input type="text" name="department" value={formData.department} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>OFFICE LOCATION</label>
                <input type="text" name="officeLocation" value={formData.officeLocation} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>SYSTEM ACCESS LEVEL</label>
                <input type="text" name="systemAccessLevel" value={formData.systemAccessLevel} onChange={handleInputChange} readOnly={!isEditing} style={{ color: '#8B5CF6', fontWeight: '600', background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group">
                <label>WORK SCHEDULE</label>
                <input type="text" name="workSchedule" value={formData.workSchedule} onChange={handleInputChange} readOnly={!isEditing} style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent', textAlign: 'left', textIndent: '0' }} />
              </div>
              <div className="input-group full-width">
                <label>SUPERVISOR / MANAGER</label>
                <div className="supervisor-input" style={{ background: isEditing ? '#FFFFFF' : '#F8FAFC', border: isEditing ? '1px solid #CBD5E1' : '1px solid transparent' }}>
                  <img src="https://ui-avatars.com/api/?name=Alan+Turing&background=F1F5F9&color=94A3B8&size=24" alt="Supervisor" />
                  <input type="text" name="supervisor" value={formData.supervisor} onChange={handleInputChange} readOnly={!isEditing} style={{ textAlign: 'left', textIndent: '0' }} />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Sidebar Panels */}
        <div className="profile-sidebar">
          
          <div className="side-panel card-style danger-zone">
            <div className="section-title">
              <div className="icon-wrap" style={{background: '#FEE2E2', color: '#EF4444'}}><i className="ph ph-warning"></i></div>
              <h3>Danger Zone</h3>
            </div>
            <p>Deactivating your MIS account will revoke all system access and administrative privileges. This action cannot be undone.</p>
            <button className="btn-deactivate"><i className="ph ph-prohibit"></i> Deactivate Account</button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default MisProfile;