import { Suspense, lazy } from 'react';

const MisUserManagement = lazy(() => import('../mis/MisUserManagement'));

const UserManagementRouter = ({currentUserRole}) => {

    const userManagementComponents = {
        'mis': <MisUserManagement currentUserRole={currentUserRole} />,
        'building admin': <MisUserManagement currentUserRole={currentUserRole} />
    };

    const CurrentDashboard = userManagementComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default UserManagementRouter;