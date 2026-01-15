import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * Sign in with Google using Chrome Identity API
 * This is required for Chrome extensions since popup/redirect auth doesn't work
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    // Get OAuth token from Chrome Identity API
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!token) {
        reject(new Error('No token received'));
        return;
      }

      try {
        // Create credential from Google OAuth token
        const credential = GoogleAuthProvider.credential(null, token);
        const auth = getFirebaseAuth();

        // Sign in to Firebase with the credential
        const result = await signInWithCredential(auth, credential);
        const user = result.user;

        const authUser: AuthUser = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        };

        // Store auth state in chrome.storage for persistence
        await chrome.storage.local.set({ authUser });

        resolve(authUser);
      } catch (error) {
        // If Firebase auth fails, revoke the token and try again
        chrome.identity.removeCachedAuthToken({ token }, () => {
          reject(error);
        });
      }
    });
  });
}

/**
 * Sign out from both Firebase and Chrome Identity
 */
export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();

  // Sign out from Firebase
  await firebaseSignOut(auth);

  // Clear stored auth state
  await chrome.storage.local.remove('authUser');

  // Revoke the Chrome Identity token
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        // Revoke the token
        chrome.identity.removeCachedAuthToken({ token }, () => {
          // Also revoke from Google's servers
          fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
            .finally(() => resolve());
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get the current authenticated user
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  // First check chrome.storage for persisted state
  const result = await chrome.storage.local.get('authUser');
  if (result.authUser) {
    return result.authUser as AuthUser;
  }

  // Fall back to Firebase auth state
  const auth = getFirebaseAuth();
  const user = auth.currentUser;

  if (user) {
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
  }

  return null;
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
  const auth = getFirebaseAuth();

  return onAuthStateChanged(auth, (firebaseUser: User | null) => {
    if (firebaseUser) {
      const authUser: AuthUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
      };
      callback(authUser);
    } else {
      callback(null);
    }
  });
}

/**
 * Initialize auth - call this on app startup
 */
export async function initAuth(): Promise<AuthUser | null> {
  // Try to restore session from storage
  const storedUser = await getCurrentUser();

  if (storedUser) {
    // Verify the token is still valid by trying to get a fresh one
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, async (token) => {
        if (token) {
          // Token is still valid
          resolve(storedUser);
        } else {
          // Token expired, clear stored state
          await chrome.storage.local.remove('authUser');
          resolve(null);
        }
      });
    });
  }

  return null;
}
