import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import '../components/dashboard.css';

export function DashboardMfa() {
  const { authState, mfaData, verifyMfa, cancelMfa, authError } = useAuth();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const navigate = useNavigate();

  // If already authenticated, redirect to overview
  if (authState === 'authenticated') {
    return <Navigate to="/dashboard/overview" replace />;
  }

  // If not in MFA challenge flow, redirect to login
  if (authState !== 'mfa_pending') {
    return <Navigate to="/dashboard/login" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setFormError('Please enter a 6-digit verification code.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await verifyMfa(cleanCode);
      if (res.success) {
        navigate('/dashboard/overview', { replace: true });
      }
    } catch (err) {
      setFormError(err.message || 'MFA verification failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = formError || authError;

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(8, 124, 72, 0.2)',
              border: '1px solid var(--green, #087c48)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--mint, #c9ebaa)'
            }}>
              <ShieldCheck size={24} />
            </div>
          </div>
          <div className="auth-brand-eyebrow">AAL2 Verification</div>
          <h1 className="auth-title">Two-Factor Authentication</h1>
          <p className="auth-subtitle">
            Enter the 6-digit code from your authenticator app
            {mfaData?.email ? ` for ${mfaData.email}` : ''}.
          </p>
        </div>

        {displayError && (
          <div className="auth-error-banner" role="alert">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="mfa-code" className="form-label">Authenticator Code</label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="form-input mfa-code-input"
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(val);
              }}
              placeholder="000000"
              autoFocus
              required
              autoComplete="one-time-code"
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
            disabled={isSubmitting || code.length !== 6}
          >
            {isSubmitting ? (
              <span>Verifying code...</span>
            ) : (
              <>
                <span>Verify and Enter Dashboard</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              type="button"
              onClick={cancelMfa}
              style={{
                background: 'transparent',
                border: 0,
                color: '#9cb5af',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <ArrowLeft size={14} /> Cancel and return to login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
