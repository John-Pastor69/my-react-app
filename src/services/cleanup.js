const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function runArchiveCleanup() {
  console.log("Starting 30-day archive database cleanup...");
  try {
    const snapshot = await db.collection('archive').get();
    const batch = db.batch();
    let deleteCount = 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    snapshot.forEach(doc => {
      const res = doc.data();
      const archiveTimestampStr = res.archivedAt || res.expiredAt;
      
      if (archiveTimestampStr) {
        const archiveDate = new Date(archiveTimestampStr);
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