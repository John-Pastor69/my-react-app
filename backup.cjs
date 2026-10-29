const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// 1. Load your secure Service Account Key
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase using the new modular syntax
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function backupCollections() {
  const collectionsToBackup = ['archive', 'reservations', 'users', 'super_users', 'facilities', 'equipments', 'utilities', 'app_settings'];
  const dateStr = new Date().toISOString().split('T')[0];
  const backupDirectory = path.join(__dirname, 'backup');
  fs.mkdirSync(backupDirectory, { recursive: true });

  for (const collectionName of collectionsToBackup) {
    console.log(`\nStarting backup for collection: ${collectionName}...`);
    
    const snapshot = await db.collection(collectionName).get();
    
    const backupData = [];
    snapshot.forEach(doc => {
      backupData.push({ 
        id: doc.id, 
        ...doc.data() 
      });
    });

    const filename = path.join(backupDirectory, `${collectionName}_backup_${dateStr}.json`);
    fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
    
    console.log(`Successfully backed up ${snapshot.size} documents to ${filename}`);
  }
  
  console.log(' All backups completed successfully!');
}

backupCollections().catch(console.error);