/**
 * Quick debug script: test Firestore write to position_catalog
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const env = process.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
};

console.log('Firebase config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
});

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testWrite() {
  console.log('\n=== Testing Firestore Write ===');
  
  try {
    // 1. Try reading the collection first
    console.log('1. Reading position_catalog...');
    const snap = await getDocs(collection(db, 'position_catalog'));
    console.log(`   Found ${snap.size} docs`);
    
    // 2. Try writing a test document
    console.log('2. Writing test doc...');
    const testId = `test_debug_${Date.now()}`;
    const ref = doc(db, 'position_catalog', testId);
    await setDoc(ref, {
      key: 'testDebug',
      label: 'Test Debug Position',
      shortLabel: 'Test',
      group: 'non_surgical',
      isSurgeryParticipant: false,
      sortOrder: 999,
      active: true,
      id: testId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    console.log('   ✅ Write SUCCESS! docId:', testId);
    
    // 3. Read it back
    console.log('3. Reading back...');
    const snap2 = await getDocs(collection(db, 'position_catalog'));
    console.log(`   Found ${snap2.size} docs after write`);
    snap2.docs.forEach(d => {
      console.log(`   - ${d.id}: ${d.data().label}`);
    });
    
    console.log('\n✅ Firestore is working. The issue is in the UI code.');
  } catch (error: any) {
    console.error('\n❌ Firestore ERROR:', error.code, error.message);
    if (error.code === 'permission-denied') {
      console.log('   → Firestore rules are blocking writes. Deploy rules first.');
    }
  }
  
  process.exit(0);
}

testWrite();
