import { Suspense, lazy } from 'react';

const MisApproval = lazy(() => import('../mis/MisApproval'));
const EndorserApproval = lazy(() => import('../endorser/EndorserApproval'));

const ApprovalRouter = ({currentUserRole}) => {

    const approvalComponents = {
        'mis': <MisApproval />,
        'endorser': <EndorserApproval/>
    };

    const CurrentDashboard = approvalComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default ApprovalRouter;