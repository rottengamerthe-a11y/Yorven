/**
 * Dashboard Authentication & Session Context
 * Yorven SEO Dashboard — Phase 2 Step 2.4
 * Follows Revision 11 Final Architecture strictly.
 *
 * Security Invariants:
 * - Access JWT stored strictly in JS memory (React state).
 * - Zero token persistence in localStorage or sessionStorage.
 * - Tab coordination using Web Locks API ('yorven-token-refresh') with follower polling.
 * - Authoritative logout clears memory state and revokes session via server.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  loginApi,
  mfaVerifyApi,
  getActiveTokenApi,
  refreshTokenApi,
  logoutApi
} from '../api/dashboardClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState('loading'); // 'loading' | 'unauthenticated' | 'mfa_pending' | 'authenticated'
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [mfaData, setMfaData] = useState(null); // { factorId, challengeId, email }
  const [authError, setAuthError] = useState(null);

  // In-memory ref to hold token for immediate reading in async interceptors
  const tokenRef = useRef(null);
  tokenRef.current = accessToken;

  // Track expiry timer
  const refreshTimerRef = useRef(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  /**
   * Schedules a token refresh 60 seconds before expiration.
   */
  const scheduleTokenRefresh = useCallback((expiresInSeconds) => {
    clearRefreshTimer();
    if (!expiresInSeconds || expiresInSeconds <= 0) return;

    // Refresh 60 seconds before expiration, minimum 10 seconds
    const refreshDelayMs = Math.max(10, expiresInSeconds - 60) * 1000;
    refreshTimerRef.current = setTimeout(() => {
      acquireFreshToken();
    }, refreshDelayMs);
  }, [clearRefreshTimer]);

  /**
   * Refreshes token using Web Locks API to ensure exactly one leader tab refreshes.
   */
  const acquireFreshToken = useCallback(async () => {
    if (typeof window === 'undefined') return null;

    const performRefresh = async () => {
      try {
        const data = await refreshTokenApi();
        const token = typeof data?.accessToken === 'string' && data.accessToken.trim().length > 0
          ? data.accessToken.trim()
          : (typeof data?.access_token === 'string' && data.access_token.trim().length > 0 ? data.access_token.trim() : null);

        const rawExpires = data?.expiresIn !== undefined ? data.expiresIn : data?.expires_in;
        const expiresIn = (typeof rawExpires === 'number' && Number.isFinite(rawExpires) && rawExpires > 0)
          ? rawExpires
          : 3600;

        if (!token) {
          // If response lacks a valid token string, preserve existing token and do not overwrite with undefined
          return tokenRef.current;
        }

        setAccessToken(token);
        tokenRef.current = token;
        setAuthState('authenticated');
        scheduleTokenRefresh(expiresIn);
        return token;
      } catch (err) {
        if (err.status === 401 || err.status === 403) {
          setAccessToken(null);
          tokenRef.current = null;
          setUser(null);
          setAuthState('unauthenticated');
        }
        return null;
      }
    };

    if ('locks' in navigator) {
      try {
        return await navigator.locks.request('yorven-token-refresh', { ifAvailable: true }, async (lock) => {
          if (!lock) {
            // Another tab is currently leader refreshing; poll /api/auth/token as follower
            await new Promise(r => setTimeout(r, 1200));
            const check = await getActiveTokenApi();
            if (check.ok && typeof check.accessToken === 'string' && check.accessToken.trim().length > 0) {
              const token = check.accessToken.trim();
              const expiresIn = (typeof check.expiresIn === 'number' && Number.isFinite(check.expiresIn) && check.expiresIn > 0)
                ? check.expiresIn
                : 3600;
              setAccessToken(token);
              tokenRef.current = token;
              setAuthState('authenticated');
              scheduleTokenRefresh(expiresIn);
              return token;
            }
            return null;
          }
          return await performRefresh();
        });
      } catch {
        return await performRefresh();
      }
    } else {
      return await performRefresh();
    }
  }, [scheduleTokenRefresh]);

  /**
   * Bootstraps session on initial mount via GET /api/auth/token.
   */
  const checkSession = useCallback(async () => {
    if (typeof window === 'undefined') {
      setAuthState('unauthenticated');
      return;
    }

    // Only discover session on dashboard routes (/dashboard, /dashboard/*)
    const path = window.location.pathname;
    if (path !== '/dashboard' && !path.startsWith('/dashboard/')) {
      setAuthState('unauthenticated');
      return;
    }

    try {
      const res = await getActiveTokenApi();

      if (res.ok && typeof res.accessToken === 'string' && res.accessToken.trim().length > 0) {
        const token = res.accessToken.trim();
        const expiresIn = (typeof res.expiresIn === 'number' && Number.isFinite(res.expiresIn) && res.expiresIn > 0)
          ? res.expiresIn
          : 3600;
        setAccessToken(token);
        tokenRef.current = token;
        setAuthState('authenticated');
        scheduleTokenRefresh(expiresIn);
        return;
      }

      if (res.ok && res.status === 'refresh_required') {
        const fresh = await acquireFreshToken();
        if (fresh) return;
      }

      if (res.ok && res.status === 'refresh_in_progress') {
        // Wait and poll once more
        const delay = (typeof res.retryAfter === 'number' && res.retryAfter > 0 ? res.retryAfter : 1) * 1000;
        await new Promise(r => setTimeout(r, delay));
        const retry = await getActiveTokenApi();
        if (retry.ok && typeof retry.accessToken === 'string' && retry.accessToken.trim().length > 0) {
          const token = retry.accessToken.trim();
          const expiresIn = (typeof retry.expiresIn === 'number' && Number.isFinite(retry.expiresIn) && retry.expiresIn > 0)
            ? retry.expiresIn
            : 3600;
          setAccessToken(token);
          tokenRef.current = token;
          setAuthState('authenticated');
          scheduleTokenRefresh(expiresIn);
          return;
        }
      }

      // No active session
      setAccessToken(null);
      tokenRef.current = null;
      setUser(null);
      setAuthState('unauthenticated');
    } catch {
      setAccessToken(null);
      tokenRef.current = null;
      setUser(null);
      setAuthState('unauthenticated');
    }
  }, [scheduleTokenRefresh, acquireFreshToken]);

  useEffect(() => {
    checkSession();
    return () => clearRefreshTimer();
  }, [checkSession, clearRefreshTimer]);

  /**
   * Step 1: Submit primary email + password.
   */
  const login = async (email, password) => {
    setAuthError(null);
    try {
      const res = await loginApi(email, password);
      const isMfa = Boolean(res?.mfaRequired || res?.mfa_required);
      const factorId = res?.factorId || res?.factor_id;
      const challengeId = res?.challengeId || res?.challenge_id;

      if (isMfa && typeof factorId === 'string' && factorId.trim() && typeof challengeId === 'string' && challengeId.trim()) {
        setMfaData({
          factorId: factorId.trim(),
          challengeId: challengeId.trim(),
          email: email.trim()
        });
        setAuthState('mfa_pending');
        return { success: true, mfaRequired: true };
      }

      const msg = 'Invalid or malformed authentication challenge received from server.';
      setAuthError(msg);
      return { success: false, error: msg };
    } catch (err) {
      const msg = err.status === 429
        ? 'Too many login attempts. Please wait 15 minutes before trying again.'
        : (err.message && !err.message.includes('object Object') ? err.message : 'Invalid credentials. Please verify your email and password.');
      setAuthError(msg);
      return { success: false, error: msg };
    }
  };

  /**
   * Step 2: Submit 6-digit TOTP MFA verification code.
   */
  const verifyMfa = async (code) => {
    setAuthError(null);
    try {
      const data = await mfaVerifyApi(code);
      const token = typeof data?.accessToken === 'string' && data.accessToken.trim().length > 0
        ? data.accessToken.trim()
        : (typeof data?.access_token === 'string' && data.access_token.trim().length > 0 ? data.access_token.trim() : null);

      const rawExpires = data?.expiresIn !== undefined ? data.expiresIn : data?.expires_in;
      const expiresIn = (typeof rawExpires === 'number' && Number.isFinite(rawExpires) && rawExpires > 0)
        ? rawExpires
        : 3600;

      if (!token) {
        const msg = 'Authentication verification failed: server returned an invalid or missing token.';
        setAuthError(msg);
        return { success: false, error: msg };
      }

      setAccessToken(token);
      tokenRef.current = token;
      setUser(null); // Backend does not return a user object in MFA elevation
      setMfaData(null);
      setAuthState('authenticated');
      scheduleTokenRefresh(expiresIn);
      return { success: true };
    } catch (err) {
      let msg = 'Invalid or expired verification code. Please try again.';
      if (err.status === 409 || err.code === 'CHALLENGE_ALREADY_USED') {
        msg = 'This verification challenge has expired or was already used. Please log in again.';
        setAuthState('unauthenticated');
        setMfaData(null);
      } else if (err.status === 429) {
        msg = 'Too many failed verification attempts. Please wait a few minutes.';
      } else if (err.message) {
        msg = err.message;
      }
      setAuthError(msg);
      return { success: false, error: msg };
    }
  };

  /**
   * Authoritative Logout.
   */
  const logout = async () => {
    clearRefreshTimer();
    try {
      await logoutApi();
    } finally {
      setAccessToken(null);
      tokenRef.current = null;
      setUser(null);
      setMfaData(null);
      setAuthState('unauthenticated');
      setAuthError(null);
    }
  };

  /**
   * Helper to cancel MFA and return to login.
   */
  const cancelMfa = () => {
    setMfaData(null);
    setAuthState('unauthenticated');
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        authState,
        accessToken,
        user,
        mfaData,
        authError,
        login,
        verifyMfa,
        logout,
        cancelMfa,
        checkSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
