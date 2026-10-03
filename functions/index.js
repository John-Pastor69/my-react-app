const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// Helper to check if event has expired based on Date, End Time, and Duration (days)
const isExpired = (eventDate, endTime, days = 1) => {
  if (!eventDate) return false;
  const now = new Date();
  let endDateTime;
  
  const parts = eventDate.split('/');
  if (parts.length !== 3) return false;
  const [month, day, year] = parts;

  const parsedDays = parseInt(days, 10) || 1;
  const baseDate = new Date(year, month - 1, day);
  baseDate.setDate(baseDate.getDate() + (parsedDays - 1));

  const endYear = baseDate.getFullYear();
  const endMonth = baseDate.getMonth();
  const endDay = baseDate.getDate();
  
  if (endTime && endTime !== 'N/A') {
    const match = endTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let [ , hours, minutes, modifier ] = match;
      hours = parseInt(hours, 10);
      if (hours === 12 && modifier.toUpperCase() === 'AM') hours = 0;
      if (hours < 12 && modifier.toUpperCase() === 'PM') hours += 12;
      
      endDateTime = new Date(endYear, endMonth, endDay, hours, minutes);
    }
  }
  
  if (!endDateTime) {
    endDateTime = new Date(endYear, endMonth, endDay, 23, 59, 59);
  }

  return now > endDateTime;
};

// Scheduled Cloud Function that runs every hour on Google's servers
exports.cleanupExpiredReservations = onSchedule("every 1 hours", async (event) => {
  try {
    const snapshot = await db.collection("reservations").get();
    const batch = db.batch();
    let count = 0;

    snapshot.forEach((docSnap) => {
      const res = docSnap.data();
      if (isExpired(res.eventDate, res.endTime, res.days)) {
        batch.delete(docSnap.ref);
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`Successfully auto-deleted ${count} expired reservations server-side.`);
    }
  } catch (error) {
    console.error("Error running cleanup function:", error);
  }
  return null;
});