import { Suspense, lazy } from 'react';

const Approval = lazy(() => import('../Approval'));

const ApprovalRouter = ({currentUserRole}) => {

    const approvalComponents = {
        'endorser': <Approval currentUserRole={currentUserRole} />,
        'building admin': <Approval currentUserRole={currentUserRole} />,
        'osa': <Approval currentUserRole={currentUserRole} />,
        'mis': <Approval currentUserRole={currentUserRole} />,
        'academic head': <Approval currentUserRole={currentUserRole} />,
        'school admin': <Approval currentUserRole={currentUserRole} />,
    };

    const CurrentDashboard = approvalComponents[currentUserRole] || null;

    return (
    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
      {CurrentDashboard}
    </Suspense>
    );
};

export default ApprovalRouter;