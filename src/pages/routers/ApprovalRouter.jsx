import { Suspense, lazy } from 'react';

const MisApproval = lazy(() => import('../mis/MisApproval'));

const ApprovalRouter = ({currentUserRole}) => {

    const approvalComponents = {
        'mis': <MisApproval />
    };

    const CurrentDashboard = approvalComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default ApprovalRouter;