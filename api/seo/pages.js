/**
 * GET /api/seo/pages
 * Monitored routes performance and crawl status endpoint for Yorven SEO Dashboard.
 * Supports /api/seo/pages (all 9 routes) and /api/seo/pages?id=... (single route detail).
 * Requires Owner AAL2 JWT, Origin validation, and CSRF header.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import { getDatabaseAdapter } from '../auth/_utils.js';
import { authorizeOwnerRequest, setSeoSecurityHeaders } from './_auth.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serializes a database page record to truthful indexing status.
 * If last_crawled_at is null, is_indexed is serialized as null and indexing_status_verified as false.
 */
function serializePageRecord(page, metrics30d = null) {
  const isVerified = Boolean(page.last_crawled_at);

  return {
    id: page.id,
    path: page.path,
    title: page.title,
    canonical_url: page.canonical_url,
    is_indexed: isVerified ? Boolean(page.is_indexed) : null,
    indexing_status_verified: isVerified,
    last_crawled_at: page.last_crawled_at || null,
    updated_at: page.updated_at,
    metrics_30d: metrics30d
  };
}

export default async function handler(req, res) {
  setSeoSecurityHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET is permitted on /api/seo/pages' });
  }

  const authResult = await authorizeOwnerRequest(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({
      error: authResult.error,
      message: authResult.message
    });
  }

  const pageId = req.query?.id || null;
  if (pageId && !UUID_REGEX.test(pageId)) {
    return res.status(400).json({ error: 'INVALID_PAGE_ID', message: 'id parameter must be a valid UUID' });
  }

  const db = getDatabaseAdapter();

  try {
    // 30-day date window for summary metrics
    const now = new Date();
    const endStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().split('T')[0];
    const startStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30)).toISOString().split('T')[0];

    if (pageId) {
      // 1. Single Page Detail
      const pageRes = await fetch(
        `${db.supabaseUrl}/rest/v1/seo_pages?id=eq.${pageId}&select=id,path,title,meta_description,canonical_url,is_indexed,last_crawled_at,updated_at`,
        { headers: db.getPostgrestHeaders('public') }
      );
      if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`);

      const pages = await pageRes.json();
      if (!Array.isArray(pages) || pages.length === 0) {
        return res.status(404).json({ error: 'PAGE_NOT_FOUND', message: `No monitored route found with ID ${pageId}` });
      }
      const page = pages[0];

      // Fetch 30-day GSC queries for this page
      const gscRes = await fetch(
        `${db.supabaseUrl}/rest/v1/seo_search_console_metrics?page_id=eq.${pageId}&metric_date=gte.${startStr}&metric_date=lte.${endStr}&order=clicks.desc,impressions.desc&limit=100&select=query,clicks,impressions,ctr,position,metric_date`,
        { headers: db.getPostgrestHeaders('public') }
      );
      const gscQueries = gscRes.ok ? await gscRes.json() : [];

      // Calculate 30-day page totals
      let totalClicks = 0;
      let totalImpressions = 0;
      let sumPos = 0;
      for (const q of gscQueries) {
        const c = Number(q.clicks) || 0;
        const imp = Number(q.impressions) || 0;
        totalClicks += c;
        totalImpressions += imp;
        sumPos += (Number(q.position) || 0) * imp;
      }

      // Fetch 30-day GA4 metrics for this page
      const ga4Res = await fetch(
        `${db.supabaseUrl}/rest/v1/seo_ga4_metrics?page_id=eq.${pageId}&metric_date=gte.${startStr}&metric_date=lte.${endStr}&select=sessions,active_users,bounce_rate,engagement_rate,avg_session_duration_seconds,conversions`,
        { headers: db.getPostgrestHeaders('public') }
      );
      const ga4Rows = ga4Res.ok ? await ga4Res.json() : [];

      let totalSessions = 0;
      let totalUsers = 0;
      let sumBounce = 0;
      let sumEngage = 0;
      let sumDuration = 0;
      let totalConversions = 0;

      for (const g of ga4Rows) {
        const s = Number(g.sessions) || 0;
        totalSessions += s;
        totalUsers += Number(g.active_users) || 0;
        sumBounce += (Number(g.bounce_rate) || 0) * s;
        sumEngage += (Number(g.engagement_rate) || 0) * s;
        sumDuration += (Number(g.avg_session_duration_seconds) || 0) * s;
        totalConversions += Number(g.conversions) || 0;
      }

      const metrics30d = {
        clicks: totalClicks,
        impressions: totalImpressions,
        ctr: totalImpressions > 0 ? Number((totalClicks / totalImpressions).toFixed(4)) : 0.0,
        avg_position: totalImpressions > 0 ? Number((sumPos / totalImpressions).toFixed(2)) : null,
        landing_sessions: totalSessions,
        active_users: totalUsers,
        bounce_rate: totalSessions > 0 ? Number((sumBounce / totalSessions).toFixed(4)) : 0.0,
        engagement_rate: totalSessions > 0 ? Number((sumEngage / totalSessions).toFixed(4)) : 0.0,
        avg_session_duration_seconds: totalSessions > 0 ? Number((sumDuration / totalSessions).toFixed(2)) : 0.0,
        conversions: totalConversions
      };

      const serialized = serializePageRecord(page, metrics30d);
      serialized.meta_description = page.meta_description;
      serialized.top_queries_30d = gscQueries.slice(0, 50);

      return res.status(200).json({ page: serialized });
    }

    // 2. All 9 Monitored Routes List
    const pagesRes = await fetch(
      `${db.supabaseUrl}/rest/v1/seo_pages?select=id,path,title,canonical_url,is_indexed,last_crawled_at,updated_at&order=path.asc`,
      { headers: db.getPostgrestHeaders('public') }
    );
    if (!pagesRes.ok) throw new Error(`HTTP ${pagesRes.status}`);

    const pages = await pagesRes.json();

    // Fetch 30-day GSC metrics grouped by page_id
    const gscSummaryRes = await fetch(
      `${db.supabaseUrl}/rest/v1/seo_search_console_metrics?metric_date=gte.${startStr}&metric_date=lte.${endStr}&select=page_id,clicks,impressions,position`,
      { headers: db.getPostgrestHeaders('public') }
    );
    const allGsc = gscSummaryRes.ok ? await gscSummaryRes.json() : [];

    const gscByPage = new Map();
    for (const r of allGsc) {
      if (!gscByPage.has(r.page_id)) {
        gscByPage.set(r.page_id, { clicks: 0, impressions: 0, sumPos: 0 });
      }
      const p = gscByPage.get(r.page_id);
      const c = Number(r.clicks) || 0;
      const imp = Number(r.impressions) || 0;
      p.clicks += c;
      p.impressions += imp;
      p.sumPos += (Number(r.position) || 0) * imp;
    }

    // Fetch 30-day GA4 metrics grouped by page_id
    const ga4SummaryRes = await fetch(
      `${db.supabaseUrl}/rest/v1/seo_ga4_metrics?metric_date=gte.${startStr}&metric_date=lte.${endStr}&select=page_id,sessions,active_users`,
      { headers: db.getPostgrestHeaders('public') }
    );
    const allGa4 = ga4SummaryRes.ok ? await ga4SummaryRes.json() : [];

    const ga4ByPage = new Map();
    for (const r of allGa4) {
      if (!ga4ByPage.has(r.page_id)) {
        ga4ByPage.set(r.page_id, { sessions: 0, activeUsers: 0 });
      }
      const p = ga4ByPage.get(r.page_id);
      p.sessions += Number(r.sessions) || 0;
      p.activeUsers += Number(r.active_users) || 0;
    }

    const serializedPages = pages.map((page) => {
      const gsc = gscByPage.get(page.id) || { clicks: 0, impressions: 0, sumPos: 0 };
      const ga4 = ga4ByPage.get(page.id) || { sessions: 0, activeUsers: 0 };

      const metrics30d = {
        clicks: gsc.clicks,
        impressions: gsc.impressions,
        ctr: gsc.impressions > 0 ? Number((gsc.clicks / gsc.impressions).toFixed(4)) : 0.0,
        avg_position: gsc.impressions > 0 ? Number((gsc.sumPos / gsc.impressions).toFixed(2)) : null,
        landing_sessions: ga4.sessions,
        active_users: ga4.activeUsers
      };

      return serializePageRecord(page, metrics30d);
    });

    return res.status(200).json({
      pages: serializedPages,
      total_monitored_routes: serializedPages.length,
      disclaimers: {
        indexing_note: 'is_indexed is null and indexing_status_verified is false until Google URL Inspection API is executed (deferred to Step 2.9).'
      }
    });
  } catch (err) {
    console.error('[Pages Endpoint Error]', err);
    return res.status(500).json({
      error: 'PAGES_QUERY_ERROR',
      message: err.message || 'Failed to query monitored routes'
    });
  }
}
