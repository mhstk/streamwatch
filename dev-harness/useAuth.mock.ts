// Harness stand-in for src/hooks/useAuth.ts: always signed in as a test user.
import { useState } from 'react';

const TEST_USER = { uid: 'test-user', email: 'tester@example.com', displayName: 'Test User', photoURL: null };

export function useAuth() {
  const [user, setUser] = useState<typeof TEST_USER | null>(
    localStorage.getItem('harness:signedOut') ? null : TEST_USER
  );
  return {
    user,
    isLoading: false,
    error: null as string | null,
    signIn: async () => { localStorage.removeItem('harness:signedOut'); setUser(TEST_USER); },
    logOut: async () => { localStorage.setItem('harness:signedOut', '1'); setUser(null); },
  };
}
