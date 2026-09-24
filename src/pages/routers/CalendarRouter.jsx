import { Suspense, lazy } from 'react';

const MisCalendar = lazy(() => import('../mis/MisCalendar'));

const CalendarRouter = ({currentUserRole}) => {

    const calendarComponents = {
        'mis': <MisCalendar />
    };

    const CurrentDashboard = calendarComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading dashboard...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default CalendarRouter;