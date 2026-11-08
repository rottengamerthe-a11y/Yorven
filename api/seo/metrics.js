/**
 * GET /api/seo/metrics
 * Historical daily time-series metrics for Yorven SEO Dashboard charts.
 * Requires Owner AAL2 JWT, Origin validation, and CSRF header.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import { getDatabaseAdapter } from '../auth/_utils.js';
import { authorizeOwnerRequest, setSeoSecurityHeaders } from './_auth.js';
import { validateDateRange } from './overview.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  setSeoSecurityHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET is permitted on /api/seo/metrics' });
  }

  const authResult = await authorizeOwnerRequest(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({
      error: authResult.error,
      message: authResult.message
    });
  }

  // Parse and validate page_id if supplied
  const pageId = req.query?.page_id || null;
  if (pageId && !UUID_REGEX.test(pageId)) {
    return res.status(400).json({ error: 'INVALID_PAGE_ID', message: 'page_id must be a valid UUID' });
  }

  // Parse and validate date range (max 90 inclusive days)
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
    // 1. Deterministic Bounded Retrieval of GSC Query Metrics (ceiling: 10,000 rows)
    const MAX_GSC_ROWS = 10000;
    const GSC_PAGE_SIZE = 1000;
    const allGscRows = [];
    let offset = 0;
    let isTruncated = 'complete';
    let reachedCeiling = false;

    while (offset < MAX_GSC_ROWS) {
      let gscUrl = `${db.supabaseUrl}/rest/v1/seo_search_console_metrics?metric_date=gte.${startDate}&metric_date=lte.${endDate}&order=metric_date.asc,page_id.asc,query.asc&limit=${GSC_PAGE_SIZE}&offset=${offset}&select=metric_date,page_id,query,clicks,impressions,ctr,position`;
      if (pageId) {
        gscUrl += `&page_id=eq.${pageId}`;
      }

      const gscRes = await fetch(gscUrl, { headers: db.getPostgrestHeaders('public') });
      if (!gscRes.ok) break;

      const pageRows = await gscRes.json();
      if (!Array.isArray(pageRows) || pageRows.length === 0) break;

      allGscRows.push(...pageRows);
      if (pageRows.length < GSC_PAGE_SIZE) break;

      offset += pageRows.length;
      if (offset >= MAX_GSC_ROWS && pageRows.length === GSC_PAGE_SIZE) {
        reachedCeiling = true;
      }
    }

    if (reachedCeiling) {
      isTruncated = 'possibly_truncated';
    }

    // 2. Fetch GA4 Metrics
    let ga4Url = `${db.supabaseUrl}/rest/v1/seo_ga4_metrics?metric_date=gte.${startDate}&metric_date=lte.${endDate}&order=metric_date.asc,page_id.asc&limit=1000&select=metric_date,page_id,sessions,active_users,bounce_rate,engagement_rate,avg_session_duration_seconds,conversions`;
    if (pageId) {
      ga4Url += `&page_id=eq.${pageId}`;
    }

    const ga4Res = await fetch(ga4Url, { headers: db.getPostgrestHeaders('public') });
    const allGa4Rows = ga4Res.ok ? await ga4Res.json() : [];

    // 3. Group GSC & GA4 rows by metric_date
    const gscByDate = new Map();
    for (const r of allGscRows) {
      const d = r.metric_date;
      if (!gscByDate.has(d)) gscByDate.set(d, []);
      gscByDate.get(d).push(r);
    }

    const ga4ByDate = new Map();
    for (const r of allGa4Rows) {
      const d = r.metric_date;
      if (!ga4ByDate.has(d)) ga4ByDate.set(d, []);
      ga4ByDate.get(d).push(r);
    }

    // 4. Generate complete daily time-series sequence
    const series = [];
    const curDate = new Date(dateCheck.startUtc.getTime());
    const endDateUtc = dateCheck.endUtc.getTime();

    while (curDate.getTime() <= endDateUtc) {
      const dateStr = formatIso(curDate);
      const gscDailyRows = gscByDate.get(dateStr) || null;
      const ga4DailyRows = ga4ByDate.get(dateStr) || null;

      let gscDaily = null;
      if (gscDailyRows) {
        let clicks = 0;
        let impressions = 0;
        let sumPos = 0;

        for (const row of gscDailyRows) {
          const c = Number(row.clicks) || 0;
          const imp = Number(row.impressions) || 0;
          const p = Number(row.position) || 0;

          clicks += c;
          impressions += imp;
          sumPos += p * imp;
        }

        gscDaily = {
          clicks,
          impressions,
          ctr: impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0.0,
          avg_position: impressions > 0 ? Number((sumPos / impressions).toFixed(2)) : null
        };
      }

      let ga4Daily = null;
      if (ga4DailyRows) {
        let sessions = 0;
        let activeUsers = 0;
        let sumBounce = 0;
        let sumEngagement = 0;
        let sumDuration = 0;
        let conversions = 0;

        for (const row of ga4DailyRows) {
          const s = Number(row.sessions) || 0;
          const u = Number(row.active_users) || 0;
          const b = Number(row.bounce_rate) || 0;
          const e = Number(row.engagement_rate) || 0;
          const d = Number(row.avg_session_duration_seconds) || 0;
          const conv = Number(row.conversions) || 0;

          sessions += s;
          activeUsers += u;
          sumBounce += b * s;
          sumEngagement += e * s;
          sumDuration += d * s;
          conversions += conv;
        }

        ga4Daily = {
          landing_sessions: sessions,
          active_users: activeUsers,
          bounce_rate: sessions > 0 ? Number((sumBounce / sessions).toFixed(4)) : 0.0,
          engagement_rate: sessions > 0 ? Number((sumEngagement / sessions).toFixed(4)) : 0.0,
          avg_session_duration_seconds: sessions > 0 ? Number((sumDuration / sessions).toFixed(2)) : 0.0,
          conversions
        };
      }

      series.push({
        date: dateStr,
        gsc: gscDaily,
        ga4: ga4Daily
      });

      curDate.setUTCDate(curDate.getUTCDate() + 1);
    }

    return res.status(200).json({
      date_range: {
        startDate,
        endDate,
        inclusive_days: dateCheck.inclusiveDays
      },
      page_id: pageId,
      is_truncated: isTruncated,
      truncation_warning: isTruncated === 'possibly_truncated'
        ? 'The query returned the maximum ceiling of 10,000 records. Aggregates reflect the first 10,000 records in deterministic order (metric_date, page_id, query); additional matching query records may exist.'
        : undefined,
      series
    });
  } catch (err) {
    console.error('[Metrics Endpoint Error]', err);
    return res.status(500).json({
      error: 'METRICS_QUERY_ERROR',
      message: err.message || 'Failed to query historical metrics'
    });
  }
}
