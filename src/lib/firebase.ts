import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration
// These are public client-side keys - security is handled through Firebase Security Rules
const firebaseConfig = {
  apiKey: 'AIzaSyB-PV4zMN3cetCj3vC40NN2Au056ztR0BI',
  authDomain: 'streamwatch-2dfd2.firebaseapp.com',
  projectId: 'streamwatch-2dfd2',
  storageBucket: 'streamwatch-2dfd2.firebasestorage.app',
  messagingSenderId: '500362425893',
  appId: '1:500362425893:web:1f961bba1c012d5c38b1cc',
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

export function initializeFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
  return { app, auth, db };
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    initializeFirebase();
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    initializeFirebase();
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    initializeFirebase();
  }
  return db;
}

// Type augmentation for Vite's ImportMeta
declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_FIREBASE_API_KEY: string;
      readonly VITE_FIREBASE_AUTH_DOMAIN: string;
      readonly VITE_FIREBASE_PROJECT_ID: string;
      readonly VITE_FIREBASE_STORAGE_BUCKET: string;
      readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
      readonly VITE_FIREBASE_APP_ID: string;
      readonly VITE_SUBSOURCE_API_KEY: string;
      readonly VITE_TMDB_API_KEY: string;
      readonly MODE: string;
      readonly DEV: boolean;
      readonly PROD: boolean;
    };
  }
}
