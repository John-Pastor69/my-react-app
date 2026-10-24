const admin = require('firebase-admin');

// Parse the secret key from GitHub Actions
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// The function that fetches and deletes old archive documents
async function runArchiveCleanup() {
  console.log("Starting 30-day archive database cleanup...");
  try {
    const snapshot = await db.collection('archive').get();
    const batch = db.batch();
    let deleteCount = 0;

    // Calculate the exact date and time 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    snapshot.forEach(doc => {
      const res = doc.data();
      
      // Your reservationExpiration.js saves the timestamp as either archivedAt or expiredAt
      const archiveTimestampStr = res.archivedAt || res.expiredAt;
      
      if (archiveTimestampStr) {
        const archiveDate = new Date(archiveTimestampStr);
        
        // If the document was archived more than 30 days ago, mark it for deletion
        if (archiveDate < thirtyDaysAgo) {
          batch.delete(doc.ref);
          deleteCount++;
        }
      }
    });

    if (deleteCount > 0) {
      await batch.commit();
      console.log(`Successfully permanently deleted ${deleteCount} old record(s) from the archive.`);
    } else {
      console.log("No records older than 30 days found in the archive.");
    }
  } catch (error) {
    console.error("Error during archive cleanup:", error);
    process.exit(1); 
  }
}

runArchiveCleanup();