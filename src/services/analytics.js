/**
 * Google Analytics 4 (GA4) Client-Side Tracking Utility
 * Basic Consent Mode Implementation
 * Measurement ID: G-91QDYYW484
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

export const GA_MEASUREMENT_ID = 'G-91QDYYW484';

export const CONSENT_STORAGE_KEY = 'yorven_cookie_consent';

const SCRIPT_ID = 'google-tag-manager-gtag';

/**
 * Checks whether user has explicitly granted analytics consent.
 * Returns true only if strictly 'granted'.
 */
export function hasAnalyticsConsent() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Returns the raw consent state: 'granted', 'denied', or null (undecided).
 */
export function getAnalyticsConsentState() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Removes GA4 client-side cookies (_ga, _ga_*, etc.) from browser storage.
 */
export function removeGaCookies() {
  if (typeof document === 'undefined') return;
  try {
    const cookies = document.cookie ? document.cookie.split(';') : [];
    const hostname = window.location ? window.location.hostname : '';
    const domainParts = hostname.split('.');
    const rootDomain = domainParts.length > 1
      ? '.' + domainParts.slice(-2).join('.')
      : hostname;

    for (const c of cookies) {
      const name = c.split('=')[0]?.trim();
      if (name && (name === '_ga' || name.startsWith('_ga_'))) {
        document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0`;
        if (hostname) {
          document.cookie = `${name}=; Path=/; Domain=${hostname}; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0`;
          if (rootDomain !== hostname) {
            document.cookie = `${name}=; Path=/; Domain=${rootDomain}; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0`;
          }
        }
      }
    }
  } catch {
    // Ignore cookie clearing errors
  }
}

/**
 * Basic Consent Mode: Injects Google Tag script and initializes GA4
 * ONLY when explicit consent has been granted.
 *
 * @param {string} [measurementId=GA_MEASUREMENT_ID]
 */
export function initGA(measurementId = GA_MEASUREMENT_ID) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  // Under Basic Consent Mode: Do not initialize or load gtag if consent is not granted
  if (!hasAnalyticsConsent()) {
    return;
  }

  // Ensure window.dataLayer and window.gtag are initialized
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }

  // Inject gtag.js script if not already present
  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
  }

  window.gtag('js', new Date());

  // Configure Measurement ID with manual page_view disabled so React Router controls navigation events
  window.gtag('config', measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    cookie_flags: 'SameSite=Strict;Secure'
  });
}

/**
 * Updates user consent choice.
 * - 'granted': stores preference, initializes GA4, and tracks the current page.
 * - 'denied': revokes consent in gtag (if present), removes GA4 script from DOM, purges GA cookies, and drains dataLayer.
 *
 * @param {'granted' | 'denied'} status
 */
export function setAnalyticsConsent(status) {
  if (typeof window === 'undefined') return;
  const isGranted = status === 'granted';

  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, isGranted ? 'granted' : 'denied');
  } catch {
    // Ignore storage failure
  }

  // Dispatch custom event for UI components (e.g. CookieBanner or preferences modal)
  window.dispatchEvent(new CustomEvent('yorven_consent_change', { detail: { status: isGranted ? 'granted' : 'denied' } }));

  if (isGranted) {
    initGA();
    if (window.location && typeof document !== 'undefined') {
      trackPageView({
        pathname: window.location.pathname,
        search: window.location.search,
        title: document.title
      });
    }
  } else {
    // 1. If gtag is already initialized, issue explicit consent revocation command
    if (typeof window.gtag === 'function') {
      try {
        window.gtag('consent', 'update', {
          analytics_storage: 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied'
        });
      } catch {
        // Ignore gtag dispatch errors
      }
    }

    // 2. Remove gtag.js script element from DOM
    if (typeof document !== 'undefined') {
      const script = document.getElementById(SCRIPT_ID);
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    // 3. Clear existing client-side GA cookies across domain scopes
    removeGaCookies();

    // 4. Drain queued events in dataLayer and neutralize window.gtag
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.length = 0;
    }
    window.gtag = undefined;
  }
}

/**
 * Determines whether a route is private or administrative.
 * Private routes must NEVER be tracked by Google Analytics.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isPrivateRoute(pathname) {
  if (!pathname || typeof pathname !== 'string') return false;
  const normalized = pathname.trim().toLowerCase();
  return (
    normalized === '/yorven-control' ||
    normalized.startsWith('/yorven-control/') ||
    normalized === '/dashboard' ||
    normalized.startsWith('/dashboard/') ||
    normalized === '/api' ||
    normalized.startsWith('/api/')
  );
}

/**
 * Tracks a client-side page view in single-page applications.
 * Enforces consent requirement, route privacy, and PII suppression.
 *
 * @param {Object} params
 * @param {string} params.pathname
 * @param {string} params.search
 * @param {string} [params.title]
 * @param {string} [params.measurementId=GA_MEASUREMENT_ID]
 */
export function trackPageView({
  pathname,
  search = '',
  title = '',
  measurementId = GA_MEASUREMENT_ID
}) {
  if (typeof window === 'undefined') return;

  // Basic Consent Mode: Never track if consent is not granted
  if (!hasAnalyticsConsent()) {
    return;
  }

  // Never track private/dashboard/auth routes
  if (isPrivateRoute(pathname)) {
    return;
  }

  // Strip query parameters containing tokens or secrets
  let safeSearch = search;
  if (safeSearch) {
    try {
      const urlParams = new URLSearchParams(safeSearch);
      ['token', 'code', 'session', 'auth', 'key', 'secret', 'refresh'].forEach((p) => {
        urlParams.delete(p);
      });
      const qs = urlParams.toString();
      safeSearch = qs ? `?${qs}` : '';
    } catch {
      safeSearch = '';
    }
  }

  const pagePath = `${pathname}${safeSearch}`;
  const pageTitle = title || document.title || 'Yorven';
  const pageLocation = `https://yorven.in${pagePath}`;

  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      send_to: measurementId,
      page_path: pagePath,
      page_title: pageTitle,
      page_location: pageLocation
    });
  }
}
