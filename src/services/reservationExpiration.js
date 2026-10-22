import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../Firebase';
import { sendReservationEmail } from './emailService';

const parseReservationDate = (value) => {
  if (!value) return null;
  const dateString = String(value).trim();
  const yearFirstDate = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const monthFirstDate = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!yearFirstDate && !monthFirstDate) return null;

  const year = Number(yearFirstDate ? yearFirstDate[1] : monthFirstDate[3]);
  const month = Number(yearFirstDate ? yearFirstDate[2] : monthFirstDate[1]) - 1;
  const day = Number(yearFirstDate ? yearFirstDate[3] : monthFirstDate[2]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
};

const parseReservationTime = (value) => {
  if (!value || value === 'N/A') return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minutes > 59 || (meridiem && hours > 12) || (!meridiem && hours > 23)) return null;
  if (meridiem) hours = hours % 12 + (meridiem === 'PM' ? 12 : 0);
  return { hours, minutes };
};

const isExpiredPendingReservation = (reservation, now) => {
  const eventDate = parseReservationDate(reservation.eventDate || reservation.date);
  if (!eventDate) return false;

  const startTime = parseReservationTime(reservation.startTime);
  const startDateTime = startTime
    ? new Date(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate(),
      startTime.hours,
      startTime.minutes
    )
    : new Date(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate(),
      23,
      59,
      59
    );
  return now > startDateTime;
};

export const archiveExpiredPendingReservations = async (user) => {
  const snapshot = await getDocs(collection(db, 'reservations'));
  const now = new Date();
  const expiredReservations = snapshot.docs
    .filter((reservationDoc) => {
      const reservation = reservationDoc.data();
      const isOwnedByUser = reservation.userId === user.uid
        || reservation.userEmail === user.email;
      return isOwnedByUser
        && (reservation.status || '').toLowerCase().trim() === 'pending'
        && isExpiredPendingReservation(reservation, now);
    })
    .map((reservationDoc) => ({
      id: reservationDoc.id,
      data: reservationDoc.data()
    }));

  for (let index = 0; index < expiredReservations.length; index += 200) {
    const batch = writeBatch(db);
    expiredReservations.slice(index, index + 200).forEach(({ id, data }) => {
      const expiredAt = now.toISOString();
      const expirationLog = {
        id: `expired-${id}`,
        role: 'System',
        badge: 'Expired',
        date: expiredAt,
        approverName: 'System',
        text: 'Pending reservation expired after its scheduled start date and time.',
        state: 'expired'
      };
      batch.set(doc(db, 'archive', id), {
        ...data,
        status: 'Expired',
        expiredAt,
        historyLogs: [
          ...(Array.isArray(data.historyLogs) ? data.historyLogs : []),
          expirationLog
        ]
      }, { merge: true });
      batch.delete(doc(db, 'reservations', id));
    });
    await batch.commit();
  }

  await Promise.all(expiredReservations.map(({ data }) => sendReservationEmail(
    data.userEmail,
    data.fullName,
    data,
    'Your pending reservation expired after its scheduled start date and time.'
  )));
};
