const admin = require('firebase-admin');

// Parse the secret key from GitHub Actions
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Updated expiration logic matching Schedule.jsx[cite: 34]
const isExpired = (eventDate, endDate, startTime, endTime, status, days = 1) => {
  if (!eventDate) return false;
  const now = new Date();
  
  const [month, day, year] = eventDate.split('/').map(Number);
  if (!month || !day || !year) return false;

  const isApproved = (status || '').toLowerCase() === 'approved';

  // Rule 1: If eventDate is today and hasn't gotten approved yet, account for startTime (if added)
  const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDateOnly = new Date(year, month - 1, day);
  const isToday = eventDateOnly.getTime() === todayDateOnly.getTime();

  if (isToday && !isApproved) {
    if (startTime && startTime !== 'N/A') {
      const matchStart = startTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (matchStart) {
        let [ , sHours, sMins, sMod ] = matchStart;
        sHours = parseInt(sHours, 10);
        if (sHours === 12 && sMod.toUpperCase() === 'AM') sHours = 0;
        if (sHours < 12 && sMod.toUpperCase() === 'PM') sHours += 12;
        const startDateTime = new Date(year, month - 1, day, sHours, parseInt(sMins, 10));
        if (now > startDateTime) return true;
      }
    } else {
      const endOfToday = new Date(year, month - 1, day, 23, 59, 59);
      if (now > endOfToday) return true;
    }
  }

  // Rule 2 & 3: Calculate final expiration date (accounting for endDate or multi-day span)
  let finalYear = year, finalMonth = month - 1, finalDay = day;
  
  if (endDate) {
    const [em, ed, ey] = endDate.split('/').map(Number);
    if (em && ed && ey) {
      finalYear = ey;
      finalMonth = em - 1;
      finalDay = ed;
    }
  } else {
    const parsedDays = parseInt(days, 10) || 1;
    const baseDate = new Date(year, month - 1, day);
    baseDate.setDate(baseDate.getDate() + (parsedDays - 1));
    finalYear = baseDate.getFullYear();
    finalMonth = baseDate.getMonth();
    finalDay = baseDate.getDate();
  }
  
  let endDateTime;
  if (endTime && endTime !== 'N/A') {
    const match = endTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let [ , hours, minutes, modifier ] = match;
      hours = parseInt(hours, 10);
      if (hours === 12 && modifier.toUpperCase() === 'AM') hours = 0;
      if (hours < 12 && modifier.toUpperCase() === 'PM') hours += 12;
      
      endDateTime = new Date(finalYear, finalMonth, finalDay, hours, parseInt(minutes, 10));
    }
  }
  
  if (!endDateTime) {
    endDateTime = new Date(finalYear, finalMonth, finalDay, 23, 59, 59);
  }

  return now > endDateTime;
};

// The function that fetches and deletes expired documents
async function runCleanup() {
  console.log("Starting hourly database cleanup...");
  try {
    const snapshot = await db.collection('reservations').get();
    const batch = db.batch();
    let deleteCount = 0;

    snapshot.forEach(doc => {
      const res = doc.data();
      if (isExpired(res.eventDate, res.endDate, res.startTime, res.endTime, res.status, res.days)) {
        batch.delete(doc.ref);
        deleteCount++;
      }
    });

    if (deleteCount > 0) {
      await batch.commit();
      console.log(`Successfully deleted ${deleteCount} expired reservation(s).`);
    } else {
      console.log("No expired reservations found.");
    }
  } catch (error) {
    console.error("Error during cleanup:", error);
    process.exit(1); 
  }
}

runCleanup();