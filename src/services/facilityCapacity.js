import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../Firebase';
import { getParticipantsForFacility } from './reservationConflicts';
import { isReservationActive } from './reservationStatus';

export const isReservationIncludedInFacilityCapacity = isReservationActive;

const parseCapacity = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity > 0 ? capacity : null;
};

export const syncFacilityRemainingCapacities = async () => {
  const [facilitiesSnapshot, reservationsSnapshot] = await Promise.all([
    getDocs(collection(db, 'facilities')),
    getDocs(collection(db, 'reservations'))
  ]);
  const reservedByFacility = new Map();

  reservationsSnapshot.docs.forEach((reservationDoc) => {
    const reservation = reservationDoc.data();
    if (!isReservationIncludedInFacilityCapacity(reservation)) return;

    (reservation.facilities || []).forEach((facilityId) => {
      const participants = getParticipantsForFacility(reservation, facilityId);
      if (!Number.isInteger(participants) || participants <= 0) return;
      reservedByFacility.set(
        facilityId,
        (reservedByFacility.get(facilityId) || 0) + participants
      );
    });
  });

  let batch = writeBatch(db);
  let batchCount = 0;
  const commits = [];

  facilitiesSnapshot.docs.forEach((facilityDoc) => {
    const facility = facilityDoc.data();
    const maxCapacity = Object.prototype.hasOwnProperty.call(facility, 'maxCapacity')
      ? parseCapacity(facility.maxCapacity)
      : parseCapacity(facility.capacity);
    const remainingCap = maxCapacity === null
      ? null
      : Math.max(0, maxCapacity - (reservedByFacility.get(facilityDoc.id) || 0));

    if (facility.remainingCap === remainingCap) return;

    batch.update(doc(db, 'facilities', facilityDoc.id), { remainingCap });
    batchCount += 1;
    if (batchCount === 450) {
      commits.push(batch.commit());
      batch = writeBatch(db);
      batchCount = 0;
    }
  });

  if (batchCount > 0) commits.push(batch.commit());
  await Promise.all(commits);
};
