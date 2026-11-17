/**
 * Google URL Inspection API Adapter
 * Yorven SEO Dashboard — Step 2.9 URL Inspection
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import { getGoogleAccessToken } from './_google_auth.js';

export const URL_INSPECTION_OAUTH_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const URL_INSPECTION_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

const VALID_VERDICTS = new Set(['PASS', 'NEUTRAL', 'FAIL', 'VERDICT_UNSPECIFIED']);

let customUrlInspectionFetcher = null;

export function setCustomUrlInspectionFetcher(fetcher) {
  customUrlInspectionFetcher = fetcher;
}

export function getCustomUrlInspectionFetcher() {
  return customUrlInspectionFetcher;
}

/**
 * Maps an HTTP status code, network error, or exception to the canonical database error taxonomy:
 * 'HTTP_429_QUOTA' | 'HTTP_403_FORBIDDEN' | 'HTTP_5XX_UPSTREAM' | 'NETWORK_TIMEOUT' | 'MALFORMED_RESPONSE' | 'UNKNOWN_ERROR'
 */
export function mapInspectionError(err, status = null) {
  if (status === 429) {
    return 'HTTP_429_QUOTA';
  }
  if (status === 403) {
    return 'HTTP_403_FORBIDDEN';
  }
  if (typeof status === 'number' && status >= 500 && status <= 599) {
    return 'HTTP_5XX_UPSTREAM';
  }
  if (
    err?.name === 'AbortError' ||
    err?.code === 'ETIMEDOUT' ||
    err?.code === 'ABORT_ERR' ||
    err?.message === 'NETWORK_TIMEOUT' ||
    err?.message?.includes('aborted') ||
    err?.message?.includes('timeout')
  ) {
    return 'NETWORK_TIMEOUT';
  }
  if (
    err?.name === 'SyntaxError' ||
    err?.message?.startsWith('MALFORMED_RESPONSE') ||
    err?.code === 'MALFORMED_RESPONSE'
  ) {
    return 'MALFORMED_RESPONSE';
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Inspects a single URL using Google Search Console URL Inspection API.
 * @param {Object} options
 * @param {string} [options.siteUrl] - GSC Property site URL (e.g. 'https://yorven.in/')
 * @param {string} options.inspectionUrl - Full URL to inspect (e.g. 'https://yorven.in/work')
 * @param {AbortSignal} [options.signal] - Cancellation signal
 * @param {Function} [options.customFetcher] - Custom mock fetcher injection for deterministic testing
 * @returns {Promise<Object>} Standardized inspection outcome matching public.seo_url_inspections schema
 */
export async function inspectGoogleUrl({
  siteUrl = process.env.GSC_SITE_URL || 'https://yorven.in/',
  inspectionUrl,
  signal,
  customFetcher
}) {
  if (!inspectionUrl || typeof inspectionUrl !== 'string' || !inspectionUrl.trim()) {
    return {
      success: false,
      attempt_status: 'failed',
      verdict: null,
      coverage_state: null,
      indexing_state: null,
      robots_txt_state: null,
      page_fetch_state: null,
      google_canonical: null,
      user_canonical: null,
      crawled_as: null,
      google_last_crawl_time: null,
      error_code: 'UNKNOWN_ERROR',
      error_message: 'INVALID_INPUT: inspectionUrl must be a non-empty string',
      raw_response: {}
    };
  }

  const activeFetcher = customFetcher || customUrlInspectionFetcher;

  // Validate credentials upfront if not running with a mock fetcher
  if (!activeFetcher) {
    const clientEmail = process.env.GSC_CLIENT_EMAIL;
    const privateKey = process.env.GSC_PRIVATE_KEY;
    if (!clientEmail || !clientEmail.trim() || !privateKey || !privateKey.trim()) {
      return {
        success: false,
        attempt_status: 'failed',
        verdict: null,
        coverage_state: null,
        indexing_state: null,
        robots_txt_state: null,
        page_fetch_state: null,
        google_canonical: null,
        user_canonical: null,
        crawled_as: null,
        google_last_crawl_time: null,
        error_code: 'UNKNOWN_ERROR',
        error_message: 'CONFIG_ERROR: Missing GSC_CLIENT_EMAIL or GSC_PRIVATE_KEY',
        raw_response: {}
      };
    }
  }

  const requestPayload = {
    inspectionUrl: inspectionUrl.trim(),
    siteUrl: siteUrl.trim()
  };

  try {
    if (signal?.aborted) {
      throw new Error('NETWORK_TIMEOUT');
    }

    let responseData = null;

    if (activeFetcher) {
      // Injected mock fetcher for testing
      responseData = await activeFetcher({
        endpoint: URL_INSPECTION_ENDPOINT,
        siteUrl: requestPayload.siteUrl,
        inspectionUrl: requestPayload.inspectionUrl,
        payload: requestPayload,
        signal
      });
    } else {
      // 1. Obtain OAuth2 access token reusing existing Google Auth manager
      const accessToken = await getGoogleAccessToken({
        clientEmail: process.env.GSC_CLIENT_EMAIL,
        privateKey: process.env.GSC_PRIVATE_KEY,
        scope: URL_INSPECTION_OAUTH_SCOPE,
        signal
      });

      // 2. Execute POST to Google Search Console URL Inspection API
      const res = await fetch(URL_INSPECTION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestPayload),
        signal
      });

      if (!res.ok) {
        let errMessage = `HTTP_${res.status}`;
        let errJson = null;
        try {
          errJson = await res.json();
          errMessage = errJson?.error?.message || errJson?.error || errMessage;
        } catch {
          // Keep default message
        }

        const errorCode = mapInspectionError(null, res.status);
        return {
          success: false,
          attempt_status: 'failed',
          verdict: null,
          coverage_state: null,
          indexing_state: null,
          robots_txt_state: null,
          page_fetch_state: null,
          google_canonical: null,
          user_canonical: null,
          crawled_as: null,
          google_last_crawl_time: null,
          error_code: errorCode,
          error_message: `Google URL Inspection API HTTP ${res.status}: ${errMessage}`,
          raw_response: errJson || {}
        };
      }

      try {
        responseData = await res.json();
      } catch (jsonErr) {
        return {
          success: false,
          attempt_status: 'failed',
          verdict: null,
          coverage_state: null,
          indexing_state: null,
          robots_txt_state: null,
          page_fetch_state: null,
          google_canonical: null,
          user_canonical: null,
          crawled_as: null,
          google_last_crawl_time: null,
          error_code: 'MALFORMED_RESPONSE',
          error_message: `Failed to parse response JSON: ${jsonErr.message}`,
          raw_response: {}
        };
      }
    }

    // Validate structural schema of Google's response
    if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
      return {
        success: false,
        attempt_status: 'failed',
        verdict: null,
        coverage_state: null,
        indexing_state: null,
        robots_txt_state: null,
        page_fetch_state: null,
        google_canonical: null,
        user_canonical: null,
        crawled_as: null,
        google_last_crawl_time: null,
        error_code: 'MALFORMED_RESPONSE',
        error_message: 'MALFORMED_RESPONSE: Root response is not a valid object',
        raw_response: responseData || {}
      };
    }

    const inspectionResult = responseData.inspectionResult;
    if (!inspectionResult || typeof inspectionResult !== 'object' || Array.isArray(inspectionResult)) {
      return {
        success: false,
        attempt_status: 'failed',
        verdict: null,
        coverage_state: null,
        indexing_state: null,
        robots_txt_state: null,
        page_fetch_state: null,
        google_canonical: null,
        user_canonical: null,
        crawled_as: null,
        google_last_crawl_time: null,
        error_code: 'MALFORMED_RESPONSE',
        error_message: 'MALFORMED_RESPONSE: Missing inspectionResult in response',
        raw_response: responseData
      };
    }

    const indexStatusResult = inspectionResult.indexStatusResult;
    if (!indexStatusResult || typeof indexStatusResult !== 'object' || Array.isArray(indexStatusResult)) {
      return {
        success: false,
        attempt_status: 'failed',
        verdict: null,
        coverage_state: null,
        indexing_state: null,
        robots_txt_state: null,
        page_fetch_state: null,
        google_canonical: null,
        user_canonical: null,
        crawled_as: null,
        google_last_crawl_time: null,
        error_code: 'MALFORMED_RESPONSE',
        error_message: 'MALFORMED_RESPONSE: Missing indexStatusResult in inspectionResult',
        raw_response: responseData
      };
    }

    const rawVerdict = indexStatusResult.verdict;
    if (!rawVerdict || typeof rawVerdict !== 'string' || !VALID_VERDICTS.has(rawVerdict)) {
      return {
        success: false,
        attempt_status: 'failed',
        verdict: null,
        coverage_state: null,
        indexing_state: null,
        robots_txt_state: null,
        page_fetch_state: null,
        google_canonical: null,
        user_canonical: null,
        crawled_as: null,
        google_last_crawl_time: null,
        error_code: 'MALFORMED_RESPONSE',
        error_message: `MALFORMED_RESPONSE: Invalid or missing verdict: ${rawVerdict}`,
        raw_response: responseData
      };
    }

    // Parse and normalize all fields per public.seo_url_inspections schema
    const coverageState = typeof indexStatusResult.coverageState === 'string'
      ? indexStatusResult.coverageState.trim() || null
      : null;

    const indexingState = typeof indexStatusResult.indexingState === 'string'
      ? indexStatusResult.indexingState.trim() || null
      : null;

    const robotsTxtState = typeof indexStatusResult.robotsTxtState === 'string'
      ? indexStatusResult.robotsTxtState.trim() || null
      : null;

    const pageFetchState = typeof indexStatusResult.pageFetchState === 'string'
      ? indexStatusResult.pageFetchState.trim() || null
      : null;

    const googleCanonical = typeof indexStatusResult.googleCanonical === 'string'
      ? indexStatusResult.googleCanonical.trim() || null
      : null;

    const userCanonical = typeof indexStatusResult.userCanonical === 'string'
      ? indexStatusResult.userCanonical.trim() || null
      : null;

    const crawledAs = typeof indexStatusResult.crawledAs === 'string'
      ? indexStatusResult.crawledAs.trim() || null
      : null;

    let googleLastCrawlTime = null;
    if (typeof indexStatusResult.lastCrawlTime === 'string' && indexStatusResult.lastCrawlTime.trim()) {
      const parsed = Date.parse(indexStatusResult.lastCrawlTime.trim());
      if (!Number.isNaN(parsed)) {
        googleLastCrawlTime = new Date(parsed).toISOString();
      }
    }

    return {
      success: true,
      attempt_status: 'success',
      verdict: rawVerdict,
      coverage_state: coverageState,
      indexing_state: indexingState,
      robots_txt_state: robotsTxtState,
      page_fetch_state: pageFetchState,
      google_canonical: googleCanonical,
      user_canonical: userCanonical,
      crawled_as: crawledAs,
      google_last_crawl_time: googleLastCrawlTime,
      error_code: null,
      error_message: null,
      raw_response: responseData
    };
  } catch (err) {
    const errorCode = mapInspectionError(err, err?.status);
    return {
      success: false,
      attempt_status: 'failed',
      verdict: null,
      coverage_state: null,
      indexing_state: null,
      robots_txt_state: null,
      page_fetch_state: null,
      google_canonical: null,
      user_canonical: null,
      crawled_as: null,
      google_last_crawl_time: null,
      error_code: errorCode,
      error_message: err.message || 'Unknown inspection error',
      raw_response: err?.raw_response || {}
    };
  }
}
