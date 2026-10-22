export const APPROVAL_STEPS = [
  { key: 'requestor', label: 'Requestor Submitted' },
  { key: 'endorser', label: 'Endorser' },
  { key: 'osa', label: 'OSA' },
  { key: 'building admin', label: 'Building Admin' },
  { key: 'mis', label: 'MIS' },
  { key: 'academic head', label: 'Academic Head' },
  { key: 'school admin', label: 'School Admin' }
];

export const APPROVAL_ROLE_HIERARCHY = APPROVAL_STEPS.map(({ key }) => key);

export const normalizeApprovalRoleKey = (role) => (
  (role || '').toLowerCase().trim().replace(/_/g, ' ')
);

export const isApprovalStepReady = (
  approvals,
  roleKey,
  { hasEndorser = false, isStaffRequestor = false } = {}
) => {
  const stepIndex = APPROVAL_ROLE_HIERARCHY.indexOf(normalizeApprovalRoleKey(roleKey));
  if (stepIndex <= 0) return false;

  const previousStepKey = APPROVAL_ROLE_HIERARCHY[stepIndex - 1];
  if (previousStepKey === 'requestor') return true;
  if (previousStepKey === 'endorser') {
    return isStaffRequestor
      || !hasEndorser
      || approvals?.endorser?.status?.toLowerCase() === 'approved';
  }

  return approvals?.[previousStepKey]?.status?.toLowerCase() === 'approved';
};

export const getApprovalTrackerSteps = ({
  approvals,
  dateSubmitted,
  hasEndorser,
  isStaffRequestor,
  activeRoleKey = '',
  reservationStatus = ''
}) => APPROVAL_STEPS.map((step) => {
  if (step.key === 'requestor') {
    return { ...step, status: 'Completed', date: dateSubmitted, state: 'approved' };
  }

  if (step.key === 'endorser' && (isStaffRequestor || !hasEndorser)) {
    return {
      ...step,
      status: 'Skipped',
      date: isStaffRequestor ? dateSubmitted : '—',
      state: 'approved'
    };
  }

  const approvalRecord = approvals?.[step.key];
  const recordStatus = approvalRecord?.status?.toLowerCase();
  if (recordStatus === 'approved' || recordStatus === 'rejected') {
    return {
      ...step,
      status: recordStatus === 'approved' ? 'Completed' : 'Rejected',
      date: approvalRecord.date || 'Pending',
      state: recordStatus
    };
  }

  const isReady = isApprovalStepReady(approvals, step.key, { hasEndorser, isStaffRequestor });
  const isActiveStep = isReady
    && normalizeApprovalRoleKey(activeRoleKey) === step.key
    && reservationStatus.toLowerCase() !== 'rejected';

  return {
    ...step,
    status: isActiveStep ? 'Your Turn' : 'Pending',
    date: 'Pending',
    state: isActiveStep ? 'your-turn' : isReady ? 'pending' : 'queued'
  };
});
