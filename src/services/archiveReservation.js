import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../Firebase';

export const archiveReservations = async (reservations) => {
  for (let index = 0; index < reservations.length; index += 200) {
    const batch = writeBatch(db);
    reservations.slice(index, index + 200).forEach(({ id, data }) => {
      const archivedData = { ...data };
      delete archivedData.id;

      batch.set(doc(db, 'archive', id), {
        ...archivedData,
        archivedAt: archivedData.archivedAt || new Date().toISOString()
      }, { merge: true });
      batch.delete(doc(db, 'reservations', id));
    });
    await batch.commit();
  }
};

export const archiveReservation = async (reservationId, reservationData) => {
  await archiveReservations([{ id: reservationId, data: reservationData }]);
};
