// Web replacement for ../src/lib/auth.ts (swapped in at build time for `@/lib/auth`).
// Same Firebase project as the extension, so the same Google account gives the same uid.
// Sign-in runs as a popup or as a same-origin redirect depending on ./authMode (README "Sign-in").
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { isSameOriginSignIn, markRedirectPending } from './authMode';

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

// ---- redirect completion (same-origin sign-in mode only) -------------------------

let redirectDone: Promise<void> | null = null;
let redirectError: unknown = null;

/** Finishes a redirect sign-in that brought us back to this page. Runs once per page load; never rejects. */
function completeRedirect(): Promise<void> {
  if (IS_DEMO || !isSameOriginSignIn()) return Promise.resolve();
  if (!redirectDone) {
    redirectDone = getRedirectResult(getFirebaseAuth())
      .then(() => undefined)
      .catch((err) => {
        const code = (err as { code?: string })?.code;
        if (code !== 'auth/redirect-cancelled-by-user') redirectError = err;
      })
      .finally(() => markRedirectPending(false));
  }
  return redirectDone;
}

/**
 * Error from completing a redirect sign-in on this page load, or null. Read after `initAuth()` resolves
 * (useAuth shows it through its `error`).
 */
export function getRedirectError(): string | null {
  if (!redirectError) return null;
  return redirectError instanceof Error ? redirectError.message : 'Sign in failed';
}

// ---- API (same shape as ../src/lib/auth.ts) --------------------------------------

export async function signInWithGoogle(): Promise<AuthUser> {
  if (IS_DEMO) {
    localStorage.removeItem(DEMO_SIGNED_OUT);
    return DEMO_USER;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (isSameOriginSignIn()) {
    redirectError = null;
    markRedirectPending(true);
    try {
      // navigates away; the result is picked up by completeRedirect() when the page loads again
      return await signInWithRedirect(getFirebaseAuth(), provider);
    } catch (err) {
      markRedirectPending(false);
      throw err;
    }
  }
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

/**
 * Resolves once Firebase has restored (or not) the persisted session, and, in same-origin sign-in
 * mode, once a pending redirect sign-in has been completed. Never rejects for a redirect failure
 * (see getRedirectError).
 */
export function initAuth(): Promise<AuthUser | null> {
  if (IS_DEMO) return Promise.resolve(demoUser());
  const auth = getFirebaseAuth();
  return completeRedirect().then(
    () =>
      new Promise((resolve) => {
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
      })
  );
}

/** Firebase ID token for the streaming server; null when signed out. */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (IS_DEMO) return demoUser() ? 'demo-token' : null;
  const auth = getFirebaseAuth();
  // the persisted session (or a redirect sign-in) may not be restored yet on first load
  if (!auth.currentUser) await initAuth();
  const user = auth.currentUser;
  return user ? user.getIdToken(forceRefresh) : null;
}
