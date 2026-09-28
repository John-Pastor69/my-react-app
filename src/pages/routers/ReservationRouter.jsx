import { Suspense, lazy } from 'react';

const Reservation = lazy(() => import('../Reservation'))

const ReservationRouter = ({currentUserRole}) => {

    const reservationComponents = {
        'requestor': <Reservation/>,
        'endorser': <Reservation />,
        'building admin': <Reservation />,
        'osa': <Reservation/>,
        'mis': <Reservation/>,
        'academic head': <Reservation/>,
        'school admin': <Reservation/>,

    };

    const CurrentDashboard = reservationComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default ReservationRouter;