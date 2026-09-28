import { Suspense, lazy } from 'react';

const Reservation = lazy(() => import('../Reservation'))

const ReservationRouter = ({currentUserRole}) => {

    const reservationComponents = {
        'requestor': <Reservation currentUserRole={currentUserRole} />,
        'endorser': <Reservation currentUserRole={currentUserRole} />,
        'building admin': <Reservation currentUserRole={currentUserRole} />,
        'osa': <Reservation currentUserRole={currentUserRole} />,
        'mis': <Reservation currentUserRole={currentUserRole} />,
        'academic head': <Reservation currentUserRole={currentUserRole} />,
        'school admin': <Reservation currentUserRole={currentUserRole} />,

    };

    const CurrentDashboard = reservationComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default ReservationRouter;