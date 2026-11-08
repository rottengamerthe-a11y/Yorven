import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  BarChart3,
  Filter,
  AlertTriangle,
  RefreshCw,
  Search,
  Users
} from 'lucide-react';
import { getMetricsApi, getPagesApi } from '../api/dashboardClient.js';
import { TimeSeriesChart } from '../components/TimeSeriesChart.jsx';
import '../components/dashboard.css';

export function DashboardMetrics() {
  const { token } = useOutletContext();
  const [datePreset, setDatePreset] = useState('30d');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [pagesList, setPagesList] = useState([]);
  const [metricsData, setMetricsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load pages list for filter dropdown
  useEffect(() => {
    let isMounted = true;
    getPagesApi(token)
      .then(res => {
        if (isMounted) setPagesList(res.pages || []);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [token]);

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

  const loadMetrics = useCallback(async (preset, pageId) => {
    setIsLoading(true);
    setError(null);
    const { startDate, endDate } = calculateDateRange(preset);

    try {
      const data = await getMetricsApi(token, startDate, endDate, pageId || null);
      setMetricsData(data);
    } catch (err) {
      setError(err.message || 'Failed to load historical metrics');
    } finally {
      setIsLoading(false);
    }
  }, [token, calculateDateRange]);

  useEffect(() => {
    loadMetrics(datePreset, selectedPageId);
  }, [datePreset, selectedPageId, loadMetrics]);

  const series = metricsData?.series || [];
  const isTruncated = metricsData?.truncation_status === 'possibly_truncated';

  // Transform series data for charts
  const clicksImpressionsChartData = series.map(s => ({
    date: s.date,
    clicks: s.gsc ? s.gsc.clicks : 0,
    impressions: s.gsc ? s.gsc.impressions : 0
  }));

  const positionCtrChartData = series.map(s => ({
    date: s.date,
    ctr: s.gsc ? Number((s.gsc.ctr * 100).toFixed(2)) : 0,
    avg_position: s.gsc && s.gsc.avg_position !== null ? s.gsc.avg_position : 0
  }));

  const sessionsConversionsChartData = series.map(s => ({
    date: s.date,
    sessions: s.ga4 ? s.ga4.sessions : 0,
    conversions: s.ga4 ? s.ga4.conversions : 0
  }));

  const engagementRatesChartData = series.map(s => ({
    date: s.date,
    engagement_rate: s.ga4 ? Number((s.ga4.engagement_rate * 100).toFixed(1)) : 0,
    bounce_rate: s.ga4 ? Number((s.ga4.bounce_rate * 100).toFixed(1)) : 0
  }));

  return (
    <div className="metrics-page">
      <div className="page-title-row">
        <div>
          <h1 className="page-heading">Historical Trends</h1>
          <p className="page-subheading">
            Continuous daily time-series sequence from Google Search Console and GA4.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Page Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="#9cb5af" />
            <select
              className="form-select"
              style={{ fontSize: '12px', padding: '6px 10px' }}
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
            >
              <option value="">All Monitored Routes (Aggregated)</option>
              {pagesList.map(p => (
                <option key={p.id} value={p.id}>{p.path}</option>
              ))}
            </select>
          </div>

          {/* Date Presets */}
          <div className="date-filter-group" role="group" aria-label="Metrics Date Presets">
            <button
              type="button"
              className={`date-preset-btn ${datePreset === '7d' ? 'active' : ''}`}
              onClick={() => setDatePreset('7d')}
            >
              7D
            </button>
            <button
              type="button"
              className={`date-preset-btn ${datePreset === '14d' ? 'active' : ''}`}
              onClick={() => setDatePreset('14d')}
            >
              14D
            </button>
            <button
              type="button"
              className={`date-preset-btn ${datePreset === '30d' ? 'active' : ''}`}
              onClick={() => setDatePreset('30d')}
            >
              30D
            </button>
            <button
              type="button"
              className={`date-preset-btn ${datePreset === '90d' ? 'active' : ''}`}
              onClick={() => setDatePreset('90d')}
            >
              90D
            </button>
          </div>
        </div>
      </div>

      {/* Truncation Alert */}
      {isTruncated && (
        <div className="sync-result-box result-deferred" style={{ marginBottom: '20px' }}>
          <AlertTriangle size={18} className="result-icon deferred" />
          <div className="result-text">
            <div className="result-heading">Notice: Query Result Truncation</div>
            <div className="result-paragraph">
              Historical metric rows reached the 10,000 row ceiling (<code>possibly_truncated</code>).
              The time-series represents the top query records within the ceiling.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="sync-result-box result-error" style={{ marginBottom: '24px' }}>
          <AlertTriangle size={18} className="result-icon error" />
          <div className="result-text">
            <div className="result-heading">Metrics Error</div>
            <div className="result-paragraph">{error}</div>
            <button type="button" className="btn-secondary" onClick={() => loadMetrics(datePreset, selectedPageId)} style={{ marginTop: '10px' }}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Chart Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
        {/* Chart 1: Clicks & Impressions */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Search size={16} className="lime" />
              <span>Search Clicks & Impressions</span>
            </h2>
          </div>
          {isLoading ? (
            <div className="chart-empty-state" style={{ height: '240px' }}>Loading time-series...</div>
          ) : (
            <TimeSeriesChart
              data={clicksImpressionsChartData}
              xKey="date"
              yKey="clicks"
              label="Clicks"
              color="#d7ed83"
              secondaryKey="impressions"
              secondaryLabel="Impressions"
              secondaryColor="#315b55"
              height={240}
            />
          )}
        </div>

        {/* Chart 2: SERP Position & CTR */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <BarChart3 size={16} className="lime" />
              <span>Click-Through Rate (%) & Avg Position</span>
            </h2>
          </div>
          {isLoading ? (
            <div className="chart-empty-state" style={{ height: '240px' }}>Loading time-series...</div>
          ) : (
            <TimeSeriesChart
              data={positionCtrChartData}
              xKey="date"
              yKey="ctr"
              label="CTR (%)"
              color="#087c48"
              secondaryKey="avg_position"
              secondaryLabel="SERP Position"
              secondaryColor="#ffd166"
              height={240}
              isRate={true}
              yFormatter={(v) => `${Number(v).toFixed(1)}`}
            />
          )}
        </div>

        {/* Chart 3: GA4 Sessions & Conversions */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Users size={16} className="lime" />
              <span>Landing Page Sessions & Goal Conversions</span>
            </h2>
          </div>
          {isLoading ? (
            <div className="chart-empty-state" style={{ height: '240px' }}>Loading time-series...</div>
          ) : (
            <TimeSeriesChart
              data={sessionsConversionsChartData}
              xKey="date"
              yKey="sessions"
              label="Sessions"
              color="#3c8cf0"
              secondaryKey="conversions"
              secondaryLabel="Conversions"
              secondaryColor="#c9ebaa"
              height={240}
            />
          )}
        </div>

        {/* Chart 4: Engagement & Bounce Rate */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <BarChart3 size={16} className="lime" />
              <span>Engagement vs Bounce Rate (%)</span>
            </h2>
          </div>
          {isLoading ? (
            <div className="chart-empty-state" style={{ height: '240px' }}>Loading time-series...</div>
          ) : (
            <TimeSeriesChart
              data={engagementRatesChartData}
              xKey="date"
              yKey="engagement_rate"
              label="Engagement Rate (%)"
              color="#087c48"
              secondaryKey="bounce_rate"
              secondaryLabel="Bounce Rate (%)"
              secondaryColor="#ff8080"
              height={240}
              isRate={true}
              yFormatter={(v) => `${Number(v).toFixed(1)}%`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
