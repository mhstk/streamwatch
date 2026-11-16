// Web replacement for ../src/lib/firebase.ts (swapped in at build time for `@/lib/firebase` and the
// extension's relative `./firebase` imports). Same API and same Firebase project as the extension, so
// the same Google account gives the same uid and the same Firestore data.
//
// The only difference is authDomain: in same-origin sign-in mode (see ./authMode) it is this page's own
// host, whose /__/auth/* the streaming server proxies to firebaseapp.com.
//
// The config values are duplicated from ../src/lib/firebase.ts (which cannot be edited from here).
// They are public client identifiers, not secrets: access is enforced by Firebase Security Rules.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { isSameOriginSignIn } from './authMode';

const FIREBASE_AUTH_DOMAIN = 'streamwatch-2dfd2.firebaseapp.com';

const firebaseConfig = {
  apiKey: 'AIzaSyB-PV4zMN3cetCj3vC40NN2Au056ztR0BI',
  authDomain: isSameOriginSignIn() ? window.location.host : FIREBASE_AUTH_DOMAIN,
  projectId: 'streamwatch-2dfd2',
  storageBucket: 'streamwatch-2dfd2.firebasestorage.app',
  messagingSenderId: '500362425893',
  appId: '1:500362425893:web:1f961bba1c012d5c38b1cc',
};

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
  if (!app) initializeFirebase();
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) initializeFirebase();
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) initializeFirebase();
  return db;
}
