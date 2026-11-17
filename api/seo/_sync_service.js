/**
 * Core SEO Synchronization Engine
 * Yorven SEO Dashboard — Phase 2 Serverless Endpoints & Scheduled Worker
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';
import { getDatabaseAdapter } from '../auth/_utils.js';
import { fetchGscSearchAnalytics } from './_gsc_adapter.js';
import { fetchGa4Metrics } from './_ga4_adapter.js';
import { inspectGoogleUrl } from './_url_inspection_adapter.js';

/**
 * Creates a new sync job record in public.seo_sync_jobs with status = 'pending'.
 */
export async function createSyncJob(db, jobType = 'full_resync', maxRetries = 3, payload = {}) {
  const params = {
    p_job_type: jobType,
    p_max_retries: maxRetries
  };
  if (payload !== undefined && payload !== null) {
    params.p_payload = payload;
  }
  return await db.callAuthUtilRpc('create_sync_job', params);
}

/**
 * Atomically claims the oldest pending or expired processing job in FIFO order.
 * Returns JSONB: { claimed, job_id, job_type, generation, lease_expires_at, payload, error }
 */
export async function claimSyncJob(db, workerId, leaseAttemptId, leaseDurationMs = 300000, jobTypeFilter = null) {
  const params = {
    p_worker_id: workerId,
    p_lease_attempt_id: leaseAttemptId,
    p_lease_duration_ms: leaseDurationMs
  };
  if (jobTypeFilter) {
    params.p_job_type_filter = jobTypeFilter;
  }
  return await db.callAuthUtilRpc('claim_sync_job', params);
}

/**
 * Atomically completes or reports failure for an active job using generation fencing.
 */
export async function completeSyncJob(db, jobId, leaseAttemptId, expectedGeneration, status, errorMessage = null) {
  return await db.callAuthUtilRpc('complete_sync_job', {
    p_job_id: jobId,
    p_lease_attempt_id: leaseAttemptId,
    p_expected_generation: expectedGeneration,
    p_status: status,
    p_error_message: errorMessage
  });
}

/**
 * Appends an audit log entry to public.seo_sync_logs.
 */
export async function insertSyncLog(db, jobId, level, message, payload = null) {
  try {
    const res = await fetch(`${db.supabaseUrl}/rest/v1/seo_sync_logs`, {
      method: 'POST',
      headers: {
        ...db.getPostgrestHeaders('public'),
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        job_id: jobId,
        level,
        message,
        payload,
        created_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch (err) {
    console.error(`[SyncLog Error] Failed to write log '${message}':`, err.message);
    return false;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARS_REGEX = /[\x00-\x1f\x7f\s]/;

/**
 * Loads all monitored routes from public.seo_pages.
 * Validates every record strictly:
 * - Reject non-object rows.
 * - Require valid UUID in id.
 * - Require valid absolute path starting with '/'.
 * - Reject whitespace-only paths, control characters, queries, fragments, or backslashes.
 * - Normalize paths consistently and reject duplicate normalized paths.
 * - Fails closed if any row is malformed or incomplete.
 * Returns { pageIdMap: Map<path, id>, pages: Array<page> }
 */
export async function loadMonitoredPages(db) {
  const res = await fetch(`${db.supabaseUrl}/rest/v1/seo_pages?select=id,path,title,canonical_url,is_indexed,last_crawled_at`, {
    method: 'GET',
    headers: db.getPostgrestHeaders('public')
  });

  if (!res.ok) {
    throw new Error(`Failed to load monitored pages: HTTP ${res.status}`);
  }

  const pages = await res.json();
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('Failed to load monitored pages: Route registry is empty or invalid');
  }

  const pageIdMap = new Map();
  for (const page of pages) {
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      throw new Error('Failed to load monitored pages: Malformed row in registry');
    }
    if (typeof page.id !== 'string' || !UUID_REGEX.test(page.id)) {
      throw new Error(`Failed to load monitored pages: Invalid UUID in registry: ${page.id}`);
    }
    if (typeof page.path !== 'string') {
      throw new Error(`Failed to load monitored pages: Non-string path for ID ${page.id}`);
    }
    const rawPath = page.path.trim();
    if (rawPath.length === 0 || !rawPath.startsWith('/')) {
      throw new Error(`Failed to load monitored pages: Path must be non-empty and start with "/": ${page.path}`);
    }
    if (CONTROL_CHARS_REGEX.test(page.path)) {
      throw new Error(`Failed to load monitored pages: Path contains whitespace or control characters: ${page.path}`);
    }
    if (page.path.includes('?') || page.path.includes('#') || page.path.includes('\\')) {
      throw new Error(`Failed to load monitored pages: Path contains query, fragment, or backslash: ${page.path}`);
    }

    let normalized = rawPath.toLowerCase();
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    const cleanPath = normalized || '/';

    if (pageIdMap.has(cleanPath)) {
      throw new Error(`Failed to load monitored pages: Duplicate route detected in registry: ${cleanPath}`);
    }

    pageIdMap.set(cleanPath, page.id);
  }

  if (pageIdMap.size === 0) {
    throw new Error('Failed to load monitored pages: No valid routes found in registry');
  }

  return { pageIdMap, pages };
}

/**
 * Upserts GSC metric rows in chunks of 500 rows using on_conflict=page_id,metric_date,query.
 */
export async function upsertGscMetrics(db, rows, chunkSize = 500, signal) {
  if (!rows || rows.length === 0) return { chunksPersisted: 0, rowsPersisted: 0 };

  let chunksPersisted = 0;
  let rowsPersisted = 0;
  const recordedAt = new Date().toISOString();

  for (let i = 0; i < rows.length; i += chunkSize) {
    if (signal?.aborted) {
      throw new Error('GSC_UPSERT_ABORTED: Request cancelled');
    }

    const chunk = rows.slice(i, i + chunkSize).map(r => ({
      ...r,
      recorded_at: recordedAt
    }));

    const res = await fetch(
      `${db.supabaseUrl}/rest/v1/seo_search_console_metrics?on_conflict=page_id,metric_date,query`,
      {
        method: 'POST',
        headers: {
          ...db.getPostgrestHeaders('public'),
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(chunk),
        signal
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const err = new Error(`GSC upsert failed at chunk ${chunksPersisted}: HTTP ${res.status} ${errText}`);
      err.chunkIndex = chunksPersisted;
      throw err;
    }

    chunksPersisted++;
    rowsPersisted += chunk.length;
  }

  return { chunksPersisted, rowsPersisted };
}

/**
 * Upserts GA4 metric rows in chunks of 500 rows using on_conflict=page_id,metric_date.
 */
export async function upsertGa4Metrics(db, rows, chunkSize = 500, signal) {
  if (!rows || rows.length === 0) return { chunksPersisted: 0, rowsPersisted: 0 };

  let chunksPersisted = 0;
  let rowsPersisted = 0;
  const recordedAt = new Date().toISOString();

  for (let i = 0; i < rows.length; i += chunkSize) {
    if (signal?.aborted) {
      throw new Error('GA4_UPSERT_ABORTED: Request cancelled');
    }

    const chunk = rows.slice(i, i + chunkSize).map(r => ({
      ...r,
      recorded_at: recordedAt
    }));

    const res = await fetch(
      `${db.supabaseUrl}/rest/v1/seo_ga4_metrics?on_conflict=page_id,metric_date`,
      {
        method: 'POST',
        headers: {
          ...db.getPostgrestHeaders('public'),
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(chunk),
        signal
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const err = new Error(`GA4 upsert failed at chunk ${chunksPersisted}: HTTP ${res.status} ${errText}`);
      err.chunkIndex = chunksPersisted;
      throw err;
    }

    chunksPersisted++;
    rowsPersisted += chunk.length;
  }

  return { chunksPersisted, rowsPersisted };
}

/**
 * Helper to compute default GSC & GA4 target dates.
 * GSC has 3-day publication lag -> today - 3 days.
 * GA4 has 1-day lag -> today - 1 day.
 */
export function getDefaultSyncDates() {
  const now = new Date();

  const gscTarget = new Date(now.getTime() - 3 * 86400000);
  const ga4Target = new Date(now.getTime() - 1 * 86400000);

  const formatDate = (d) => d.toISOString().split('T')[0];

  return {
    gscDate: formatDate(gscTarget),
    ga4Date: formatDate(ga4Target)
  };
}

/**
 * Inserts a single URL inspection record into public.seo_url_inspections.
 * Satisfies chk_inspection_attempt_consistency:
 * - success: verdict is NOT NULL, error_code is NULL.
 * - failed: error_code is NOT NULL, verdict is NULL.
 */
export async function insertInspectionRecord(db, record) {
  const row = {
    page_id: record.page_id || null,
    job_id: record.job_id || null,
    inspection_url: record.inspection_url,
    attempt_status: record.attempt_status,
    verdict: record.attempt_status === 'success' ? (record.verdict || 'VERDICT_UNSPECIFIED') : null,
    coverage_state: record.coverage_state || null,
    indexing_state: record.indexing_state || null,
    robots_txt_state: record.robots_txt_state || null,
    page_fetch_state: record.page_fetch_state || null,
    google_canonical: record.google_canonical || null,
    user_canonical: record.user_canonical || null,
    crawled_as: record.crawled_as || null,
    google_last_crawl_time: record.google_last_crawl_time || null,
    error_code: record.attempt_status === 'failed' ? (record.error_code || 'UNKNOWN_ERROR') : null,
    error_message: record.error_message || null,
    raw_response: record.raw_response && typeof record.raw_response === 'object' ? record.raw_response : {},
    inspected_at: record.inspected_at || new Date().toISOString()
  };

  const res = await fetch(`${db.supabaseUrl}/rest/v1/seo_url_inspections`, {
    method: 'POST',
    headers: {
      ...db.getPostgrestHeaders('public'),
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to insert inspection record: HTTP ${res.status} ${errText}`);
  }

  const inserted = await res.json().catch(() => null);
  return Array.isArray(inserted) && inserted.length > 0 ? inserted[0] : row;
}

/**
 * Executes a single route URL inspection job (url_inspection_single).
 */
export async function executeUrlInspectionSingleWorkload({
  db,
  jobId,
  generation,
  leaseAttemptId,
  workerId,
  profile = 'manual',
  signal,
  startTime = Date.now(),
  payload = null
}) {
  const pageId = payload?.page_id;
  if (!pageId || typeof pageId !== 'string' || !UUID_REGEX.test(pageId)) {
    const durationMs = Date.now() - startTime;
    const errMsg = 'INVALID_SINGLE_ROUTE_PAYLOAD: Missing or invalid page_id in job payload';
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', errMsg);
    await insertSyncLog(db, jobId, 'error', 'INSPECTION_SINGLE_FAILED', {
      job_id: jobId,
      page_id: pageId,
      error: errMsg,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType: 'url_inspection_single',
      durationMs,
      error: errMsg
    };
  }

  let pages;
  try {
    const loaded = await loadMonitoredPages(db);
    pages = loaded.pages;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', err.message);
    await insertSyncLog(db, jobId, 'error', 'SYNC_JOB_FAILED', {
      job_id: jobId,
      job_type: 'url_inspection_single',
      phase: 'registry_load',
      duration_ms: durationMs,
      error: err.message,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType: 'url_inspection_single',
      durationMs,
      error: `Failed to load route registry: ${err.message}`
    };
  }

  const page = pages.find((p) => p.id === pageId);
  if (!page) {
    const durationMs = Date.now() - startTime;
    const errMsg = `PAGE_NOT_FOUND: Route ID '${pageId}' not found in monitored registry`;
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', errMsg);
    await insertSyncLog(db, jobId, 'error', 'INSPECTION_SINGLE_FAILED', {
      job_id: jobId,
      page_id: pageId,
      error: errMsg,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType: 'url_inspection_single',
      durationMs,
      error: errMsg
    };
  }

  const cleanPath = page.path === '/' ? '' : page.path;
  const canonicalUrl = page.canonical_url && page.canonical_url.startsWith('https://')
    ? page.canonical_url
    : `https://yorven.in${cleanPath}`;

  const inspectionResult = await inspectGoogleUrl({
    inspectionUrl: canonicalUrl,
    signal
  });

  const durationMs = Date.now() - startTime;

  // Persist attempt independently of success or failure
  const persistedRecord = await insertInspectionRecord(db, {
    ...inspectionResult,
    page_id: page.id,
    job_id: jobId,
    inspection_url: canonicalUrl
  });

  if (inspectionResult.success) {
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'completed');
    await insertSyncLog(db, jobId, 'info', 'INSPECTION_SINGLE_COMPLETED', {
      job_id: jobId,
      page_id: page.id,
      inspection_url: canonicalUrl,
      verdict: inspectionResult.verdict,
      duration_ms: durationMs,
      worker_id: workerId
    });
    return {
      success: true,
      jobId,
      jobType: 'url_inspection_single',
      durationMs,
      inspectionRecord: persistedRecord
    };
  } else {
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', inspectionResult.error_message);
    await insertSyncLog(db, jobId, 'error', 'INSPECTION_SINGLE_FAILED', {
      job_id: jobId,
      page_id: page.id,
      inspection_url: canonicalUrl,
      error_code: inspectionResult.error_code,
      error: inspectionResult.error_message,
      duration_ms: durationMs,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType: 'url_inspection_single',
      durationMs,
      error: inspectionResult.error_message,
      inspectionRecord: persistedRecord
    };
  }
}

/**
 * Executes a bulk URL inspection job across snapshotted routes (url_inspection_all).
 */
export async function executeUrlInspectionAllWorkload({
  db,
  jobId,
  generation,
  leaseAttemptId,
  workerId,
  profile = 'worker',
  signal,
  startTime = Date.now(),
  payload = null,
  pacingDelayMs = 1000
}) {
  const targetPageIds = payload?.target_page_ids;
  if (!Array.isArray(targetPageIds) || targetPageIds.length === 0) {
    const durationMs = Date.now() - startTime;
    const errMsg = 'INVALID_BULK_PAYLOAD: Missing or empty target_page_ids snapshot in job payload';
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', errMsg);
    await insertSyncLog(db, jobId, 'error', 'INSPECTION_ALL_FAILED', {
      job_id: jobId,
      error: errMsg,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType: 'url_inspection_all',
      durationMs,
      error: errMsg,
      inspectedCount: 0,
      successCount: 0,
      failureCount: 0
    };
  }

  let pages;
  try {
    const loaded = await loadMonitoredPages(db);
    pages = loaded.pages;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', err.message);
    await insertSyncLog(db, jobId, 'error', 'SYNC_JOB_FAILED', {
      job_id: jobId,
      job_type: 'url_inspection_all',
      phase: 'registry_load',
      duration_ms: durationMs,
      error: err.message,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType: 'url_inspection_all',
      durationMs,
      error: `Failed to load route registry: ${err.message}`,
      inspectedCount: 0,
      successCount: 0,
      failureCount: 0
    };
  }

  const pagesById = new Map(pages.map((p) => [p.id, p]));
  let inspectedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let quotaExhausted = false;
  let quotaError = null;
  const inspectionRecords = [];

  for (let i = 0; i < targetPageIds.length; i++) {
    const pageId = targetPageIds[i];

    if (signal?.aborted) {
      throw new Error('EXECUTION_BUDGET_EXCEEDED');
    }

    // Pacing delay between sequential requests
    if (i > 0 && pacingDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pacingDelayMs));
    }

    const page = pagesById.get(pageId);
    if (!page) {
      // Route was deleted or missing from registry
      failureCount++;
      await insertSyncLog(db, jobId, 'warn', 'BULK_ROUTE_SKIPPED_NOT_FOUND', {
        job_id: jobId,
        page_id: pageId,
        message: `Route ID '${pageId}' from snapshot no longer found in monitored registry`
      });
      continue;
    }

    const cleanPath = page.path === '/' ? '' : page.path;
    const canonicalUrl = page.canonical_url && page.canonical_url.startsWith('https://')
      ? page.canonical_url
      : `https://yorven.in${cleanPath}`;

    const inspectionResult = await inspectGoogleUrl({
      inspectionUrl: canonicalUrl,
      signal
    });

    const persisted = await insertInspectionRecord(db, {
      ...inspectionResult,
      page_id: page.id,
      job_id: jobId,
      inspection_url: canonicalUrl
    });

    inspectionRecords.push(persisted);
    inspectedCount++;

    if (inspectionResult.success) {
      successCount++;
    } else {
      failureCount++;
      if (inspectionResult.error_code === 'HTTP_429_QUOTA') {
        quotaExhausted = true;
        quotaError = `HTTP_429_QUOTA: ${inspectionResult.error_message || 'Quota exceeded'}`;
        await insertSyncLog(db, jobId, 'error', 'BULK_INSPECTION_QUOTA_EXHAUSTED', {
          job_id: jobId,
          page_id: page.id,
          inspected_count: inspectedCount,
          error: quotaError
        });
        break; // Stop further Google API requests immediately!
      }
    }
  }

  const durationMs = Date.now() - startTime;

  if (quotaExhausted) {
    const errorMsg = `BULK_INSPECTION_QUOTA_EXHAUSTED: ${quotaError}`;
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', errorMsg);
    await insertSyncLog(db, jobId, 'error', 'SYNC_JOB_FAILED', {
      job_id: jobId,
      job_type: 'url_inspection_all',
      duration_ms: durationMs,
      error: errorMsg,
      inspected_count: inspectedCount,
      success_count: successCount,
      failure_count: failureCount,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType: 'url_inspection_all',
      durationMs,
      error: errorMsg,
      inspectedCount,
      successCount,
      failureCount,
      quotaExhausted: true,
      inspectionRecords
    };
  }

  if (failureCount > 0 || inspectedCount === 0) {
    const errorMsg = inspectedCount === 0
      ? 'No valid monitored routes were inspected'
      : `${failureCount} of ${targetPageIds.length} routes failed inspection`;
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', errorMsg);
    await insertSyncLog(db, jobId, 'error', 'SYNC_JOB_FAILED', {
      job_id: jobId,
      job_type: 'url_inspection_all',
      duration_ms: durationMs,
      error: errorMsg,
      inspected_count: inspectedCount,
      success_count: successCount,
      failure_count: failureCount,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType: 'url_inspection_all',
      durationMs,
      error: errorMsg,
      inspectedCount,
      successCount,
      failureCount,
      quotaExhausted: false,
      inspectionRecords
    };
  }

  // All routes inspected successfully
  await completeSyncJob(db, jobId, leaseAttemptId, generation, 'completed');
  await insertSyncLog(db, jobId, 'info', 'SYNC_JOB_COMPLETED', {
    job_id: jobId,
    job_type: 'url_inspection_all',
    duration_ms: durationMs,
    inspected_count: inspectedCount,
    success_count: successCount,
    worker_id: workerId
  });

  return {
    success: true,
    jobId,
    jobType: 'url_inspection_all',
    durationMs,
    inspectedCount,
    successCount,
    failureCount: 0,
    quotaExhausted: false,
    inspectionRecords
  };
}

/**
 * Executes synchronization for a claimed job under the specified profile.
 * - Profile 'manual': 6,500 ms hard internal cutoff (leaves 3,000 ms quarantine for cleanup before 10s ceiling).
 * - Profile 'worker': Independent 10-minute VM allowance.
 */
export async function executeClaimedSyncWorkload({
  db,
  jobId,
  jobType,
  generation,
  leaseAttemptId,
  workerId,
  profile = 'manual',
  parentSignal,
  payload = null,
  pacingDelayMs = 1000
}) {
  const isManual = profile === 'manual';
  const startTime = Date.now();
  const deadlineTime = isManual ? startTime + 6500 : startTime + 600000;

  const controller = new AbortController();
  const abortIfTimeout = () => {
    if (Date.now() >= deadlineTime) {
      controller.abort();
    }
  };

  const signal = parentSignal
    ? AbortSignal.any([parentSignal, controller.signal])
    : controller.signal;

  // 1. Validate supported job type taxonomy
  const supportedJobTypes = new Set([
    'gsc_daily',
    'ga4_daily',
    'full_resync',
    'url_inspection_single',
    'url_inspection_all'
  ]);

  if (!supportedJobTypes.has(jobType)) {
    const durationMs = Date.now() - startTime;
    const errorMsg = `UNKNOWN_JOB_TYPE: Unsupported job type '${jobType}'`;
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', errorMsg);
    await insertSyncLog(db, jobId, 'error', 'SYNC_JOB_FAILED', {
      job_id: jobId,
      job_type: jobType,
      phase: 'routing',
      duration_ms: durationMs,
      error: errorMsg,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType,
      durationMs,
      error: errorMsg
    };
  }

  // 2. Fetch payload from db if not explicitly provided for URL inspection jobs
  let activePayload = payload;
  if (!activePayload && (jobType === 'url_inspection_single' || jobType === 'url_inspection_all')) {
    try {
      const res = await fetch(`${db.supabaseUrl}/rest/v1/seo_sync_jobs?id=eq.${jobId}&select=payload`, {
        headers: db.getPostgrestHeaders('public')
      });
      if (res.ok) {
        const rows = await res.json();
        activePayload = rows[0]?.payload || {};
      }
    } catch {
      activePayload = {};
    }
  }

  // 3. Dispatch to URL inspection executors if applicable
  if (jobType === 'url_inspection_single') {
    return await executeUrlInspectionSingleWorkload({
      db,
      jobId,
      generation,
      leaseAttemptId,
      workerId,
      profile,
      signal,
      startTime,
      payload: activePayload
    });
  }

  if (jobType === 'url_inspection_all') {
    return await executeUrlInspectionAllWorkload({
      db,
      jobId,
      generation,
      leaseAttemptId,
      workerId,
      profile,
      signal,
      startTime,
      payload: activePayload,
      pacingDelayMs
    });
  }

  let gscPersistedRows = 0;
  let ga4PersistedRows = 0;
  let gscTruncationStatus = 'not_applicable';
  let gscError = null;
  let ga4Error = null;

  // 1. Load monitored pages
  let pageIdMap;
  try {
    const loaded = await loadMonitoredPages(db);
    pageIdMap = loaded.pageIdMap;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', err.message);
    await insertSyncLog(db, jobId, 'error', 'SYNC_JOB_FAILED', {
      job_id: jobId,
      job_type: jobType,
      phase: 'registry_load',
      duration_ms: durationMs,
      error: err.message,
      worker_id: workerId
    });
    return {
      success: false,
      jobId,
      jobType,
      durationMs,
      error: `Failed to load route registry: ${err.message}`,
      gscPersistedRows: 0,
      ga4PersistedRows: 0,
      gscTruncationStatus: 'not_applicable'
    };
  }
  const { gscDate, ga4Date } = getDefaultSyncDates();

  const shouldRunGsc = jobType === 'gsc_daily' || jobType === 'full_resync';
  const shouldRunGa4 = jobType === 'ga4_daily' || jobType === 'full_resync';

  // --------------------------------------------------------------------------
  // 2. GSC EXECUTION LIFECYCLE
  // --------------------------------------------------------------------------
  if (shouldRunGsc) {
    abortIfTimeout();
    await insertSyncLog(db, jobId, 'info', 'PROVIDER_STARTED', {
      provider: 'gsc',
      phase: 'init',
      date: gscDate,
      profile
    });

    try {
      if (signal.aborted) throw new Error('EXECUTION_BUDGET_EXCEEDED');

      // Fetch GSC data
      const gscResult = await fetchGscSearchAnalytics({
        profile,
        startDate: gscDate,
        endDate: gscDate,
        pageIdMap,
        signal
      });

      gscTruncationStatus = gscResult.truncationStatus;

      // Upsert GSC data in chunks
      abortIfTimeout();
      const totalChunks = Math.ceil(gscResult.rows.length / 500) || 1;
      let chunkIdx = 0;

      for (let i = 0; i < gscResult.rows.length; i += 500) {
        abortIfTimeout();
        const chunk = gscResult.rows.slice(i, i + 500);

        try {
          await upsertGscMetrics(db, chunk, 500, signal);
          await insertSyncLog(db, jobId, 'info', 'GSC_UPSERT_CHUNK_SUCCESS', {
            provider: 'gsc',
            chunk_index: chunkIdx,
            total_chunks: totalChunks,
            rows: chunk.length
          });
          gscPersistedRows += chunk.length;
          chunkIdx++;
        } catch (chunkErr) {
          await insertSyncLog(db, jobId, 'error', 'GSC_UPSERT_CHUNK_FAILED', {
            provider: 'gsc',
            failed_chunk_index: chunkIdx,
            total_chunks: totalChunks,
            error: chunkErr.message
          });
          throw chunkErr;
        }
      }

      // Terminal GSC persistence event
      if (gscResult.isTruncated) {
        await insertSyncLog(db, jobId, 'warn', 'GSC_SNAPSHOT_PERSISTED_TRUNCATED', {
          provider: 'gsc',
          status: 'possibly_truncated',
          rows_persisted: gscPersistedRows,
          date: gscDate
        });
      } else {
        await insertSyncLog(db, jobId, 'info', 'GSC_SNAPSHOT_PERSISTED_COMPLETE', {
          provider: 'gsc',
          status: 'complete',
          rows_persisted: gscPersistedRows,
          date: gscDate
        });
      }
    } catch (err) {
      gscError = err;
      const isFetchError = !gscPersistedRows && !err.chunkIndex;
      if (isFetchError) {
        await insertSyncLog(db, jobId, 'error', 'GSC_FETCH_FAILED', {
          provider: 'gsc',
          phase: 'fetch',
          error: err.message
        });
      } else {
        await insertSyncLog(db, jobId, 'error', 'GSC_UPSERT_FAILED', {
          provider: 'gsc',
          phase: 'upsert',
          error: err.message,
          rows_persisted_before_failure: gscPersistedRows
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. GA4 EXECUTION LIFECYCLE
  // --------------------------------------------------------------------------
  if (shouldRunGa4) {
    abortIfTimeout();
    await insertSyncLog(db, jobId, 'info', 'PROVIDER_STARTED', {
      provider: 'ga4',
      phase: 'init',
      date: ga4Date,
      profile
    });

    try {
      if (signal.aborted) throw new Error('EXECUTION_BUDGET_EXCEEDED');

      // Fetch GA4 report
      const ga4Result = await fetchGa4Metrics({
        profile,
        startDate: ga4Date,
        endDate: ga4Date,
        pageIdMap,
        signal
      });

      // Upsert GA4 rows
      abortIfTimeout();
      try {
        const { rowsPersisted } = await upsertGa4Metrics(db, ga4Result.rows, 500, signal);
        ga4PersistedRows = rowsPersisted;
        await insertSyncLog(db, jobId, 'info', 'GA4_UPSERT_SUCCESS', {
          provider: 'ga4',
          status: 'complete',
          rows_persisted: ga4PersistedRows,
          date: ga4Date
        });
      } catch (upsertErr) {
        await insertSyncLog(db, jobId, 'error', 'GA4_UPSERT_FAILED', {
          provider: 'ga4',
          phase: 'upsert',
          error: upsertErr.message
        });
        throw upsertErr;
      }
    } catch (err) {
      ga4Error = err;
      await insertSyncLog(db, jobId, 'error', 'GA4_FETCH_FAILED', {
        provider: 'ga4',
        phase: 'fetch',
        error: err.message
      });
    }
  }

  // --------------------------------------------------------------------------
  // 4. ATOMIC COMPLETION OR FAILURE TRANSITION
  // --------------------------------------------------------------------------
  const durationMs = Date.now() - startTime;
  const isOverallSuccess = (!shouldRunGsc || !gscError) && (!shouldRunGa4 || !ga4Error);

  if (isOverallSuccess) {
    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'completed');
    await insertSyncLog(db, jobId, 'info', 'SYNC_JOB_COMPLETED', {
      job_id: jobId,
      job_type: jobType,
      duration_ms: durationMs,
      gsc_rows: gscPersistedRows,
      ga4_rows: ga4PersistedRows,
      worker_id: workerId
    });

    return {
      success: true,
      jobId,
      jobType,
      durationMs,
      gscPersistedRows,
      ga4PersistedRows,
      gscTruncationStatus
    };
  } else {
    const errorSummary = [
      gscError ? `GSC: ${gscError.message}` : null,
      ga4Error ? `GA4: ${ga4Error.message}` : null
    ].filter(Boolean).join(' | ');

    await completeSyncJob(db, jobId, leaseAttemptId, generation, 'failed', errorSummary);
    await insertSyncLog(db, jobId, 'error', 'SYNC_JOB_FAILED', {
      job_id: jobId,
      job_type: jobType,
      duration_ms: durationMs,
      error: errorSummary,
      gsc_persisted_before_failure: gscPersistedRows,
      ga4_persisted_before_failure: ga4PersistedRows,
      worker_id: workerId
    });

    return {
      success: false,
      jobId,
      jobType,
      durationMs,
      error: errorSummary,
      gscPersistedRows,
      ga4PersistedRows,
      gscTruncationStatus
    };
  }
}
