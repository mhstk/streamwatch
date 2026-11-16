// How Google sign-in runs on this page load (see README "Sign-in").
//
// "redirect" (same-origin sign-in mode): the page is served over https from a real host. Firebase's
//   sign-in helper is reached on this same origin (the streaming server proxies /__/auth/* to
//   firebaseapp.com), authDomain is this host, and sign-in uses signInWithRedirect. This is the only
//   flow that works on iOS browsers, which block storage for the cross-site firebaseapp.com helper.
// "popup": everything else (localhost, plain http on a LAN address): authDomain stays
//   firebaseapp.com and sign-in uses signInWithPopup, as before.
//
// `?authmode=redirect|popup` in the address overrides the automatic choice for that page load.

export type AuthMode = 'redirect' | 'popup';

/** Set while a redirect sign-in is under way, so the returning page load finishes it in the same mode. */
const PENDING_KEY = 'streamwatch:authRedirectPending';

function readOverride(): AuthMode | null {
  try {
    const v = new URLSearchParams(window.location.search).get('authmode');
    return v === 'redirect' || v === 'popup' ? v : null;
  } catch {
    return null;
  }
}

function readPending(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

function automatic(): AuthMode {
  const { protocol, hostname } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  return protocol === 'https:' && !local ? 'redirect' : 'popup';
}

// Decided once per page load; authDomain and the sign-in method must agree.
export const AUTH_MODE: AuthMode = readOverride() ?? (readPending() ? 'redirect' : automatic());

export const isSameOriginSignIn = (): boolean => AUTH_MODE === 'redirect';

export function markRedirectPending(pending: boolean): void {
  try {
    if (pending) sessionStorage.setItem(PENDING_KEY, '1');
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable: the automatic choice still applies on return */
  }
}
