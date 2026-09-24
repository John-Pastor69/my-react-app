import { Suspense, lazy } from 'react';

const MisProfile = lazy(() => import('../mis/MisProfile'));

const ProfileRouter = ({currentUserRole}) => {

    const profileComponents = {
        'mis': <MisProfile />
    };

    const CurrentDashboard = profileComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading dashboard...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default ProfileRouter;