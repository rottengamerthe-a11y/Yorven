import React, { useState, useEffect } from 'react';
import { getAnalyticsConsentState, setAnalyticsConsent } from '../../services/analytics';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [currentConsent, setCurrentConsent] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const state = getAnalyticsConsentState();
      setCurrentConsent(state);
      // Show banner if visitor has not yet made a choice
      if (state === null) {
        setVisible(true);
      }
    } catch {
      // Ignore storage errors
    }

    const handleConsentChange = (e) => {
      setCurrentConsent(e.detail?.status || null);
    };

    const handleOpenPreferences = () => {
      setVisible(true);
    };

    window.addEventListener('yorven_consent_change', handleConsentChange);
    window.addEventListener('yorven_open_cookie_preferences', handleOpenPreferences);

    return () => {
      window.removeEventListener('yorven_consent_change', handleConsentChange);
      window.removeEventListener('yorven_open_cookie_preferences', handleOpenPreferences);
    };
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    setAnalyticsConsent('granted');
    setVisible(false);
  };

  const handleDecline = () => {
    setAnalyticsConsent('denied');
    setVisible(false);
  };

  return (
    <div
      className="cookie-banner-wrap"
      role="region"
      aria-label="Cookie and Privacy Choices"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#0d1f1e',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        padding: '16px 24px',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
        color: '#e2e8f0',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}
    >
      <div style={{ maxWidth: '850px', lineHeight: '1.5' }}>
        We use Google Analytics to measure aggregate visitor traffic and improve performance.
        Under our Basic Consent policy, <strong>no analytics scripts or cookies load until you accept</strong>.
        You can accept, decline, or change your mind at any time via the "Cookie Choices" link in the footer. See our{' '}
        <a
          href="/cookies"
          style={{ color: '#a3e635', textDecoration: 'underline' }}
        >
          Cookie Policy
        </a>{' '}
        for full details.
        {currentConsent && (
          <span style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
            Current preference: <strong>{currentConsent.toUpperCase()}</strong>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={handleDecline}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: '#e2e8f0',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500
          }}
        >
          {currentConsent === 'granted' ? 'Withdraw / Decline' : 'Decline'}
        </button>
        <button
          type="button"
          onClick={handleAccept}
          style={{
            background: '#a3e635',
            border: 'none',
            color: '#082d2c',
            padding: '8px 18px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 700
          }}
        >
          Accept Analytics
        </button>
      </div>
    </div>
  );
}
