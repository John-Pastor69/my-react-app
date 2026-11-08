import { collection, getDocs } from 'firebase/firestore';
import { db } from '../Firebase';
import { getNextApprovalStep, normalizeApprovalRoleKey } from './approvalWorkflow';
import { sendReservationEmail } from './emailService';

const getUserEmail = (user) => (
  typeof user?.email === 'string' ? user.email.trim() : ''
);

const getUserName = (user) => (
  user?.name || user?.fullName || user?.displayName || 'Approver'
);

export const sendApprovalRequiredEmails = async (reservation, requestorRole) => {
  const nextStep = getNextApprovalStep(reservation, requestorRole);
  if (!nextStep) return;

  let recipients;
  if (nextStep.key === 'endorser') {
    recipients = [{
      email: reservation.endorserEmail,
      name: reservation.endorserName || 'Endorser'
    }];
  } else {
    try {
      const [usersSnapshot, superUsersSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'super_users'))
      ]);
      recipients = [...usersSnapshot.docs, ...superUsersSnapshot.docs]
        .map((userDoc) => userDoc.data())
        .filter((user) => normalizeApprovalRoleKey(user.role) === nextStep.key)
        .map((user) => ({ email: getUserEmail(user), name: getUserName(user) }));
    } catch (error) {
      console.error(`Failed to find ${nextStep.label} approvers for reservation email:`, error);
      return;
    }
  }

  const uniqueRecipients = [...new Map(
    recipients
      .filter((recipient) => typeof recipient.email === 'string' && recipient.email.trim())
      .map((recipient) => [recipient.email.trim().toLowerCase(), {
        ...recipient,
        email: recipient.email.trim()
      }])
  ).values()];

  if (uniqueRecipients.length === 0) {
    console.warn(`No email recipients found for the active ${nextStep.label} approval step.`);
    return;
  }

  const requirement = nextStep.key === 'endorser' ? 'your endorsement' : 'your approval';
  const message = `A new reservation request (${reservation.eventName || 'Untitled'}) requires ${requirement}.`;
  await Promise.all(uniqueRecipients.map(({ email, name }) => (
    sendReservationEmail(email, name, reservation, message)
  )));
};
