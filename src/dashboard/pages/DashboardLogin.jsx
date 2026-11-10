import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import '../components/dashboard.css';

export function DashboardLogin() {
  const { authState, login, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const navigate = useNavigate();

  // If already authenticated, redirect to dashboard overview
  if (authState === 'authenticated') {
    return <Navigate to="/dashboard/overview" replace />;
  }

  // If MFA challenge is pending, redirect to MFA screen
  if (authState === 'mfa_pending') {
    return <Navigate to="/dashboard/mfa" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!email || !password) {
      setFormError('Email and password are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(email.trim(), password);
      if (res.success && res.mfaRequired) {
        navigate('/dashboard/mfa', { replace: true });
      }
    } catch (err) {
      setFormError(err.message || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = formError || authError;

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-eyebrow">Yorven</div>
          <h1 className="auth-title">Studio Control</h1>
          <p className="auth-subtitle">Private SEO Dashboard & Data Synchronization</p>
        </div>

        {displayError && (
          <div className="auth-error-banner" role="alert">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">Studio Email</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-email"
                type="email"
                className="form-input"
                style={{ width: '100%', paddingLeft: '38px' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@yorven.in"
                required
                autoComplete="email"
                disabled={isSubmitting}
              />
              <Mail
                size={16}
                style={{ position: 'absolute', left: '12px', top: '14px', color: '#9cb5af' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type="password"
                className="form-input"
                style={{ width: '100%', paddingLeft: '38px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                autoComplete="current-password"
                disabled={isSubmitting}
              />
              <Lock
                size={16}
                style={{ position: 'absolute', left: '12px', top: '14px', color: '#9cb5af' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span>Verifying credentials...</span>
            ) : (
              <>
                <span>Continue to MFA</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <Link to="/" style={{ fontSize: '12px', color: '#9cb5af', textDecoration: 'none' }}>
              ← Back to public studio
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
