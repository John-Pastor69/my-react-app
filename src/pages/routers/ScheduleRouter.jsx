import { Suspense, lazy } from 'react';

const Schedule = lazy(() => import('../Schedule'));

const ScheduleRouter = ({currentUserRole}) => {

    const scheduleComponents = {
        'requestor': <Schedule currentUserRole={currentUserRole} />,
        'endorser': <Schedule currentUserRole={currentUserRole} />,
        'building admin': <Schedule currentUserRole={currentUserRole} />,
        'osa': <Schedule currentUserRole={currentUserRole} />,
        'mis': <Schedule currentUserRole={currentUserRole} />,
        'academic head': <Schedule currentUserRole={currentUserRole} />,
        'school admin': <Schedule currentUserRole={currentUserRole} />,
    };

    const CurrentDashboard = scheduleComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default ScheduleRouter;