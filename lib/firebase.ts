import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Validate env vars exist
const requiredEnvs = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_DATABASE_URL'
];

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

// Check if any required env var is missing
const isMissingEnv = requiredEnvs.some(key => !env[key]);

if (isMissingEnv) {
    console.warn("Firebase config is missing in .env.local. App will fallback to offline/localStorage mode or fail.");
}

const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);        // Realtime Database
const firestore = getFirestore(app); // Firestore
const auth = getAuth(app);          // Authentication

export { db, firestore, auth };
