/**
 * Google Search Console (GSC) API Adapter
 * Yorven SEO Dashboard — Phase 2 Serverless Endpoints
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

// Yorven's 9 monitored routes
export const YORVEN_MONITORED_PATHS = new Set([
  '/',
  '/work',
  '/work/payper-ai',
  '/work/racers-vault',
  '/work/aurix',
  '/about',
  '/contact',
  '/privacy',
  '/terms'
]);

/**
 * Normalizes a GSC page URL into a local path matching seo_pages.path.
 * Discards unmonitored routes or invalid URLs.
 */
export function normalizeGscPagePath(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl, 'https://yorven.in');
    let pathname = parsed.pathname.trim().toLowerCase();
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    const cleanPath = pathname || '/';
    return YORVEN_MONITORED_PATHS.has(cleanPath) ? cleanPath : null;
  } catch {
    return null;
  }
}

/**
 * Sanitizes and validates GSC metric row values according to database column constraints.
 */
export function sanitizeGscRow(row, pageIdMap) {
  const pagePath = normalizeGscPagePath(row.page || (Array.isArray(row.keys) ? row.keys[1] : null));
  if (!pagePath) return null;

  const pageId = pageIdMap.get(pagePath);
  if (!pageId) return null;

  const rawDate = row.date || (Array.isArray(row.keys) ? row.keys[0] : null);
  if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return null;

  const rawQuery = row.query !== undefined ? row.query : (Array.isArray(row.keys) ? row.keys[2] : null);
  const query = typeof rawQuery === 'string' && rawQuery.trim().length > 0
    ? rawQuery.trim()
    : '(not provided)';

  const clicks = Math.max(0, parseInt(row.clicks || 0, 10) || 0);
  const impressions = Math.max(0, parseInt(row.impressions || 0, 10) || 0);

  let ctr = parseFloat(row.ctr);
  if (!Number.isFinite(ctr) || ctr < 0) {
    ctr = impressions > 0 ? clicks / impressions : 0.0;
  }
  ctr = Math.max(0, Math.min(1.0, parseFloat(ctr.toFixed(4))));

  let position = parseFloat(row.position);
  if (!Number.isFinite(position) || position < 0) {
    position = 0.0;
  }
  position = Math.max(0, parseFloat(position.toFixed(2)));

  return {
    page_id: pageId,
    metric_date: rawDate,
    query,
    clicks,
    impressions,
    ctr,
    position
  };
}

let customGscFetcher = null;

export function setCustomGscFetcher(fetcher) {
  customGscFetcher = fetcher;
}

export function getCustomGscFetcher() {
  return customGscFetcher;
}

/**
 * Fetches search analytics data from GSC according to the specified profile.
 * - 'manual' profile (Vercel Serverless): rowLimit 1,000, max 1 page, 0 retries, 1,500 ms timeout.
 * - 'worker' profile (GitHub Actions): rowLimit 5,000, max 2 pages (10k ceiling), 3 retries.
 *
 * @param {Object} options
 * @param {string} options.profile - 'manual' | 'worker'
 * @param {string} options.startDate - 'YYYY-MM-DD'
 * @param {string} options.endDate - 'YYYY-MM-DD'
 * @param {Map<string, string>} options.pageIdMap - path -> page_id mapping
 * @param {AbortSignal} [options.signal] - optional cancellation signal
 */
export async function fetchGscSearchAnalytics({
  profile = 'manual',
  startDate,
  endDate,
  pageIdMap,
  signal
}) {
  const isManual = profile === 'manual';
  const rowLimit = isManual ? 1000 : 5000;
  const maxPages = isManual ? 1 : 2;
  const requestTimeoutMs = isManual ? 1500 : 5000;
  const maxRetries = isManual ? 0 : 3;

  const siteUrl = process.env.GSC_SITE_URL || 'https://yorven.in/';
  const allRows = [];
  let startRow = 0;
  let pageCount = 0;
  let reachedCeiling = false;
  let lastPageRowCount = 0;

  while (pageCount < maxPages) {
    pageCount++;

    const payload = {
      startDate,
      endDate,
      dimensions: ['date', 'page', 'query'],
      rowLimit,
      startRow
    };

    let responseData = null;
    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
      if (signal?.aborted) {
        throw new Error('GSC_FETCH_ABORTED: Request cancelled');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
      const combinedSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;

      try {
        if (customGscFetcher) {
          responseData = await customGscFetcher({ siteUrl, payload, signal: combinedSignal });
        } else {
          // If no custom fetcher and no Google credentials, return empty or mock data
          if (!process.env.GSC_CLIENT_EMAIL || !process.env.GSC_PRIVATE_KEY) {
            // Unconfigured credentials return safe empty response
            responseData = { rows: [] };
          } else {
            // Real Google Search Console API fetch
            const gscEndpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
            const res = await fetch(gscEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.GSC_ACCESS_TOKEN || ''}`
              },
              body: JSON.stringify(payload),
              signal: combinedSignal
            });

            if (!res.ok) {
              const errText = await res.text().catch(() => '');
              const err = new Error(`GSC API HTTP ${res.status}: ${errText}`);
              err.status = res.status;
              throw err;
            }
            responseData = await res.json();
          }
        }

        clearTimeout(timeoutId);
        break; // Success
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        attempt++;
        if (attempt <= maxRetries && !signal?.aborted) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    if (!responseData) {
      throw lastError || new Error('GSC_FETCH_FAILED: Failed to fetch search analytics');
    }

    const rawRows = responseData.rows || [];
    lastPageRowCount = rawRows.length;

    for (const rawRow of rawRows) {
      const sanitized = sanitizeGscRow(rawRow, pageIdMap);
      if (sanitized) {
        allRows.push(sanitized);
      }
    }

    if (rawRows.length < rowLimit) {
      // Reached end of data
      break;
    }

    startRow += rawRows.length;
    if (pageCount >= maxPages && rawRows.length === rowLimit) {
      reachedCeiling = true;
    }
  }

  const isTruncated = reachedCeiling && lastPageRowCount === rowLimit;
  const truncationStatus = isTruncated ? 'possibly_truncated' : 'complete';

  return {
    rows: allRows,
    isTruncated,
    truncationStatus,
    pageCount,
    totalRawRows: allRows.length
  };
}
