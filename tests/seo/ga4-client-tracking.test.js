import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GA_MEASUREMENT_ID,
  CONSENT_STORAGE_KEY,
  isPrivateRoute,
  hasAnalyticsConsent,
  getAnalyticsConsentState,
  setAnalyticsConsent,
  initGA,
  trackPageView,
  removeGaCookies
} from '../../src/services/analytics.js';

test.beforeEach(() => {
  // Setup clean mock window and document objects for Node testing environment
  globalThis.window = {
    dataLayer: [],
    gtag: null,
    location: { pathname: '/', search: '', hostname: 'yorven.in' },
    dispatchEvent: () => {}
  };

  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  const elements = new Map();
  let cookieString = '';

  globalThis.document = {
    title: 'Yorven — Built for what’s next.',
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        attributes: {},
        parentNode: {
          removeChild: () => {
            if (el.id) elements.delete(el.id);
          }
        },
        set id(val) { this._id = val; },
        get id() { return this._id; }
      };
      return el;
    },
    head: {
      appendChild: (el) => {
        if (el.id) elements.set(el.id, el);
      }
    },
    get cookie() {
      return cookieString;
    },
    set cookie(val) {
      if (val.includes('Max-Age=0') || val.includes('Expires=Thu, 01 Jan 1970')) {
        const name = val.split('=')[0]?.trim();
        const parts = cookieString.split(';').map(s => s.trim()).filter(s => !s.startsWith(`${name}=`));
        cookieString = parts.join('; ');
      } else {
        const item = val.split(';')[0]?.trim();
        cookieString = cookieString ? `${cookieString}; ${item}` : item;
      }
    }
  };
});

// ----------------------------------------------------------------------------
// 1. BASIC CONSENT ENFORCEMENT BEFORE USER DECISION
// ----------------------------------------------------------------------------

test('Basic Consent: does not inject gtag.js or initialize dataLayer before consent', () => {
  assert.equal(hasAnalyticsConsent(), false);
  assert.equal(getAnalyticsConsentState(), null);

  initGA();

  assert.equal(document.getElementById('google-tag-manager-gtag'), null);
  assert.equal(window.gtag, null);
  assert.equal(window.dataLayer.length, 0);
});

test('Basic Consent: trackPageView does nothing before consent', () => {
  trackPageView({
    pathname: '/work',
    search: '',
    title: 'Work'
  });

  assert.equal(window.dataLayer.length, 0);
  assert.equal(window.gtag, null);
});

test('Basic Consent: declining consent explicitly keeps analytics disabled', () => {
  setAnalyticsConsent('denied');

  assert.equal(hasAnalyticsConsent(), false);
  assert.equal(getAnalyticsConsentState(), 'denied');
  assert.equal(localStorage.getItem(CONSENT_STORAGE_KEY), 'denied');

  initGA();

  assert.equal(document.getElementById('google-tag-manager-gtag'), null);
  assert.ok(window.gtag === null || window.gtag === undefined);
});

// ----------------------------------------------------------------------------
// 2. ACCEPTANCE LIFECYCLE
// ----------------------------------------------------------------------------

test('Basic Consent: acceptance loads gtag.js and enables page-view tracking', () => {
  setAnalyticsConsent('granted');

  assert.equal(hasAnalyticsConsent(), true);
  assert.equal(getAnalyticsConsentState(), 'granted');
  assert.equal(localStorage.getItem(CONSENT_STORAGE_KEY), 'granted');

  const script = document.getElementById('google-tag-manager-gtag');
  assert.ok(script);
  assert.equal(script.src, `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);

  assert.equal(typeof window.gtag, 'function');

  const configCall = window.dataLayer.find(entry => entry[0] === 'config');
  assert.ok(configCall);
  assert.equal(configCall[1], GA_MEASUREMENT_ID);
  assert.equal(configCall[2].send_page_view, false);

  trackPageView({
    pathname: '/about',
    search: '',
    title: 'About'
  });

  const pageView = window.dataLayer.find(entry => entry[0] === 'event' && entry[1] === 'page_view' && entry[2].page_path === '/about');
  assert.ok(pageView);
  assert.equal(pageView[2].send_to, GA_MEASUREMENT_ID);
});

// ----------------------------------------------------------------------------
// 3. WITHDRAWAL & RE-ACCEPTANCE LIFECYCLE (CASES 1-7)
// ----------------------------------------------------------------------------

test('Case 1 & 2: on withdrawal, GA4 receives explicit consent revocation before script removal', () => {
  setAnalyticsConsent('granted');
  assert.ok(document.getElementById('google-tag-manager-gtag'));

  // Track consent calls during withdrawal
  let consentRevocationDispatched = false;
  const originalGtag = window.gtag;
  window.gtag = function mockGtag(...args) {
    if (args[0] === 'consent' && args[1] === 'update' && args[2]?.analytics_storage === 'denied') {
      consentRevocationDispatched = true;
    }
    return originalGtag(...args);
  };

  setAnalyticsConsent('denied');

  assert.equal(consentRevocationDispatched, true, 'gtag consent update denied command must be dispatched');
  assert.equal(document.getElementById('google-tag-manager-gtag'), null, 'Script must be removed');
});

test('Case 3 & 4: no subsequent events sent and no queued events flushed after withdrawal', () => {
  setAnalyticsConsent('granted');

  // Verify active
  trackPageView({ pathname: '/work', title: 'Work' });

  // Withdraw
  setAnalyticsConsent('denied');

  // dataLayer must be drained
  assert.equal(window.dataLayer.length, 0, 'dataLayer queue must be cleared on withdrawal');
  assert.equal(window.gtag, undefined, 'window.gtag must be neutralized');

  // Attempt subsequent tracking
  trackPageView({ pathname: '/services', title: 'Services' });
  assert.equal(window.dataLayer.length, 0, 'No events must be queued after withdrawal');
});

test('Case 5: page reload after withdrawal does not initialize GA4', () => {
  setAnalyticsConsent('granted');
  setAnalyticsConsent('denied');

  // Simulate full page reload (new window execution context with preserved localStorage)
  globalThis.window.dataLayer = [];
  globalThis.window.gtag = null;

  initGA();

  assert.equal(document.getElementById('google-tag-manager-gtag'), null);
  assert.equal(window.gtag, null);
  assert.equal(window.dataLayer.length, 0);
});

test('Case 6: existing GA4 cookies are expired for hostname and parent root domain', () => {
  setAnalyticsConsent('granted');

  document.cookie = '_ga=GA1.1.123456789.1670000000';
  document.cookie = '_ga_91QDYYW484=GS1.1.1670000000.1.0.1670000000.0.0.0';
  document.cookie = 'non_ga_cookie=session123';

  assert.ok(document.cookie.includes('_ga='));

  setAnalyticsConsent('denied');

  // GA cookies expired
  assert.equal(document.cookie.includes('_ga='), false);
  assert.equal(document.cookie.includes('_ga_91QDYYW484='), false);
  // Non-GA cookies preserved
  assert.ok(document.cookie.includes('non_ga_cookie=session123'));
});

test('Case 7: visitor can accept again after withdrawing, and tracking resumes exactly once', () => {
  // 1. Initial grant
  setAnalyticsConsent('granted');
  assert.ok(document.getElementById('google-tag-manager-gtag'));

  // 2. Withdraw
  setAnalyticsConsent('denied');
  assert.equal(document.getElementById('google-tag-manager-gtag'), null);

  // 3. Re-accept
  setAnalyticsConsent('granted');

  // Script re-injected
  const script = document.getElementById('google-tag-manager-gtag');
  assert.ok(script);
  assert.equal(script.src, `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
  assert.equal(typeof window.gtag, 'function');

  // Track page view
  trackPageView({ pathname: '/insights', title: 'Insights' });
  const insightViews = window.dataLayer.filter(e => e[0] === 'event' && e[2]?.page_path === '/insights');
  assert.equal(insightViews.length, 1, 'Tracking must resume exactly once');
});

// ----------------------------------------------------------------------------
// 4. ROUTE PRIVACY & PII SUPPRESSION
// ----------------------------------------------------------------------------

test('Basic Consent: private dashboard and authentication routes remain strictly excluded', () => {
  setAnalyticsConsent('granted');

  const privatePaths = [
    '/dashboard',
    '/dashboard/overview',
    '/dashboard/login',
    '/dashboard/mfa',
    '/dashboard/enroll',
    '/yorven-control',
    '/api/auth/login'
  ];

  for (const path of privatePaths) {
    assert.equal(isPrivateRoute(path), true);
    trackPageView({ pathname: path });
  }

  const pageViewEvents = window.dataLayer.filter(entry => entry[0] === 'event' && entry[1] === 'page_view' && isPrivateRoute(entry[2].page_path));
  assert.equal(pageViewEvents.length, 0);
});

test('Basic Consent: query parameter sanitization strips tokens and auth codes', () => {
  setAnalyticsConsent('granted');

  trackPageView({
    pathname: '/work',
    search: '?project=aurix&token=xyz123&code=456&session=abc',
    title: 'Work'
  });

  const aurixView = window.dataLayer.find(entry => entry[0] === 'event' && entry[2]?.page_title === 'Work');
  assert.ok(aurixView);
  assert.equal(aurixView[2].page_path, '/work?project=aurix');
  assert.ok(!aurixView[2].page_path.includes('token='));
  assert.ok(!aurixView[2].page_path.includes('code='));
});
