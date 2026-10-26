const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");

initializeApp();

const db = getFirestore();
const excludedReservationStatuses = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "expired",
  "archived",
]);

const parseCapacity = (value) => {
  if (value == null || String(value).trim() === "") return null;
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity > 0 ? capacity : null;
};

const updateFacilityRemainingCapacity = async (facilityId) => {
  const facilityRef = db.collection("facilities").doc(facilityId);
  const reservationsQuery = db
      .collection("reservations")
      .where(
          "facilities",
          "array-contains",
          facilityId,
      );

  await db.runTransaction(async (transaction) => {
    const facilitySnapshot = await transaction.get(facilityRef);
    if (!facilitySnapshot.exists) return;

    const facility = facilitySnapshot.data();
    const hasMaxCapacity = Object.prototype.hasOwnProperty.call(
        facility,
        "maxCapacity",
    );
    const maxCapacity = hasMaxCapacity ?
      parseCapacity(facility.maxCapacity) :
      parseCapacity(facility.capacity);
    const reservationsSnapshot = await transaction.get(reservationsQuery);
    const reservedCapacity = reservationsSnapshot.docs.reduce(
        (total, reservationDoc) => {
          const reservation = reservationDoc.data();
          const status = (reservation.status || "").toLowerCase().trim();
          if (excludedReservationStatuses.has(status)) return total;

          const participants = Number(reservation.expectedParticipants);
          const count = Number.isInteger(participants) && participants > 0 ?
            participants :
            0;
          return total + count;
        },
        0,
    );
    const remainingCap = maxCapacity === null ?
      null :
      Math.max(0, maxCapacity - reservedCapacity);

    if (facility.remainingCap !== remainingCap) {
      transaction.update(facilityRef, {remainingCap});
    }
  });
};

exports.updateFacilityRemainingCapacityOnReservationWrite = onDocumentWritten(
    "reservations/{reservationId}",
    async (event) => {
      const before = event.data.before.exists ? event.data.before.data() : null;
      const after = event.data.after.exists ? event.data.after.data() : null;
      const relevantFieldsChanged = !before || !after ||
        before.status !== after.status ||
        before.expectedParticipants !== after.expectedParticipants ||
        JSON.stringify(before.facilities || []) !==
          JSON.stringify(after.facilities || []);
      if (!relevantFieldsChanged) return;

      const facilityIds = new Set([
        ...((before && before.facilities) || []),
        ...((after && after.facilities) || []),
      ]);
      await Promise.all(
          [...facilityIds].map(
              (facilityId) => updateFacilityRemainingCapacity(facilityId),
          ),
      );
    },
);

exports.initializeFacilityRemainingCapacityOnWrite = onDocumentWritten(
    "facilities/{facilityId}",
    async (event) => {
      const before = event.data.before.exists ? event.data.before.data() : null;
      const after = event.data.after.exists ? event.data.after.data() : null;
      if (!after) return;

      const capacityChanged = !before ||
        before.capacity !== after.capacity ||
        before.maxCapacity !== after.maxCapacity;
      if (!capacityChanged) return;

      await updateFacilityRemainingCapacity(event.params.facilityId);
    },
);
