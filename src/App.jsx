import { useState } from 'react'; 
import { Routes, Route } from 'react-router-dom';
import SideBar from './pages/SideBar';
import TopBar from './pages/TopBar'; 
import './App.css'; 

import DashboardRouter from './pages/routers/DashboardRouter';
import CalendarRouter from './pages/routers/CalendarRouter';
import ApprovalRouter from './pages/routers/ApprovalRouter';
import UserManagementRouter from './pages/routers/UserManagementRouter';
import EquipmentManagementRouter from './pages/routers/EquipmentRouter';
import ProfileRouter from './pages/routers/ProfileRouter';

export default function App() {

  const uiDashboard = "mis";
  const uiApproval = "mis";
  const uiCalendar = "mis";
  const uiEquipment = "mis";
  const uiUserManage = "mis";
  const uiAccount =  "mis";

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="app-container">
      <SideBar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className="main-content">
        <TopBar toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        <div className="page-content">
          <Routes> 
            {/* The single route handles all 7 dashboards automatically */}
            <Route 
              path="/dashboard" 
              element={<DashboardRouter currentUserRole={uiDashboard} />}
            />
            <Route 
              path="/approvals" 
              element={<ApprovalRouter currentUserRole={uiApproval} />}
            />
            <Route 
              path="/calendar" 
              element={<CalendarRouter currentUserRole={uiCalendar} />}
            />
            <Route 
              path="/equipment" 
              element={<EquipmentManagementRouter currentUserRole={uiEquipment} />}
            />
            <Route 
              path="/users" 
              element={<UserManagementRouter currentUserRole={uiUserManage} />}
            />
            <Route 
              path="/account" 
              element={<ProfileRouter currentUserRole={uiAccount} />}
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}