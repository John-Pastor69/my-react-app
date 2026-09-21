import React from 'react';
import '../../styles/mis/MisProfile.scss';

const MisProfile = () => {
  return (
    <div className="mis-profile-container">
      
      <div className="profile-hero">
        <div className="banner-bg"></div>
        
        <div className="profile-header-content">
          <div className="profile-identity">
            <div className="avatar-container">
              <img src="https://ui-avatars.com/api/?name=User&background=1E293B&color=fff&size=120" alt="Blank Avatar" />
              <div className="status-indicator" style={{ background: '#94A3B8' }}></div> 
            </div>
            
            <div className="user-titles">
              <div className="name-row">
                <h2>Your Name</h2>
                <span className="role-badge">Role</span>
              </div>
              <p>Department</p>
            </div>
          </div>

          <div className="profile-actions">
            <button className="btn-edit"><i className="ph ph-pencil-simple"></i> Edit Profile</button>
            <button className="btn-save" disabled><i className="ph ph-floppy-disk"></i> Save Changes</button>
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
                <input type="text" defaultValue="" />
              </div>
              <div className="input-group">
                <label>LAST NAME</label>
                <input type="text" defaultValue="" />
              </div>
              <div className="input-group">
                <label>EMAIL ADDRESS</label>
                <div className="input-with-icon">
                  <i className="ph ph-envelope-simple"></i>
                  <input type="email" defaultValue="" />
                </div>
              </div>
              <div className="input-group">
                <label>PHONE NUMBER</label>
                <div className="input-with-icon">
                  <i className="ph ph-phone"></i>
                  <input type="text" defaultValue="" />
                </div>
              </div>
              <div className="input-group">
                <label>EMPLOYEE ID</label>
                <div className="input-with-icon">
                  <i className="ph ph-identification-card"></i>
                  <input type="text" defaultValue="" />
                </div>
              </div>
              <div className="input-group">
                <label>DATE JOINED</label>
                <div className="input-with-icon">
                  <i className="ph ph-calendar-blank"></i>
                  <input type="text" defaultValue="" />
                </div>
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
                <input type="text" defaultValue="" />
              </div>
              <div className="input-group">
                <label>ROLE</label>
                <div className="input-with-icon">
                  <i className="ph ph-circle" style={{ color: '#8B5CF6', fontSize: '10px' }}></i>
                  <input type="text" defaultValue="" />
                </div>
              </div>
              <div className="input-group">
                <label>DEPARTMENT</label>
                <input type="text" defaultValue="" />
              </div>
              <div className="input-group">
                <label>OFFICE LOCATION</label>
                <div className="input-with-icon">
                  <i className="ph ph-map-pin"></i>
                  <input type="text" defaultValue="" />
                </div>
              </div>
              <div className="input-group">
                <label>SYSTEM ACCESS LEVEL</label>
                <div className="input-with-icon">
                  <i className="ph ph-shield-check" style={{ color: '#8B5CF6' }}></i>
                  <input type="text" defaultValue="" style={{ color: '#8B5CF6', fontWeight: '600' }} />
                </div>
              </div>
              <div className="input-group">
                <label>WORK SCHEDULE</label>
                <div className="input-with-icon">
                  <i className="ph ph-clock"></i>
                  <input type="text" defaultValue="" />
                </div>
              </div>
              <div className="input-group full-width">
                <label>SUPERVISOR / MANAGER</label>
                <div className="supervisor-input">
                  <img src="https://ui-avatars.com/api/?name=User&background=F1F5F9&color=94A3B8&size=24" alt="Blank Supervisor" />
                  <input type="text" defaultValue="" placeholder="Unassigned" />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Sidebar Panels */}
        <div className="profile-sidebar">
          
          {/* Activity Summary and Change Password have been completely removed */}

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