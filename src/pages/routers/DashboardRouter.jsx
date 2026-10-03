import { Suspense, lazy } from 'react';

const Dashboard = lazy(() => import('../Dashboard'));

const DashboardRouter = ({ currentUserRole }) => {
  
  const dashboardComponents = {
    'endorser': <Dashboard currentUserRole={currentUserRole} />,
    'building admin': <Dashboard currentUserRole={currentUserRole} />,
    'osa': <Dashboard currentUserRole={currentUserRole} />,
    'mis': <Dashboard currentUserRole={currentUserRole} />,
    'academic head': <Dashboard currentUserRole={currentUserRole} />,
    'school admin': <Dashboard currentUserRole={currentUserRole} />,

  };

  const CurrentDashboard = dashboardComponents[currentUserRole] || null;

  return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
  );
};

export default DashboardRouter;