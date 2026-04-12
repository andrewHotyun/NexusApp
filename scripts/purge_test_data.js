const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, getDocs, deleteDoc, doc, writeBatch } = require('firebase/firestore');

// 1. Manually parse .env file
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value;
  }
});

// 2. Initialize Firebase
const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function purgeTestData() {
  console.log('🚀 Starting Nexus Production Purge...');
  
  try {
    // 1. Fetch all users to find ones containing "Test"
    const usersSnap = await getDocs(collection(db, 'users'));
    const testUserIds = [];
    
    usersSnap.forEach(uDoc => {
      const data = uDoc.data();
      if (data.name && data.name.includes('Test')) {
        testUserIds.push(uDoc.id);
        console.log(`Found test user: ${data.name} (${uDoc.id})`);
      }
    });

    if (testUserIds.length === 0) {
      console.log('✅ No test users found.');
      process.exit(0);
    }

    const batch = writeBatch(db);

    // 2. Delete test users
    testUserIds.forEach(id => {
      batch.delete(doc(db, 'users', id));
    });

    // 3. Cleanup friendRequests
    const reqSnap = await getDocs(collection(db, 'friendRequests'));
    let reqCount = 0;
    reqSnap.forEach(rDoc => {
      const data = rDoc.data();
      if (testUserIds.includes(data.fromUserId) || testUserIds.includes(data.toUserId)) {
        batch.delete(doc(db, 'friendRequests', rDoc.id));
        reqCount++;
      }
    });
    console.log(`🧹 Identified ${reqCount} friend requests for deletion.`);

    // 4. Cleanup friends
    const friendsSnap = await getDocs(collection(db, 'friends'));
    let friendCount = 0;
    friendsSnap.forEach(fDoc => {
      const data = fDoc.data();
      if (testUserIds.includes(data.userId) || testUserIds.includes(data.friendId)) {
        batch.delete(doc(db, 'friends', fDoc.id));
        friendCount++;
      }
    });
    console.log(`🧹 Identified ${friendCount} friend links for deletion.`);

    console.log('⏳ Committing batch delete...');
    await batch.commit();
    console.log('✨ SUCCESS: The database is now production-clean!');
    process.exit(0);
  } catch (err) {
    console.error('❌ FATAL ERROR:', err.message);
    process.exit(1);
  }
}

purgeTestData();
