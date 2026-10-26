import { collection, getDocs } from 'firebase/firestore';
import { db } from '../Firebase';
import { sendReservationEmail } from './emailService';
import { archiveReservations } from './archiveReservation';

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

const getReservationEndDate = (reservation, eventDate) => {
  const explicitEndDate = parseReservationDate(reservation.endDate);
  if (explicitEndDate) return explicitEndDate;

  const endDate = new Date(eventDate);
  endDate.setDate(endDate.getDate() + Math.max(1, Number(reservation.days) || 1) - 1);
  return endDate;
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

export const isReservationEndReached = (reservation, now = new Date()) => {
  const eventDate = parseReservationDate(reservation.eventDate || reservation.date);
  if (!eventDate) return false;

  const endDate = getReservationEndDate(reservation, eventDate);
  const endTime = parseReservationTime(reservation.endTime);
  const endDateTime = endTime
    ? new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
      endTime.hours,
      endTime.minutes
    )
    : new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
      23,
      59,
      59
    );

  return now > endDateTime;
};

export const archiveExpiredApprovedReservations = async (reservations, now = new Date()) => {
  const expiredReservations = reservations.filter((reservation) => (
    (reservation.status || '').toLowerCase().trim() === 'approved'
    && isReservationEndReached(reservation, now)
  ));

  await archiveReservations(expiredReservations.map(({ id, ...reservation }) => ({
    id,
    data: { ...reservation, archivedAt: now.toISOString() }
  })));
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

  await archiveReservations(expiredReservations.map(({ id, data }) => {
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
    return {
      id,
      data: {
        ...data,
        status: 'Expired',
        expiredAt,
        historyLogs: [
          ...(Array.isArray(data.historyLogs) ? data.historyLogs : []),
          expirationLog
        ]
      }
    };
  }));

  await Promise.all(expiredReservations.map(({ data }) => sendReservationEmail(
    data.userEmail,
    data.fullName,
    data,
    'Your pending reservation expired after its scheduled start date and time.'
  )));
};
