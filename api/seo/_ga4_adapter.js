/**
 * Google Analytics 4 (GA4) Data API Adapter
 * Yorven SEO Dashboard — Phase 2 Serverless Endpoints
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import { YORVEN_MONITORED_PATHS } from './_gsc_adapter.js';
import { getGoogleAccessToken } from './_google_auth.js';

export const GA4_OAUTH_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export const ALLOWED_GA4_ORIGINS = new Set([
  'https://yorven.in'
]);

/**
 * Normalizes a GA4 landing page dimension value to a verified local route path.
 * Strict rules:
 * - Reject absolute URLs whose origin is NOT a Yorven origin.
 * - Strip query strings and hash fragments.
 * - Normalize case and trailing slashes.
 * - Match against the 9 monitored routes; discard unknown routes, 404s, or (not set).
 */
export function normalizeGa4LandingPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed === '(not set)') return null;

  try {
    let pathname;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      if (!ALLOWED_GA4_ORIGINS.has(parsed.origin.toLowerCase())) {
        return null; // Reject non-Yorven origins
      }
      pathname = parsed.pathname;
    } else {
      // Relative path
      const parsed = new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, 'https://yorven.in');
      pathname = parsed.pathname;
    }

    let normalized = pathname.trim().toLowerCase();
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    const cleanPath = normalized || '/';
    return YORVEN_MONITORED_PATHS.has(cleanPath) ? cleanPath : null;
  } catch {
    return null;
  }
}

/**
 * Validates a numeric metric value.
 * - Rejects non-finite (NaN, Infinity) or unparseable values by returning null.
 * - Clamps negative values to 0 with a warning.
 * - Clamps rates to [0.0, 1.0].
 */
export function validateGa4Metric(val, fieldName, isRate = false) {
  if (val === null || val === undefined || val === '') {
    return 0; // Legitimate empty / zero
  }

  const num = Number(val);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    console.warn(`[GA4 Sanitizer] Non-finite value '${val}' in metric '${fieldName}'; rejected.`);
    return null; // Signals invalid metric
  }

  if (num < 0) {
    console.warn(`[GA4 Sanitizer] Negative value '${num}' in metric '${fieldName}'; clamped to 0.`);
    return 0;
  }

  if (isRate) {
    return Math.max(0, Math.min(1.0, num));
  }

  return num;
}

let customGa4Fetcher = null;

export function setCustomGa4Fetcher(fetcher) {
  customGa4Fetcher = fetcher;
}

export function getCustomGa4Fetcher() {
  return customGa4Fetcher;
}

/**
 * Validates GA4 property ID. Must be a non-empty numeric string (or 'properties/12345').
 *
 * @param {string} propertyId
 * @returns {string} Clean numeric property ID
 */
export function validateGa4PropertyId(propertyId) {
  if (!propertyId || typeof propertyId !== 'string') {
    throw new Error('CONFIG_ERROR: GA4_PROPERTY_ID is required and must be configured');
  }
  let clean = propertyId.trim();
  if (clean.startsWith('properties/')) {
    clean = clean.slice('properties/'.length).trim();
  }
  if (!/^\d+$/.test(clean)) {
    throw new Error(`CONFIG_ERROR: Malformed GA4_PROPERTY_ID '${propertyId}': must be numeric`);
  }
  return clean;
}

/**
 * Fetches organic landing page performance from GA4 and aggregates rows in-memory
 * to guarantee at most ONE output row per (page_id, metric_date).
 *
 * @param {Object} options
 * @param {string} options.profile - 'manual' | 'worker'
 * @param {string} options.startDate - 'YYYY-MM-DD'
 * @param {string} options.endDate - 'YYYY-MM-DD'
 * @param {Map<string, string>} options.pageIdMap - path -> page_id mapping
 * @param {AbortSignal} [options.signal] - optional cancellation signal
 */
export async function fetchGa4Metrics({
  profile = 'manual',
  startDate,
  endDate,
  pageIdMap,
  signal
}) {
  const isManual = profile === 'manual';
  const limit = isManual ? 250 : 2500;
  const maxPages = isManual ? 1 : 2;
  const requestTimeoutMs = isManual ? 1200 : 5000;
  const maxRetries = isManual ? 0 : 3;

  // Validate GA4 property ID upfront
  const propertyId = validateGa4PropertyId(process.env.GA4_PROPERTY_ID);

  // If using custom mock fetcher, allow running without real Google credentials
  if (!customGa4Fetcher) {
    if (!process.env.GA4_CLIENT_EMAIL || !process.env.GA4_CLIENT_EMAIL.trim()) {
      throw new Error('CONFIG_ERROR: GA4_CLIENT_EMAIL must be configured');
    }
    if (!process.env.GA4_PRIVATE_KEY || !process.env.GA4_PRIVATE_KEY.trim()) {
      throw new Error('CONFIG_ERROR: GA4_PRIVATE_KEY must be configured');
    }
  }

  const allRawRows = [];
  let pageCount = 0;
  let offset = 0;

  while (pageCount < maxPages) {
    pageCount++;

    const payload = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'date' },
        { name: 'landingPagePlusQueryString' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'bounceRate' },
        { name: 'engagementRate' },
        { name: 'averageSessionDuration' },
        { name: 'conversions' }
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionDefaultChannelGroup',
          stringFilter: {
            matchType: 'EXACT',
            value: 'Organic Search'
          }
        }
      },
      limit,
      offset
    };

    let responseData = null;
    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
      if (signal?.aborted) {
        throw new Error('GA4_FETCH_ABORTED: Request cancelled');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
      const combinedSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;

      try {
        if (customGa4Fetcher) {
          responseData = await customGa4Fetcher({ propertyId, payload, signal: combinedSignal });
        } else {
          // Obtain valid service-account OAuth2 access token
          const accessToken = await getGoogleAccessToken({
            clientEmail: process.env.GA4_CLIENT_EMAIL,
            privateKey: process.env.GA4_PRIVATE_KEY,
            scope: GA4_OAUTH_SCOPE,
            signal: combinedSignal
          });

          const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload),
            signal: combinedSignal
          });

          if (!res.ok) {
            let errText = '';
            try {
              const errJson = await res.json();
              errText = errJson?.error?.message || JSON.stringify(errJson);
            } catch {
              errText = await res.text().catch(() => '');
            }
            const err = new Error(`GA4 API HTTP ${res.status}: ${errText}`);
            err.status = res.status;
            throw err;
          }
          responseData = await res.json();
        }

        clearTimeout(timeoutId);
        break; // Success
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        // Do not retry on configuration errors or client auth/permission rejection (401, 403)
        if (err.message?.startsWith('CONFIG_ERROR:') || err.status === 401 || err.status === 403) {
          throw err;
        }
        attempt++;
        if (attempt <= maxRetries && !signal?.aborted) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    if (!responseData) {
      throw lastError || new Error('GA4_FETCH_FAILED: Failed to fetch report from GA4');
    }

    const rawRows = responseData.rows || [];
    allRawRows.push(...rawRows);

    if (rawRows.length < limit) {
      break;
    }
    offset += rawRows.length;
  }

  // In-Memory Pre-Aggregation by unique conflict key (page_id, metric_date)
  const aggregatedMap = new Map();

  for (const rawRow of allRawRows) {
    if (!rawRow.dimensionValues || rawRow.dimensionValues.length < 2) continue;

    const rawDate = rawRow.dimensionValues[0]?.value; // Format: 'YYYYMMDD' or 'YYYY-MM-DD'
    let metricDate = null;
    if (rawDate && /^\d{8}$/.test(rawDate)) {
      metricDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    } else if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      metricDate = rawDate;
    }
    if (!metricDate) continue;

    const rawLanding = rawRow.dimensionValues[1]?.value;
    const cleanPath = normalizeGa4LandingPath(rawLanding);
    if (!cleanPath) continue;

    const pageId = pageIdMap.get(cleanPath);
    if (!pageId) continue;

    const m = rawRow.metricValues || [];
    const sessions = validateGa4Metric(m[0]?.value, 'sessions');
    const activeUsers = validateGa4Metric(m[1]?.value, 'activeUsers');
    const bounceRate = validateGa4Metric(m[2]?.value, 'bounceRate', true);
    const engagementRate = validateGa4Metric(m[3]?.value, 'engagementRate', true);
    const duration = validateGa4Metric(m[4]?.value, 'averageSessionDuration');
    const conversions = validateGa4Metric(m[5]?.value, 'conversions');

    // If any required metric is strictly invalid/non-finite, skip row
    if (sessions === null || activeUsers === null || bounceRate === null ||
        engagementRate === null || duration === null || conversions === null) {
      continue;
    }

    const key = `${pageId}:${metricDate}`;
    const existing = aggregatedMap.get(key);

    if (!existing) {
      aggregatedMap.set(key, {
        page_id: pageId,
        metric_date: metricDate,
        sessions: Math.floor(sessions),
        active_users: Math.floor(activeUsers),
        sum_bounce_weighted: bounceRate * sessions,
        sum_engagement_weighted: engagementRate * sessions,
        sum_duration_weighted: duration * sessions,
        conversions: Math.floor(conversions)
      });
    } else {
      existing.sessions += Math.floor(sessions);
      existing.active_users += Math.floor(activeUsers);
      existing.sum_bounce_weighted += bounceRate * sessions;
      existing.sum_engagement_weighted += engagementRate * sessions;
      existing.sum_duration_weighted += duration * sessions;
      existing.conversions += Math.floor(conversions);
    }
  }

  // Final conversion ensuring exactly 1 row per (page_id, metric_date)
  const finalRows = Array.from(aggregatedMap.values()).map(item => ({
    page_id: item.page_id,
    metric_date: item.metric_date,
    sessions: item.sessions,
    active_users: item.active_users,
    bounce_rate: item.sessions > 0
      ? Math.max(0, Math.min(1.0, parseFloat((item.sum_bounce_weighted / item.sessions).toFixed(4))))
      : 0.0,
    engagement_rate: item.sessions > 0
      ? Math.max(0, Math.min(1.0, parseFloat((item.sum_engagement_weighted / item.sessions).toFixed(4))))
      : 0.0,
    avg_session_duration_seconds: item.sessions > 0
      ? Math.max(0, parseFloat((item.sum_duration_weighted / item.sessions).toFixed(2)))
      : 0.0,
    conversions: item.conversions
  }));

  return {
    rows: finalRows,
    totalRawRows: allRawRows.length
  };
}
