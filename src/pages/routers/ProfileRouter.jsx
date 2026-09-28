import { Suspense, lazy } from 'react';

const Profile = lazy(() => import('../Profile'));

const ProfileRouter = ({currentUserRole}) => {

    const profileComponents = {
        'requestor': <Profile currentUserRole={currentUserRole} />,
        'endorser': <Profile currentUserRole={currentUserRole} />,
        'building admin': <Profile currentUserRole={currentUserRole} />,
        'osa': <Profile currentUserRole={currentUserRole} />,
        'mis': <Profile currentUserRole={currentUserRole} />,
        'academic head': <Profile currentUserRole={currentUserRole} />,
        'school admin': <Profile currentUserRole={currentUserRole} />,
    };

    const CurrentDashboard = profileComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading dashboard...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default ProfileRouter;