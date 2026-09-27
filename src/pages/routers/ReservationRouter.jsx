import { Suspense, lazy } from 'react';

const EndorserReservation = lazy(() => import('../user/EndorserReservation'))

const EndorserRouter = ({currentUserRole}) => {

    const endorserComponents = {
        'endorser': <EndorserReservation />,
        'mis': <EndorserReservation />
    };

    const CurrentDashboard = endorserComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default EndorserRouter;