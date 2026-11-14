// Web replacement for ../src/hooks/useAuth.ts (swapped in for `@/hooks/useAuth` and the hooks' `./useAuth`).
// In demo mode this module is itself replaced by ../dev-harness/useAuth.mock.ts.
import { useState, useEffect, useCallback } from 'react';
import { type AuthUser, signInWithGoogle, signOut, initAuth, onAuthStateChange } from './auth';

interface UseAuthReturn {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    initAuth()
      .then((u) => {
        if (!active) return;
        setUser(u);
        setIsLoading(false);
      })
      .catch(() => active && setIsLoading(false));
    const unsubscribe = onAuthStateChange((u) => active && setUser(u));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setUser(await signInWithGoogle());
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(err instanceof Error ? err.message : 'Sign in failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logOut = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signOut();
      setUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { user, isLoading, error, signIn, logOut };
}
