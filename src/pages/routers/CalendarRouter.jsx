import { Suspense, lazy } from 'react';

const Calendar = lazy(() => import('../Calendar'));

const CalendarRouter = ({currentUserRole}) => {

    const calendarComponents = {
        'requestor': <Calendar currentUserRole={currentUserRole} />,
        'endorser': <Calendar currentUserRole={currentUserRole} />,
        'building admin': <Calendar currentUserRole={currentUserRole} />,
        'osa': <Calendar currentUserRole={currentUserRole} />,
        'mis': <Calendar currentUserRole={currentUserRole} />,
        'academic head': <Calendar currentUserRole={currentUserRole} />,
        'school admin': <Calendar currentUserRole={currentUserRole} />,
    };

    const CurrentDashboard = calendarComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading dashboard...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default CalendarRouter;