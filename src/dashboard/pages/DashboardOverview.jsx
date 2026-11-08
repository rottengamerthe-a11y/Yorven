import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Search,
  Eye,
  Percent,
  TrendingUp,
  Users,
  Clock,
  Target,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { getOverviewApi } from '../api/dashboardClient.js';
import { MetricCard } from '../components/MetricCard.jsx';
import '../components/dashboard.css';

export function DashboardOverview() {
  const { token } = useOutletContext();
  const [datePreset, setDatePreset] = useState('30d'); // '7d' | '14d' | '30d' | '90d'
  const [overviewData, setOverviewData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const calculateDateRange = useCallback((preset) => {
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    let days = 30;
    if (preset === '7d') days = 7;
    if (preset === '14d') days = 14;
    if (preset === '90d') days = 90;

    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - (days - 1)));
    const formatIso = (d) => d.toISOString().split('T')[0];

    return {
      startDate: formatIso(start),
      endDate: formatIso(end)
    };
  }, []);

  const loadOverview = useCallback(async (preset) => {
    setIsLoading(true);
    setError(null);

    const { startDate, endDate } = calculateDateRange(preset);

    try {
      const data = await getOverviewApi(token, startDate, endDate);
      setOverviewData(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch overview analytics');
    } finally {
      setIsLoading(false);
    }
  }, [token, calculateDateRange]);

  useEffect(() => {
    loadOverview(datePreset);
  }, [datePreset, loadOverview]);

  const gsc = overviewData?.gsc || {};
  const ga4 = overviewData?.ga4 || {};
  const dateRange = overviewData?.date_range || {};

  return (
    <div className="overview-page">
      {/* Page Title & Controls */}
      <div className="page-title-row">
        <div>
          <h1 className="page-heading">SEO Overview</h1>
          <p className="page-subheading">
            Consolidated organic search performance and audience engagement across Yorven's monitored routes.
          </p>
        </div>

        <div className="date-filter-group" role="group" aria-label="Date Range Presets">
          <button
            type="button"
            className={`date-preset-btn ${datePreset === '7d' ? 'active' : ''}`}
            onClick={() => setDatePreset('7d')}
          >
            Past 7D
          </button>
          <button
            type="button"
            className={`date-preset-btn ${datePreset === '14d' ? 'active' : ''}`}
            onClick={() => setDatePreset('14d')}
          >
            Past 14D
          </button>
          <button
            type="button"
            className={`date-preset-btn ${datePreset === '30d' ? 'active' : ''}`}
            onClick={() => setDatePreset('30d')}
          >
            Past 30D
          </button>
          <button
            type="button"
            className={`date-preset-btn ${datePreset === '90d' ? 'active' : ''}`}
            onClick={() => setDatePreset('90d')}
          >
            Past 90D
          </button>
        </div>
      </div>

      {/* Date Window Indicator */}
      {dateRange.start && (
        <div style={{ marginBottom: '20px', fontSize: '12px', color: '#9cb5af', fontFamily: 'var(--mono, monospace)' }}>
          Active Window: {dateRange.start} → {dateRange.end} ({dateRange.inclusive_days} inclusive days)
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="sync-result-box result-error" style={{ marginBottom: '24px' }}>
          <AlertCircle size={20} className="result-icon error" />
          <div className="result-text">
            <div className="result-heading">Analytics Retrieval Failed</div>
            <div className="result-paragraph">{error}</div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => loadOverview(datePreset)}
              style={{ marginTop: '10px' }}
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Section 1: Google Search Console Performance */}
      <div className="dashboard-panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <Search size={18} className="lime" />
            <span>Search Console Discovery</span>
          </h2>
          <span className="status-pill healthy">T-3 Publication Lag</span>
        </div>

        <div className="metrics-grid-4">
          <MetricCard
            title="Organic Clicks"
            value={gsc.total_clicks}
            subtitle="Search visits to monitored routes"
            icon={Search}
            isLoading={isLoading}
          />

          <MetricCard
            title="Impressions"
            value={gsc.total_impressions}
            subtitle="Search appearances on Google SERP"
            icon={Eye}
            isLoading={isLoading}
          />

          <MetricCard
            title="Average CTR"
            formattedValue={
              gsc.aggregate_ctr !== undefined && gsc.aggregate_ctr !== null
                ? `${(Number(gsc.aggregate_ctr) * 100).toFixed(2)}%`
                : null
            }
            subtitle="Clicks ÷ Impressions weighted"
            icon={Percent}
            isLoading={isLoading}
          />

          <MetricCard
            title="Average Position"
            formattedValue={
              gsc.aggregate_position !== undefined && gsc.aggregate_position !== null
                ? Number(gsc.aggregate_position).toFixed(1)
                : null
            }
            subtitle="Impression-weighted SERP rank"
            icon={TrendingUp}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Section 2: Google Analytics 4 Engagement */}
      <div className="dashboard-panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <Users size={18} className="lime" />
            <span>GA4 Audience & Landing Page Engagement</span>
          </h2>
          <span className="status-pill healthy">T-1 Freshness</span>
        </div>

        <div className="metrics-grid-4">
          <MetricCard
            title="Organic Sessions"
            value={ga4.total_sessions}
            subtitle="Direct landing page sessions"
            icon={Users}
            isLoading={isLoading}
          />

          <MetricCard
            title="Active Users (Sum)"
            value={ga4.total_active_users_sum_non_deduplicated}
            subtitle="Cross-day sum"
            disclaimer="Notice: Non-deduplicated daily sum across monitored routes"
            icon={Users}
            isLoading={isLoading}
          />

          <MetricCard
            title="Engagement Rate"
            formattedValue={
              ga4.aggregate_engagement_rate !== undefined && ga4.aggregate_engagement_rate !== null
                ? `${(Number(ga4.aggregate_engagement_rate) * 100).toFixed(1)}%`
                : null
            }
            subtitle="Session-weighted engaged time"
            icon={Percent}
            isLoading={isLoading}
          />

          <MetricCard
            title="Bounce Rate"
            formattedValue={
              ga4.aggregate_bounce_rate !== undefined && ga4.aggregate_bounce_rate !== null
                ? `${(Number(ga4.aggregate_bounce_rate) * 100).toFixed(1)}%`
                : null
            }
            subtitle="Non-engaged sessions ratio"
            icon={Percent}
            isLoading={isLoading}
          />
        </div>

        <div className="metrics-grid-2">
          <MetricCard
            title="Avg Session Duration"
            formattedValue={
              ga4.avg_session_duration_seconds !== undefined && ga4.avg_session_duration_seconds !== null
                ? `${Math.round(Number(ga4.avg_session_duration_seconds))}s`
                : null
            }
            subtitle="Average active dwell time per session"
            icon={Clock}
            isLoading={isLoading}
          />

          <MetricCard
            title="Goal Conversions"
            value={ga4.total_conversions}
            subtitle="Lead bookings and form completions"
            icon={Target}
            badge={ga4.total_conversions > 0 ? 'Converting' : 'Baseline'}
            badgeType={ga4.total_conversions > 0 ? 'success' : 'default'}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
