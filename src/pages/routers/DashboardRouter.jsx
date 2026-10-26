import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';

const Dashboard = lazy(() => import('../Dashboard'));

const DashboardRouter = ({ currentUserRole }) => {
  const [searchParams] = useSearchParams();
  const dashboardSearchQuery = searchParams.get('search') || '';

  const dashboardComponents = {
    'endorser': <Dashboard key={dashboardSearchQuery} currentUserRole={currentUserRole} />,
    'building admin': <Dashboard key={dashboardSearchQuery} currentUserRole={currentUserRole} />,
    'osa': <Dashboard key={dashboardSearchQuery} currentUserRole={currentUserRole} />,
    'room checker': <Dashboard key={dashboardSearchQuery} currentUserRole={currentUserRole} />,
    'mis': <Dashboard key={dashboardSearchQuery} currentUserRole={currentUserRole} />,
    'mis admin': <Dashboard key={dashboardSearchQuery} currentUserRole={currentUserRole} />,
    'super admin': <Dashboard key={dashboardSearchQuery} currentUserRole={currentUserRole} />,
    'academic head': <Dashboard key={dashboardSearchQuery} currentUserRole={currentUserRole} />,
    'school admin': <Dashboard key={dashboardSearchQuery} currentUserRole={currentUserRole} />,

  };

  const CurrentDashboard = dashboardComponents[currentUserRole] || null;

  return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
  );
};

export default DashboardRouter;