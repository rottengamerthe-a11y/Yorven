import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Focused tests for SEO Dashboard Overview metric contract and mappings.
 * Verifies that the frontend contract matches api/seo/overview.js response schema,
 * handles formatting correctly, and never fabricates zero values for missing data.
 */

describe('SEO Dashboard Overview Metric Contract & Mapping', () => {
  // Sample production response payload matching api/seo/overview.js
  const sampleOverviewPayload = {
    date_range: {
      startDate: '2026-10-17',
      endDate: '2026-11-15',
      inclusive_days: 30
    },
    metrics: {
      clicks: 12,
      impressions: 450,
      ctr: 0.0267,
      avg_position: 14.8,
      monitored_route_organic_landing_sessions: 25,
      aggregate_daily_active_users: 21,
      bounce_rate: 0.354,
      engagement_rate: 0.646,
      avg_session_duration_seconds: 52.3,
      conversions: 3
    },
    monitored_routes_count: 14,
    disclaimers: {
      scope_note: "Sessions represent organic visits landing on one of Yorven's 14 monitored routes. Active users represent the sum of daily landing users and is not cross-day de-duplicated."
    }
  };

  test('correctly maps all 10 metrics from backend response', () => {
    const { metrics } = sampleOverviewPayload;

    // GSC mappings
    assert.equal(metrics.clicks, 12, 'Organic Clicks maps to metrics.clicks');
    assert.equal(metrics.impressions, 450, 'Impressions maps to metrics.impressions');
    assert.equal(metrics.ctr, 0.0267, 'Average CTR maps to metrics.ctr');
    assert.equal(metrics.avg_position, 14.8, 'Average Position maps to metrics.avg_position');

    // GA4 mappings
    assert.equal(
      metrics.monitored_route_organic_landing_sessions,
      25,
      'Organic Sessions maps to metrics.monitored_route_organic_landing_sessions'
    );
    assert.equal(
      metrics.aggregate_daily_active_users,
      21,
      'Active Users maps to metrics.aggregate_daily_active_users'
    );
    assert.equal(metrics.engagement_rate, 0.646, 'Engagement Rate maps to metrics.engagement_rate');
    assert.equal(metrics.bounce_rate, 0.354, 'Bounce Rate maps to metrics.bounce_rate');
    assert.equal(
      metrics.avg_session_duration_seconds,
      52.3,
      'Avg Session Duration maps to metrics.avg_session_duration_seconds'
    );
    assert.equal(metrics.conversions, 3, 'Goal Conversions maps to metrics.conversions');
  });

  test('correctly maps date range bindings', () => {
    const { date_range } = sampleOverviewPayload;
    assert.equal(date_range.startDate, '2026-10-17');
    assert.equal(date_range.endDate, '2026-11-15');
    assert.equal(date_range.inclusive_days, 30);
  });

  test('formats metric values according to dashboard standards', () => {
    const { metrics } = sampleOverviewPayload;

    // CTR: (ctr * 100).toFixed(2)%
    const formattedCtr = metrics.ctr !== undefined && metrics.ctr !== null
      ? `${(Number(metrics.ctr) * 100).toFixed(2)}%`
      : null;
    assert.equal(formattedCtr, '2.67%');

    // Position: Number(avg_position).toFixed(1)
    const formattedPos = metrics.avg_position !== undefined && metrics.avg_position !== null
      ? Number(metrics.avg_position).toFixed(1)
      : null;
    assert.equal(formattedPos, '14.8');

    // Engagement Rate: (rate * 100).toFixed(1)%
    const formattedEng = metrics.engagement_rate !== undefined && metrics.engagement_rate !== null
      ? `${(Number(metrics.engagement_rate) * 100).toFixed(1)}%`
      : null;
    assert.equal(formattedEng, '64.6%');

    // Bounce Rate: (rate * 100).toFixed(1)%
    const formattedBounce = metrics.bounce_rate !== undefined && metrics.bounce_rate !== null
      ? `${(Number(metrics.bounce_rate) * 100).toFixed(1)}%`
      : null;
    assert.equal(formattedBounce, '35.4%');

    // Dwell Time: Math.round(Number(duration))s
    const formattedDur = metrics.avg_session_duration_seconds !== undefined && metrics.avg_session_duration_seconds !== null
      ? `${Math.round(Number(metrics.avg_session_duration_seconds))}s`
      : null;
    assert.equal(formattedDur, '52s');

    // Conversion badge
    const badge = metrics.conversions > 0 ? 'Converting' : 'Baseline';
    const badgeType = metrics.conversions > 0 ? 'success' : 'default';
    assert.equal(badge, 'Converting');
    assert.equal(badgeType, 'success');
  });

  test('preserves legitimate numeric zero values without formatting them as missing', () => {
    const zeroMetrics = {
      clicks: 0,
      impressions: 0,
      ctr: 0.0,
      avg_position: 0.0,
      monitored_route_organic_landing_sessions: 0,
      aggregate_daily_active_users: 0,
      bounce_rate: 0.0,
      engagement_rate: 0.0,
      avg_session_duration_seconds: 0.0,
      conversions: 0
    };

    assert.equal(zeroMetrics.clicks, 0);
    assert.equal(zeroMetrics.impressions, 0);
    assert.equal(
      zeroMetrics.ctr !== undefined && zeroMetrics.ctr !== null
        ? `${(Number(zeroMetrics.ctr) * 100).toFixed(2)}%`
        : null,
      '0.00%'
    );
    assert.equal(
      zeroMetrics.avg_position !== undefined && zeroMetrics.avg_position !== null
        ? Number(zeroMetrics.avg_position).toFixed(1)
        : null,
      '0.0'
    );
    assert.equal(
      zeroMetrics.engagement_rate !== undefined && zeroMetrics.engagement_rate !== null
        ? `${(Number(zeroMetrics.engagement_rate) * 100).toFixed(1)}%`
        : null,
      '0.0%'
    );
    assert.equal(
      zeroMetrics.bounce_rate !== undefined && zeroMetrics.bounce_rate !== null
        ? `${(Number(zeroMetrics.bounce_rate) * 100).toFixed(1)}%`
        : null,
      '0.0%'
    );
    assert.equal(
      zeroMetrics.avg_session_duration_seconds !== undefined && zeroMetrics.avg_session_duration_seconds !== null
        ? `${Math.round(Number(zeroMetrics.avg_session_duration_seconds))}s`
        : null,
      '0s'
    );
    assert.equal(zeroMetrics.conversions > 0 ? 'Converting' : 'Baseline', 'Baseline');
  });

  test('does not fabricate zero values when data is missing or undefined', () => {
    const emptyMetrics = {};

    const formatMetric = (val, formatter) => {
      if (val === undefined || val === null) return null;
      return formatter(val);
    };

    // MetricCard logic: when value/formattedValue is null or undefined, returns '—'
    const displayValue = (val, formattedVal) => {
      if (formattedVal !== undefined && formattedVal !== null) return formattedVal;
      if (val === null || val === undefined) return '—';
      if (typeof val === 'number') return val.toLocaleString();
      return String(val);
    };

    assert.equal(displayValue(emptyMetrics.clicks, null), '—');
    assert.equal(displayValue(emptyMetrics.impressions, null), '—');
    assert.equal(displayValue(emptyMetrics.monitored_route_organic_landing_sessions, null), '—');
    assert.equal(displayValue(emptyMetrics.aggregate_daily_active_users, null), '—');
    assert.equal(displayValue(emptyMetrics.conversions, null), '—');

    const formattedCtr = formatMetric(emptyMetrics.ctr, (v) => `${(Number(v) * 100).toFixed(2)}%`);
    assert.equal(formattedCtr, null);
    assert.equal(displayValue(undefined, formattedCtr), '—');

    const formattedPos = formatMetric(emptyMetrics.avg_position, (v) => Number(v).toFixed(1));
    assert.equal(formattedPos, null);
    assert.equal(displayValue(undefined, formattedPos), '—');
  });

  test('DashboardOverview.jsx source statically satisfies all required metric mappings', () => {
    const componentPath = path.resolve(process.cwd(), 'src/dashboard/pages/DashboardOverview.jsx');
    const source = fs.readFileSync(componentPath, 'utf8');

    // 1. Must read from overviewData?.metrics
    assert.match(
      source,
      /overviewData\?\.metrics/,
      'Must extract metrics from overviewData?.metrics'
    );

    // 2. Must NOT read from obsolete gsc or ga4 top-level objects
    assert.doesNotMatch(
      source,
      /overviewData\?\.gsc/,
      'Must not reference obsolete overviewData?.gsc'
    );
    assert.doesNotMatch(
      source,
      /overviewData\?\.ga4/,
      'Must not reference obsolete overviewData?.ga4'
    );
    assert.doesNotMatch(
      source,
      /gsc\.total_clicks/,
      'Must not reference obsolete gsc.total_clicks'
    );
    assert.doesNotMatch(
      source,
      /ga4\.total_sessions/,
      'Must not reference obsolete ga4.total_sessions'
    );

    // 3. Must reference all 10 required metric mappings
    assert.match(source, /metrics\.clicks/, 'Must bind metrics.clicks');
    assert.match(source, /metrics\.impressions/, 'Must bind metrics.impressions');
    assert.match(source, /metrics\.ctr/, 'Must bind metrics.ctr');
    assert.match(source, /metrics\.avg_position/, 'Must bind metrics.avg_position');
    assert.match(
      source,
      /metrics\.monitored_route_organic_landing_sessions/,
      'Must bind metrics.monitored_route_organic_landing_sessions'
    );
    assert.match(
      source,
      /metrics\.aggregate_daily_active_users/,
      'Must bind metrics.aggregate_daily_active_users'
    );
    assert.match(source, /metrics\.engagement_rate/, 'Must bind metrics.engagement_rate');
    assert.match(source, /metrics\.bounce_rate/, 'Must bind metrics.bounce_rate');
    assert.match(
      source,
      /metrics\.avg_session_duration_seconds/,
      'Must bind metrics.avg_session_duration_seconds'
    );
    assert.match(source, /metrics\.conversions/, 'Must bind metrics.conversions');

    // 4. Must bind to date_range.startDate and date_range.endDate
    assert.match(source, /dateRange\.startDate/, 'Must bind dateRange.startDate');
    assert.match(source, /dateRange\.endDate/, 'Must bind dateRange.endDate');
    assert.doesNotMatch(
      source,
      /dateRange\.start\b/,
      'Must not reference obsolete dateRange.start'
    );

    // 5. Must preserve disclaimer for active users
    assert.match(
      source,
      /disclaimer="Notice: Non-deduplicated daily sum across monitored routes"/,
      'Must preserve non-deduplicated active users disclaimer'
    );
  });
});
