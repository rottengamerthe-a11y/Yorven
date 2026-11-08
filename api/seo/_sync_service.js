/**
 * Core SEO Synchronization Engine
 * Yorven SEO Dashboard — Phase 2 Serverless Endpoints & Scheduled Worker
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';
import { getDatabaseAdapter } from '../auth/_utils.js';
import { fetchGscSearchAnalytics } from './_gsc_adapter.js';
import { fetchGa4Metrics } from './_ga4_adapter.js';

/**
 * Creates a new sync job record in public.seo_sync_jobs with status = 'pending'.
 */
export async function createSyncJob(db, jobType = 'full_resync', maxRetries = 3) {
  return await db.callAuthUtilRpc('create_sync_job', {
    p_job_type: jobType,
    p_max_retries: maxRetries
  });
}

/**
 * Atomically claims the oldest pending or expired processing job in FIFO order.
 * Returns JSONB: { claimed, job_id, job_type, generation, lease_expires_at, error }
 */
export async function claimSyncJob(db, workerId, leaseAttemptId, leaseDurationMs = 300000) {
  return await db.callAuthUtilRpc('claim_sync_job', {
    p_worker_id: workerId,
    p_lease_attempt_id: leaseAttemptId,
    p_lease_duration_ms: leaseDurationMs
  });
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

/**
 * Loads all monitored routes from public.seo_pages.
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
  const pageIdMap = new Map();
  for (const page of pages) {
    pageIdMap.set(page.path, page.id);
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
  parentSignal
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

  let gscPersistedRows = 0;
  let ga4PersistedRows = 0;
  let gscTruncationStatus = 'not_applicable';
  let gscError = null;
  let ga4Error = null;

  // 1. Load monitored pages
  const { pageIdMap } = await loadMonitoredPages(db);
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
