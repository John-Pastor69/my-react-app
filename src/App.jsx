import { useState } from 'react'; 
import { Routes, Route } from 'react-router-dom';
import SideBar from './pages/SideBar';
import TopBar from './pages/TopBar'; 
import './App.css'; 

import DashboardRouter from './pages/routers/DashboardRouter';

export default function App() {

  const fakeUserRole = "mis_profile"; // Change this to test different dashboards

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
              element={<DashboardRouter currentUserRole={fakeUserRole} />} 
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}