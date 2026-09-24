import { Suspense, lazy } from 'react';

const AcadHeadDashboard = lazy(() => import('../academic_head/AcadHeadDashboard'));
const BuildingDashboard = lazy(() => import('../building_admin/BuildingDashboard'));
const EndorserDashboard = lazy(() => import('../endorser/EndorserDashboard'));
const MisDashboard = lazy(() => import('../mis/MisDashboard'));
const OsaDashboard = lazy(() => import('../osa/OsaDashboard'));
const SchoolAdminDashboard = lazy(() => import('../school_admin/SchoolAdminDashboard'));
const UserDashboard = lazy(() => import('../user/UserDashboard'));

const DashboardRouter = ({ currentUserRole }) => {
  
  const dashboardComponents = {
    'academic_head': <AcadHeadDashboard />,
    'building_admin': <BuildingDashboard />,
    'endorser': <EndorserDashboard />,
    'mis': <MisDashboard />,
    'osa': <OsaDashboard />,
    'school_admin': <SchoolAdminDashboard />,
    'user': <UserDashboard />,
  };

  const CurrentDashboard = dashboardComponents[currentUserRole] || null;

  return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
  );
};

export default DashboardRouter;