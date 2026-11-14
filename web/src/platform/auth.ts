// Web replacement for ../src/lib/auth.ts (swapped in at build time for `@/lib/auth`).
// Same Firebase app/config as the extension, so the same Google account gives the same uid.
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/** Demo mode (`npm run demo`) never touches Firebase auth. */
export const IS_DEMO = (import.meta as any).env?.VITE_DEMO === '1';

const DEMO_USER: AuthUser = { uid: 'test-user', email: 'tester@example.com', displayName: 'Test User', photoURL: null };
const DEMO_SIGNED_OUT = 'harness:signedOut'; // same flag as dev-harness/useAuth.mock.ts
const demoUser = (): AuthUser | null => (localStorage.getItem(DEMO_SIGNED_OUT) ? null : DEMO_USER);

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL };
}

export async function signInWithGoogle(): Promise<AuthUser> {
  if (IS_DEMO) {
    localStorage.removeItem(DEMO_SIGNED_OUT);
    return DEMO_USER;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(getFirebaseAuth(), provider);
  return toAuthUser(result.user)!;
}

export async function signOut(): Promise<void> {
  if (IS_DEMO) {
    localStorage.setItem(DEMO_SIGNED_OUT, '1');
    return;
  }
  await firebaseSignOut(getFirebaseAuth());
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (IS_DEMO) return demoUser();
  return toAuthUser(getFirebaseAuth().currentUser);
}

export function onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
  if (IS_DEMO) {
    setTimeout(() => callback(demoUser()), 0);
    return () => {};
  }
  return onAuthStateChanged(getFirebaseAuth(), (u) => callback(toAuthUser(u)));
}

/** Resolves once Firebase has restored (or not) the persisted session. */
export function initAuth(): Promise<AuthUser | null> {
  if (IS_DEMO) return Promise.resolve(demoUser());
  const auth = getFirebaseAuth();
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (u) => {
        unsubscribe();
        resolve(toAuthUser(u));
      },
      () => {
        unsubscribe();
        resolve(null);
      }
    );
  });
}

/** Firebase ID token for the streaming server; null when signed out. */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (IS_DEMO) return demoUser() ? 'demo-token' : null;
  const auth = getFirebaseAuth();
  // the persisted session may not be restored yet on first load
  if (!auth.currentUser) await initAuth();
  const user = auth.currentUser;
  return user ? user.getIdToken(forceRefresh) : null;
}
