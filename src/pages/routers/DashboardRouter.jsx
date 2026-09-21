import { Suspense, lazy } from 'react';

const AcadHeadDashboard = lazy(() => import('../academic_head/AcadHeadDashboard'));
const BuildingDashboard = lazy(() => import('../building_admin/BuildingDashboard'));
const EndorserDashboard = lazy(() => import('../endorser/EndorserDashboard'));
const MisDashboard = lazy(() => import('../mis/MisDashboard'));
const OsaDashboard = lazy(() => import('../osa/OsaDashboard'));
const SchoolAdminDashboard = lazy(() => import('../school_admin/SchoolAdminDashboard'));
const UserDashboard = lazy(() => import('../user/UserDashboard'));

const MisCalendar = lazy(() => import('../mis/MisCalendar'));
const MisEquipmentManagement = lazy(() => import('../mis/MisEquipmentManagement'));
const MisUserManagement = lazy(() => import('../mis/MisUserManagement'));
const MisApproval = lazy(() => import('../mis/MisApproval'));
const MisProfile = lazy(() => import('../mis/MisProfile'));


const DashboardRouter = ({ currentUserRole }) => {
  
  const dashboardComponents = {
    'academic_head': <AcadHeadDashboard />,
    'building_admin': <BuildingDashboard />,
    'endorser': <EndorserDashboard />,
    'mis': <MisDashboard />,
    'osa': <OsaDashboard />,
    'school_admin': <SchoolAdminDashboard />,
    'user': <UserDashboard />,

    'mis_calendar': <MisCalendar />,
    'mis_equipment': <MisEquipmentManagement />,
    'mis_user': <MisUserManagement/>,
    'mis_approval': <MisApproval/>,
    'mis_profile': <MisProfile />
  };

  const CurrentDashboard = dashboardComponents[currentUserRole] || (
    <div className="error-state">Unauthorized Access or Invalid Role</div>
  );

  return (
    <Suspense fallback={<div className="loading-spinner">Loading dashboard...</div>}>
      {CurrentDashboard}
    </Suspense>
  );
};

export default DashboardRouter;