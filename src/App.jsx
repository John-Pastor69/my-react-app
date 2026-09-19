import { useState } from 'react'; 
import { Routes, Route } from 'react-router-dom';
import SideBar from './pages/SideBar';
import TopBar from './pages/TopBar'; 
import './App.css'; 

import DashboardRouter from './pages/routers/DashboardRouter';

export default function App() {

  const fakeUserRole = "mis_calendar"; // Change this to test different dashboards

  return (
    <div className="app-container">
      <SideBar />
      <div className="main-content">
        <TopBar />
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