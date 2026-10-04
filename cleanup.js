const admin = require('firebase-admin');

// Parse the secret key from GitHub Actions
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Your exact expiration logic from Schedule.jsx
const isExpired = (eventDate, endTime, days = 1) => {
  if (!eventDate) return false;
  const now = new Date();
  let endDateTime;
  
  const [month, day, year] = eventDate.split('/');
  if (!month || !day || !year) return false;

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

// The function that fetches and deletes expired documents
async function runCleanup() {
  console.log("Starting hourly database cleanup...");
  try {
    const snapshot = await db.collection('reservations').get();
    const batch = db.batch();
    let deleteCount = 0;

    snapshot.forEach(doc => {
      const res = doc.data();
      if (isExpired(res.eventDate, res.endTime, res.days)) {
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
    process.exit(1); // Fail the GitHub Action if there is an error
  }
}

runCleanup();