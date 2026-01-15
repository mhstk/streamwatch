import { useState, useEffect, useCallback } from 'react';
import { AuthUser, signInWithGoogle, signOut, initAuth, onAuthStateChange } from '@/lib/auth';
import { initializeFirebase } from '@/lib/firebase';
import { logger } from '@/lib/logger';

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
    logger.info('auth', 'useAuth initializing...');

    // Initialize Firebase
    initializeFirebase();
    logger.debug('auth', 'Firebase initialized');

    // Initialize auth and restore session
    initAuth()
      .then((storedUser) => {
        logger.info('auth', 'Auth init complete', { hasUser: !!storedUser, uid: storedUser?.uid });
        setUser(storedUser);
        setIsLoading(false);
      })
      .catch((err) => {
        logger.error('auth', 'Auth init error', err);
        setIsLoading(false);
      });

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChange((authUser) => {
      logger.debug('auth', 'Auth state changed', { hasUser: !!authUser });
      setUser(authUser);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const authUser = await signInWithGoogle();
      setUser(authUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      console.error('Sign in error:', err);
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
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setError(message);
      console.error('Sign out error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { user, isLoading, error, signIn, logOut };
}
