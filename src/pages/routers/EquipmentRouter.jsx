import { Suspense, lazy } from 'react';

const MisEquipmentManagement = lazy(() => import('../mis/MisEquipmentManagement'));

const EquipmentManagementRouter = ({currentUserRole}) => {

    const equipmentManagementComponents = {
        'mis': <MisEquipmentManagement />
    };

    const CurrentDashboard = equipmentManagementComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default EquipmentManagementRouter;