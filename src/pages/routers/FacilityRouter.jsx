import { Suspense, lazy } from 'react';

const Facility = lazy(() => import('../building_admin/BuildingFacilitiesManagement')) 

const FacilityRouter = ({currentUserRole}) => {

    const approvalComponents = {
        'building admin': <Facility />,
    };

    const CurrentDashboard = approvalComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default FacilityRouter;