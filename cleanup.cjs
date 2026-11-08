const { randomUUID } = require('node:crypto');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ARCHIVE_RETENTION_DAYS = 30;
const ARCHIVE_BATCH_SIZE = 200;
const DELETE_BATCH_SIZE = 500;

const parseReservationDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return parseReservationDate(value.toDate());
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const dateString = String(value).trim();
  const yearFirstDate = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const monthFirstDate = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (yearFirstDate || monthFirstDate) {
    const year = Number(yearFirstDate ? yearFirstDate[1] : monthFirstDate[3]);
    const month = Number(yearFirstDate ? yearFirstDate[2] : monthFirstDate[1]) - 1;
    const day = Number(yearFirstDate ? yearFirstDate[3] : monthFirstDate[2]);
    const date = new Date(year, month, day);
    return date.getFullYear() === year
      && date.getMonth() === month
      && date.getDate() === day
      ? date
      : null;
  }

  const parsedDate = new Date(dateString);
  return Number.isNaN(parsedDate.getTime())
    ? null
    : new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
};

const parseReservationTime = (value) => {
  if (!value || value === 'N/A') return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minutes > 59 || (meridiem && (hours < 1 || hours > 12)) || (!meridiem && hours > 23)) {
    return null;
  }
  if (meridiem) hours = hours % 12 + (meridiem === 'PM' ? 12 : 0);
  return { hours, minutes };
};

const getReservationSchedules = (reservation) => {
  const facilities = Array.isArray(reservation.facilities) ? reservation.facilities : [];
  if (facilities.length === 0) {
    return Array.isArray(reservation.schedule) ? reservation.schedule : [];
  }

  return facilities.flatMap((facilityId) => (
    Array.isArray(reservation.facilitySchedules?.[facilityId])
      ? reservation.facilitySchedules[facilityId]
      : Array.isArray(reservation.schedule) ? reservation.schedule : []
  ));
};

const getScheduleDateTime = (entry, field) => {
  const date = parseReservationDate(entry.date);
  const time = parseReservationTime(entry[field]);
  if (!date || !time) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hours, time.minutes);
};

const getScheduledReservationEndDateTime = (reservation) => {
  return getReservationSchedules(reservation)
    .map((entry) => {
      const endDateTime = getScheduleDateTime(entry, 'endTime');
      const startTime = parseReservationTime(entry.startTime);
      const endTime = parseReservationTime(entry.endTime);
      if (
        !endDateTime
        || !startTime
        || !endTime
        || endTime.hours * 60 + endTime.minutes <= startTime.hours * 60 + startTime.minutes
      ) return null;
      return endDateTime;
    })
    .filter(Boolean)
    .reduce((latest, dateTime) => !latest || dateTime > latest ? dateTime : latest, null);
};

const getScheduledReservationStartDateTime = (reservation) => (
  getReservationSchedules(reservation)
    .map((entry) => getScheduleDateTime(entry, 'startTime'))
    .filter(Boolean)
    .reduce((earliest, dateTime) => !earliest || dateTime < earliest ? dateTime : earliest, null)
);

const getReservationEndDateTime = (reservation, eventDate) => {
  const explicitEndDate = parseReservationDate(reservation.endDate);
  const endDate = explicitEndDate || new Date(eventDate);
  if (!explicitEndDate) {
    endDate.setDate(endDate.getDate() + Math.max(1, Number(reservation.days) || 1) - 1);
  }

  const endTime = parseReservationTime(reservation.endTime);
  return endTime
    ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), endTime.hours, endTime.minutes)
    : new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59);
};

const getExpiredReservationType = (reservation, now = new Date()) => {
  const status = (reservation.status || '').toLowerCase().trim();

  if (status === 'approved') {
    const scheduledEnd = getScheduledReservationEndDateTime(reservation);
    const eventDate = parseReservationDate(reservation.eventDate || reservation.date);
    if (scheduledEnd) return now > scheduledEnd ? 'approved' : null;
    if (!eventDate) return null;
    return now > getReservationEndDateTime(reservation, eventDate) ? 'approved' : null;
  }

  if (status === 'pending') {
    const scheduledStart = getScheduledReservationStartDateTime(reservation);
    if (scheduledStart) return now > scheduledStart ? 'pending' : null;

    const eventDate = parseReservationDate(reservation.eventDate || reservation.date);
    if (!eventDate) return null;
    const startTime = parseReservationTime(reservation.startTime);
    const startDateTime = startTime
      ? new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), startTime.hours, startTime.minutes)
      : new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 23, 59, 59);
    return now > startDateTime ? 'pending' : null;
  }

  return null;
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return toDate(value.toDate());
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const commitArchiveWrites = async (db, expiredReservations, now) => {
  for (let index = 0; index < expiredReservations.length; index += ARCHIVE_BATCH_SIZE) {
    const batch = db.batch();
    expiredReservations.slice(index, index + ARCHIVE_BATCH_SIZE).forEach(({ document, type }) => {
      const data = document.data();
      const archivedAt = now.toISOString();
      const archiveData = { ...data };
      delete archiveData.id;

      if (type === 'pending') {
        archiveData.status = 'Expired';
        archiveData.expiredAt = archivedAt;
        archiveData.historyLogs = [
          ...(Array.isArray(data.historyLogs) ? data.historyLogs : []),
          {
            id: `expired-${randomUUID()}`,
            role: 'System',
            badge: 'Expired',
            date: archivedAt,
            approverName: 'System',
            text: 'Pending reservation expired after its scheduled start date and time.',
            state: 'expired'
          }
        ];
      }

      batch.set(db.collection('archive').doc(document.id), {
        ...archiveData,
        archivedAt: archiveData.archivedAt || archivedAt
      }, { merge: true });
      batch.delete(document.ref);
    });
    await batch.commit();
  }
};

const deleteExpiredArchiveRecords = async (db, now) => {
  const snapshot = await db.collection('archive').get();
  const retentionCutoff = new Date(now);
  retentionCutoff.setDate(retentionCutoff.getDate() - ARCHIVE_RETENTION_DAYS);
  const oldDocuments = snapshot.docs.filter((document) => {
    const data = document.data();
    const archiveDate = toDate(data.archivedAt || data.expiredAt);
    return archiveDate && archiveDate < retentionCutoff;
  });

  for (let index = 0; index < oldDocuments.length; index += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    oldDocuments.slice(index, index + DELETE_BATCH_SIZE).forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }

  return oldDocuments.length;
};

const runCleanup = async () => {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  const now = new Date();

  console.log('Starting scheduled reservation and archive cleanup...');
  const reservationsSnapshot = await db.collection('reservations').get();
  const expiredReservations = reservationsSnapshot.docs
    .map((document) => ({
      document,
      type: getExpiredReservationType(document.data(), now)
    }))
    .filter(({ type }) => type);

  await commitArchiveWrites(db, expiredReservations, now);
  console.log(`Archived ${expiredReservations.length} expired reservation(s).`);

  const deletedArchiveCount = await deleteExpiredArchiveRecords(db, now);
  console.log(`Permanently deleted ${deletedArchiveCount} archive record(s) older than ${ARCHIVE_RETENTION_DAYS} days.`);
};

if (require.main === module) {
  runCleanup().catch((error) => {
    console.error('Error during scheduled cleanup:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  getExpiredReservationType,
  parseReservationDate,
  parseReservationTime
};
