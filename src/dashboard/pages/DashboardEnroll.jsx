import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import '../components/dashboard.css';

export function DashboardEnroll() {
  const { authState, authError, cancelMfa } = useAuth(); // reuse auth context for cancel handling
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState(null);
  const [step, setStep] = useState('credentials'); // 'credentials' | 'qr' | 'verify'
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // If already authenticated, redirect to overview
  if (authState === 'authenticated') {
    return <Navigate to="/dashboard/overview" replace />;
  }

  const handleStart = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Email and password required');
      return;
    }
    try {
      const res = await fetch('/api/auth/mfa-enroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'Yorven-Control'
        },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Enrollment failed');
        return;
      }
      setFactorId(data.factorId);
      setQrCode(data.qrCode);
      setStep('qr');
    } catch (err) {
      setError('Network error');
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError(null);
    if (!code) {
      setError('Enter the 6‑digit code');
      return;
    }
    try {
      const res = await fetch('/api/auth/mfa-enroll-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'Yorven-Control'
        },
        body: JSON.stringify({ code: code.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed');
        return;
      }
      // Enrollment completed – redirect to normal login
      navigate('/dashboard/login', { replace: true });
    } catch (err) {
      setError('Network error');
    }
  };

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
          <div className="auth-brand-eyebrow">Owner Enrollment</div>
          <h1 className="auth-title">Set up TOTP MFA</h1>
        </div>

        {error && (
          <div className="auth-error-banner" role="alert">{error}</div>
        )}

        {step === 'credentials' && (
          <form onSubmit={handleStart} className="auth-form">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              Enroll TOTP
            </button>
          </form>
        )}

        {step === 'qr' && (
          <>
            <p>Scan this QR code with your authenticator app (e.g., Google Authenticator, Authy).</p>
            {qrCode ? (
              <div dangerouslySetInnerHTML={{ __html: qrCode }} />
            ) : (
              <p>(QR code not provided – you may need to copy the secret manually.)</p>
            )}
            <form onSubmit={handleVerify} className="auth-form" style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">Authenticator Code</label>
                <input
                  type="text"
                  className="form-input"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
                Verify and Finish
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
