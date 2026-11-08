/**
 * GET /api/seo/overview
 * Aggregate summary analytics across Yorven's 9 monitored routes.
 * Requires Owner AAL2 JWT, Origin validation, and CSRF header.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import { getDatabaseAdapter } from '../auth/_utils.js';
import { authorizeOwnerRequest, setSeoSecurityHeaders } from './_auth.js';

/**
 * Validates real calendar date strings and ordering.
 */
export function validateDateRange(startDateStr, endDateStr) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDateStr) || !dateRegex.test(endDateStr)) {
    return { valid: false, error: 'INVALID_DATE_FORMAT', message: 'Dates must be in YYYY-MM-DD format' };
  }

  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);

  const startUtc = new Date(Date.UTC(sY, sM - 1, sD));
  const endUtc = new Date(Date.UTC(eY, eM - 1, eD));

  // Calendar validation
  if (
    startUtc.getUTCFullYear() !== sY ||
    startUtc.getUTCMonth() !== sM - 1 ||
    startUtc.getUTCDate() !== sD
  ) {
    return { valid: false, error: 'INVALID_START_DATE', message: `startDate '${startDateStr}' is not a valid calendar date` };
  }

  if (
    endUtc.getUTCFullYear() !== eY ||
    endUtc.getUTCMonth() !== eM - 1 ||
    endUtc.getUTCDate() !== eD
  ) {
    return { valid: false, error: 'INVALID_END_DATE', message: `endDate '${endDateStr}' is not a valid calendar date` };
  }

  if (endUtc.getTime() < startUtc.getTime()) {
    return { valid: false, error: 'INVALID_DATE_ORDER', message: 'endDate cannot be before startDate' };
  }

  const inclusiveDays = Math.round((endUtc.getTime() - startUtc.getTime()) / 86400000) + 1;
  if (inclusiveDays > 90) {
    return {
      valid: false,
      error: 'DATE_RANGE_EXCEEDED',
      inclusiveDays,
      message: `Requested range is ${inclusiveDays} inclusive calendar days; maximum permitted is 90 inclusive days.`
    };
  }

  return { valid: true, inclusiveDays, startUtc, endUtc };
}

export default async function handler(req, res) {
  setSeoSecurityHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET is permitted on /api/seo/overview' });
  }

  const authResult = await authorizeOwnerRequest(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({
      error: authResult.error,
      message: authResult.message
    });
  }

  // Parse date query params with default past 30 days
  const now = new Date();
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const defaultStart = new Date(Date.UTC(defaultEnd.getUTCFullYear(), defaultEnd.getUTCMonth(), defaultEnd.getUTCDate() - 29));

  const formatIso = (d) => d.toISOString().split('T')[0];

  const startDate = req.query?.startDate || formatIso(defaultStart);
  const endDate = req.query?.endDate || formatIso(defaultEnd);

  const dateCheck = validateDateRange(startDate, endDate);
  if (!dateCheck.valid) {
    return res.status(400).json({ error: dateCheck.error, message: dateCheck.message });
  }

  const db = getDatabaseAdapter();

  try {
    // 1. Fetch GSC metrics for date range
    const gscUrl = `${db.supabaseUrl}/rest/v1/seo_search_console_metrics?metric_date=gte.${startDate}&metric_date=lte.${endDate}&select=clicks,impressions,ctr,position`;
    const gscRes = await fetch(gscUrl, { headers: db.getPostgrestHeaders('public') });
    const gscRows = gscRes.ok ? await gscRes.json() : [];

    let totalClicks = 0;
    let totalImpressions = 0;
    let sumPositionWeighted = 0;

    for (const r of gscRows) {
      const c = Number(r.clicks) || 0;
      const imp = Number(r.impressions) || 0;
      const pos = Number(r.position) || 0;

      totalClicks += c;
      totalImpressions += imp;
      sumPositionWeighted += pos * imp;
    }

    const aggregateCtr = totalImpressions > 0
      ? Number((totalClicks / totalImpressions).toFixed(4))
      : 0.0;

    const aggregatePosition = totalImpressions > 0
      ? Number((sumPositionWeighted / totalImpressions).toFixed(2))
      : 0.0;

    // 2. Fetch GA4 metrics for date range
    const ga4Url = `${db.supabaseUrl}/rest/v1/seo_ga4_metrics?metric_date=gte.${startDate}&metric_date=lte.${endDate}&select=sessions,active_users,bounce_rate,engagement_rate,avg_session_duration_seconds,conversions`;
    const ga4Res = await fetch(ga4Url, { headers: db.getPostgrestHeaders('public') });
    const ga4Rows = ga4Res.ok ? await ga4Res.json() : [];

    let totalSessions = 0;
    let totalActiveUsers = 0;
    let sumBounceWeighted = 0;
    let sumEngagementWeighted = 0;
    let sumDurationWeighted = 0;
    let totalConversions = 0;

    for (const r of ga4Rows) {
      const s = Number(r.sessions) || 0;
      const u = Number(r.active_users) || 0;
      const b = Number(r.bounce_rate) || 0;
      const e = Number(r.engagement_rate) || 0;
      const d = Number(r.avg_session_duration_seconds) || 0;
      const conv = Number(r.conversions) || 0;

      totalSessions += s;
      totalActiveUsers += u;
      sumBounceWeighted += b * s;
      sumEngagementWeighted += e * s;
      sumDurationWeighted += d * s;
      totalConversions += conv;
    }

    const aggregateBounceRate = totalSessions > 0
      ? Number((sumBounceWeighted / totalSessions).toFixed(4))
      : 0.0;

    const aggregateEngagementRate = totalSessions > 0
      ? Number((sumEngagementWeighted / totalSessions).toFixed(4))
      : 0.0;

    const aggregateDuration = totalSessions > 0
      ? Number((sumDurationWeighted / totalSessions).toFixed(2))
      : 0.0;

    return res.status(200).json({
      date_range: {
        startDate,
        endDate,
        inclusive_days: dateCheck.inclusiveDays
      },
      metrics: {
        clicks: totalClicks,
        impressions: totalImpressions,
        ctr: aggregateCtr,
        avg_position: aggregatePosition,
        monitored_route_organic_landing_sessions: totalSessions,
        aggregate_daily_active_users: totalActiveUsers,
        bounce_rate: aggregateBounceRate,
        engagement_rate: aggregateEngagementRate,
        avg_session_duration_seconds: aggregateDuration,
        conversions: totalConversions
      },
      monitored_routes_count: 9,
      disclaimers: {
        scope_note: "Sessions represent organic visits landing on one of Yorven's 9 monitored routes. Active users represent the sum of daily landing users and is not cross-day de-duplicated."
      }
    });
  } catch (err) {
    console.error('[Overview Endpoint Error]', err);
    return res.status(500).json({
      error: 'OVERVIEW_QUERY_ERROR',
      message: err.message || 'Failed to query overview metrics'
    });
  }
}
