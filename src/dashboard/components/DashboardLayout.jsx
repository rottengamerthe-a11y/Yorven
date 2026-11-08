import React, { useState } from 'react';
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Activity,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { SyncModal } from './SyncModal.jsx';
import './dashboard.css';

export function DashboardLayout() {
  const { authState, accessToken, user, logout } = useAuth();
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  // Route protection
  if (authState === 'loading') {
    return (
      <div className="dashboard-loading-screen">
        <div className="dashboard-spinner" />
        <p className="loading-text">Verifying studio authorization...</p>
      </div>
    );
  }

  if (authState === 'mfa_pending') {
    return <Navigate to="/dashboard/mfa" replace />;
  }

  if (authState === 'unauthenticated') {
    return <Navigate to="/dashboard/login" replace />;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/dashboard/login', { replace: true });
  };

  const navItems = [
    { to: '/dashboard/overview', label: 'Overview', icon: LayoutDashboard },
    { to: '/dashboard/pages', label: 'Monitored Pages', icon: FileText },
    { to: '/dashboard/metrics', label: 'Historical Metrics', icon: BarChart3 },
    { to: '/dashboard/status', label: 'Status & Logs', icon: Activity }
  ];

  return (
    <div className="dashboard-shell">
      {/* Top Studio Bar */}
      <header className="dashboard-header">
        <div className="header-left">
          <NavLink to="/" className="studio-brand">
            <span className="brand-yorven">Yorven</span>
            <span className="brand-badge">SEO Studio</span>
          </NavLink>
        </div>

        <nav className="desktop-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="action-btn-sync"
            onClick={() => setIsSyncModalOpen(true)}
            title="Trigger on-demand synchronization"
          >
            <RefreshCw size={15} />
            <span className="btn-label">Sync Now</span>
          </button>

          <div className="user-badge" title="Owner session active with AAL2 MFA">
            <ShieldCheck size={14} className="shield-icon" />
            <span className="user-role">Owner</span>
          </div>

          <button
            type="button"
            className="action-btn-logout"
            onClick={handleLogout}
            title="Revoke session and sign out"
          >
            <LogOut size={16} />
            <span className="btn-label">Sign out</span>
          </button>

          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="mobile-nav-drawer">
          <nav className="mobile-nav-links">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `mobile-nav-tab ${isActive ? 'active' : ''}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
            <button
              type="button"
              className="mobile-nav-sync-btn"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsSyncModalOpen(true);
              }}
            >
              <RefreshCw size={16} />
              <span>Trigger Sync</span>
            </button>
            <button
              type="button"
              className="mobile-nav-logout-btn"
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleLogout();
              }}
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </nav>
        </div>
      )}

      {/* Main Content Area */}
      <main className="dashboard-content">
        <Outlet context={{ token: accessToken }} />
      </main>

      {/* Manual Sync Modal */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        token={accessToken}
      />
    </div>
  );
}
