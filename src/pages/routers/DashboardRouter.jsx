import { Suspense, lazy } from 'react';

const AcadHeadDashboard = lazy(() => import('../academic_head/AcadHeadDashboard'));
const BuildingDashboard = lazy(() => import('../building_admin/BuildingDashboard'));
const EndorserDashboard = lazy(() => import('../endorser/EndorserDashboard'));
const MisDashboard = lazy(() => import('../mis/MisDashboard'));
const OsaDashboard = lazy(() => import('../osa/OsaDashboard'));
const SchoolAdminDashboard = lazy(() => import('../school_admin/SchoolAdminDashboard'));
const Schedule = lazy(() => import('../Schedule'));

const DashboardRouter = ({ currentUserRole }) => {
  
  const dashboardComponents = {
    'endorser': <EndorserDashboard />,
    'building admin': <BuildingDashboard />,
    'osa': <OsaDashboard />,
    'mis': <Schedule />,
    'academic head': <AcadHeadDashboard />,
    'school admin': <SchoolAdminDashboard />,
    'schedule': <Schedule />

  };

  const CurrentDashboard = dashboardComponents[currentUserRole] || null;

  return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
  );
};

export default DashboardRouter;