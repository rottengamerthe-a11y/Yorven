import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Activity,
  CheckCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Database,
  List,
  Server,
  Info
} from 'lucide-react';
import { getStatusApi } from '../api/dashboardClient.js';
import '../components/dashboard.css';

export function DashboardStatus() {
  const { token } = useOutletContext();
  const [statusData, setStatusData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getStatusApi(token);
      setStatusData(data);
    } catch (err) {
      setError(err.message || 'Failed to query synchronization status');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const providers = statusData?.providers || {};
  const gsc = providers.gsc || {};
  const ga4 = providers.ga4 || {};
  const queue = statusData?.queue || {};
  const activeJob = queue.active_job || null;
  const recentJobs = queue.recent_jobs || [];
  const audit = statusData?.audit || {};
  const recentLogs = audit.recent_logs || [];
  const disclaimers = statusData?.disclaimers || {};

  const getPillClass = (statusStr) => {
    if (!statusStr) return 'unknown';
    const s = String(statusStr).toLowerCase();
    if (s === 'healthy' || s === 'successful' || s === 'completed' || s === 'complete') return 'healthy';
    if (s === 'sync_in_progress' || s === 'processing' || s === 'pending') return 'sync_in_progress';
    if (s === 'stale' || s === 'possibly_truncated' || s === 'partial_write_interrupted') return 'warning';
    if (s.includes('fail') || s.includes('error')) return 'failed';
    return 'unknown';
  };

  return (
    <div className="status-page">
      <div className="page-title-row">
        <div>
          <h1 className="page-heading">Provider Health & Sync Status</h1>
          <p className="page-subheading">
            Live ingestion monitoring, queue coordination, and structured audit logs.
          </p>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={loadStatus}
          disabled={isLoading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          <span>Refresh Status</span>
        </button>
      </div>

      {error && (
        <div className="sync-result-box result-error" style={{ marginBottom: '24px' }}>
          <AlertTriangle size={20} className="result-icon error" />
          <div className="result-text">
            <div className="result-heading">Status Query Failed</div>
            <div className="result-paragraph">{error}</div>
          </div>
        </div>
      )}

      {/* Provider Health Overview Cards */}
      <div className="metrics-grid-2">
        {/* Google Search Console Status */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Database size={18} className="lime" />
              <span>Google Search Console Health</span>
            </h2>
            <span className={`status-pill ${getPillClass(gsc.health_status)}`}>
              {gsc.health_status || 'uninitialized'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
            <div style={{ background: '#051a19', padding: '12px', borderRadius: '2px', border: '1px solid var(--line-dark)' }}>
              <span className="metric-title">Latest Attempt</span>
              <div style={{ marginTop: '6px' }}>
                <span className={`status-pill ${getPillClass(gsc.latest_attempt_status)}`}>
                  {gsc.latest_attempt_status || 'unknown'}
                </span>
              </div>
              <div className="table-date" style={{ marginTop: '6px' }}>
                {gsc.latest_attempt_time ? new Date(gsc.latest_attempt_time).toLocaleString() : 'No attempts recorded'}
              </div>
            </div>

            <div style={{ background: '#051a19', padding: '12px', borderRadius: '2px', border: '1px solid var(--line-dark)' }}>
              <span className="metric-title">Completed Ingestion</span>
              <div style={{ marginTop: '6px' }}>
                <span className={`status-pill ${getPillClass(gsc.latest_completed_ingestion_status)}`}>
                  {gsc.latest_completed_ingestion_status || 'unknown'}
                </span>
              </div>
              <div className="table-date" style={{ marginTop: '6px' }}>
                {gsc.latest_completed_ingestion_time ? new Date(gsc.latest_completed_ingestion_time).toLocaleString() : 'No completions recorded'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '12px', fontSize: '12px', color: '#9cb5af', fontFamily: 'var(--mono, monospace)' }}>
            Physical Metrics Recorded At: {gsc.latest_data_recorded_at ? new Date(gsc.latest_data_recorded_at).toLocaleString() : 'None'}
          </div>
        </div>

        {/* Google Analytics 4 Status */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Server size={18} className="lime" />
              <span>Google Analytics 4 Health</span>
            </h2>
            <span className={`status-pill ${getPillClass(ga4.health_status)}`}>
              {ga4.health_status || 'uninitialized'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
            <div style={{ background: '#051a19', padding: '12px', borderRadius: '2px', border: '1px solid var(--line-dark)' }}>
              <span className="metric-title">Latest Attempt</span>
              <div style={{ marginTop: '6px' }}>
                <span className={`status-pill ${getPillClass(ga4.latest_attempt_status)}`}>
                  {ga4.latest_attempt_status || 'unknown'}
                </span>
              </div>
              <div className="table-date" style={{ marginTop: '6px' }}>
                {ga4.latest_attempt_time ? new Date(ga4.latest_attempt_time).toLocaleString() : 'No attempts recorded'}
              </div>
            </div>

            <div style={{ background: '#051a19', padding: '12px', borderRadius: '2px', border: '1px solid var(--line-dark)' }}>
              <span className="metric-title">Last Successful Sync</span>
              <div style={{ marginTop: '6px' }}>
                <span className={`status-pill ${ga4.last_successful_sync ? 'healthy' : 'uninitialized'}`}>
                  {ga4.last_successful_sync ? 'Verified' : 'Pending'}
                </span>
              </div>
              <div className="table-date" style={{ marginTop: '6px' }}>
                {ga4.last_successful_sync ? new Date(ga4.last_successful_sync).toLocaleString() : 'None'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '12px', fontSize: '12px', color: '#9cb5af', fontFamily: 'var(--mono, monospace)' }}>
            Physical Metrics Recorded At: {ga4.latest_data_recorded_at ? new Date(ga4.latest_data_recorded_at).toLocaleString() : 'None'}
          </div>
        </div>
      </div>

      {/* Active Job Callout */}
      {activeJob && (
        <div className="sync-result-box result-deferred" style={{ marginBottom: '24px' }}>
          <Clock size={20} className="result-icon deferred" />
          <div className="result-text">
            <div className="result-heading">Active Queue Job: {activeJob.job_type} ({activeJob.status})</div>
            <div className="result-paragraph">
              Worker: <code>{activeJob.worker_id || 'unassigned'}</code> | Retries: {activeJob.retry_count} | Started: {activeJob.started_at ? new Date(activeJob.started_at).toLocaleTimeString() : 'Pending'}
            </div>
          </div>
        </div>
      )}

      {/* Queue Jobs Table */}
      <div className="dashboard-panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <List size={18} className="lime" />
            <span>Recent Synchronization Jobs</span>
          </h2>
          <span className="table-date">public.seo_sync_jobs (Last 5)</span>
        </div>

        <div className="table-responsive">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Workload Type</th>
                <th>Status</th>
                <th>Worker</th>
                <th className="table-number">Retries</th>
                <th>Created At</th>
                <th>Finished At</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#9cb5af' }}>
                    No sync jobs recorded.
                  </td>
                </tr>
              ) : (
                recentJobs.map(j => (
                  <tr key={j.id}>
                    <td><code>{String(j.id).slice(0, 8)}...</code></td>
                    <td style={{ fontFamily: 'var(--mono, monospace)', color: 'var(--lime)' }}>{j.job_type}</td>
                    <td>
                      <span className={`status-pill ${getPillClass(j.status)}`}>
                        {j.status}
                      </span>
                    </td>
                    <td>{j.worker_id || '—'}</td>
                    <td className="table-number">{j.retry_count}</td>
                    <td className="table-date">{j.created_at ? new Date(j.created_at).toLocaleString() : '—'}</td>
                    <td className="table-date">{j.finished_at ? new Date(j.finished_at).toLocaleString() : 'Active/Pending'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log Stream */}
      <div className="dashboard-panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <Activity size={18} className="lime" />
            <span>Structured Audit Event Stream</span>
          </h2>
          <span className="table-date">public.seo_sync_logs (Last 10 Events)</span>
        </div>

        <div className="table-responsive">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Level</th>
                <th>Lifecycle Event</th>
                <th>Payload Summary</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#9cb5af' }}>
                    No sync audit events recorded.
                  </td>
                </tr>
              ) : (
                recentLogs.map(l => (
                  <tr key={l.id}>
                    <td className="table-date" style={{ whiteSpace: 'nowrap' }}>
                      {l.created_at ? new Date(l.created_at).toLocaleTimeString() : '—'}
                    </td>
                    <td>
                      <span className={`status-pill ${l.level === 'error' ? 'failed' : l.level === 'warn' ? 'warning' : 'healthy'}`}>
                        {l.level}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono, monospace)', fontWeight: '600' }}>
                      {l.message}
                    </td>
                    <td style={{ fontFamily: 'var(--mono, monospace)', fontSize: '11px', color: '#9cb5af', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.payload ? JSON.stringify(l.payload) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Scope Note Disclaimer */}
        <div style={{ marginTop: '16px', display: 'flex', gap: '8px', fontSize: '12px', color: '#8da49f', lineHeight: '1.45' }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--lime)' }} />
          <span>
            <strong>Disclaimer:</strong> {disclaimers.scope_note ||
              'Provider health and ingestion statuses describe individual execution attempts. Rows are merged into public.seo_search_console_metrics and public.seo_ga4_metrics using unique constraints and do not replace the cumulative historical store.'}
          </span>
        </div>
      </div>
    </div>
  );
}
