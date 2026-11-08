/**
 * GET /api/seo/status
 * Provider health and synchronization audit endpoint for Yorven SEO Dashboard.
 * Requires Owner AAL2 JWT, Origin validation, and CSRF header.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import { getDatabaseAdapter } from '../auth/_utils.js';
import { authorizeOwnerRequest, setSeoSecurityHeaders } from './_auth.js';

/**
 * Fetches GSC lifecycle events using bounded keyset pagination on (created_at, id).
 * Capped at 100 events max (2 pages of 50).
 */
async function fetchGscEventsWithKeyset(db) {
  const allEvents = [];

  // Page 1: Initial fetch of 50 events
  const p1Url = `${db.supabaseUrl}/rest/v1/seo_sync_logs?payload->>provider=eq.gsc&order=created_at.desc,id.desc&limit=50`;
  const p1Res = await fetch(p1Url, { headers: db.getPostgrestHeaders('public') });
  if (!p1Res.ok) return allEvents;

  const page1 = await p1Res.json();
  if (!Array.isArray(page1) || page1.length === 0) return allEvents;
  allEvents.push(...page1);

  // If Page 1 returned a full batch of 50, fetch Page 2 using compound keyset cursor
  if (page1.length === 50) {
    const lastEvent = page1[49];
    const cursorDate = encodeURIComponent(lastEvent.created_at);
    const cursorId = encodeURIComponent(lastEvent.id);

    const p2Url = `${db.supabaseUrl}/rest/v1/seo_sync_logs?payload->>provider=eq.gsc&or=(created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId}))&order=created_at.desc,id.desc&limit=50`;
    const p2Res = await fetch(p2Url, { headers: db.getPostgrestHeaders('public') });
    if (p2Res.ok) {
      const page2 = await p2Res.json();
      if (Array.isArray(page2)) {
        allEvents.push(...page2);
      }
    }
  }

  return allEvents;
}

/**
 * Evaluates GSC attempt status and completed ingestion status independently.
 */
async function evaluateGscStatus(db, gscEvents) {
  let latestAttemptStatus = 'unknown';
  let latestAttemptTime = null;
  let latestAttemptJobId = null;
  let latestCompletedIngestionStatus = 'unknown';
  let latestCompletedIngestionTime = null;
  let healthStatus = 'uninitialized';

  // 1. Identify the latest attempt via the newest PROVIDER_STARTED event
  const latestStartEvent = gscEvents.find(
    e => e.message === 'PROVIDER_STARTED' && e.payload?.provider === 'gsc'
  );

  if (latestStartEvent) {
    latestAttemptTime = latestStartEvent.created_at;
    latestAttemptJobId = latestStartEvent.job_id;

    // Filter events belonging strictly to this attempt job
    const jobEvents = gscEvents.filter(e => e.job_id === latestAttemptJobId);
    const jobMessages = new Set(jobEvents.map(e => e.message));

    // Fetch attempt job state from public.seo_sync_jobs
    let job = null;
    try {
      const jobRes = await fetch(
        `${db.supabaseUrl}/rest/v1/seo_sync_jobs?id=eq.${latestAttemptJobId}&select=status,lease_expires_at,finished_at`,
        { headers: db.getPostgrestHeaders('public') }
      );
      if (jobRes.ok) {
        const rows = await jobRes.json();
        job = rows[0] || null;
      }
    } catch {
      // Ignore
    }

    const now = new Date();
    const isLeaseActive = job && job.status === 'processing' && job.lease_expires_at && new Date(job.lease_expires_at) > now;

    // Classify latest_attempt_status deterministically
    if (jobMessages.has('GSC_SNAPSHOT_PERSISTED_COMPLETE')) {
      latestAttemptStatus = 'successful';
    } else if (jobMessages.has('GSC_SNAPSHOT_PERSISTED_TRUNCATED')) {
      latestAttemptStatus = 'successful_truncated';
    } else if (jobMessages.has('GSC_FETCH_FAILED')) {
      latestAttemptStatus = 'failed_fetch';
    } else if (jobMessages.has('GSC_UPSERT_FAILED') || jobMessages.has('GSC_UPSERT_CHUNK_FAILED')) {
      latestAttemptStatus = jobMessages.has('GSC_UPSERT_CHUNK_SUCCESS')
        ? 'partial_write_failed'
        : 'failed_no_writes';
    } else if (jobMessages.has('GSC_UPSERT_CHUNK_SUCCESS')) {
      if (isLeaseActive) {
        latestAttemptStatus = 'sync_in_progress';
      } else {
        latestAttemptStatus = 'partial_write_interrupted';
      }
    } else {
      if (isLeaseActive) {
        latestAttemptStatus = 'sync_in_progress';
      } else if (job && (job.status === 'failed' || job.status === 'discarded_stale')) {
        latestAttemptStatus = 'failed_no_writes';
      } else if (job && job.status === 'completed') {
        latestAttemptStatus = 'incomplete_unverified';
      } else {
        latestAttemptStatus = 'interrupted_stalled';
      }
    }
  }

  // 2. Independently evaluate latest_completed_ingestion_status
  for (const event of gscEvents) {
    if (event.message === 'GSC_SNAPSHOT_PERSISTED_COMPLETE') {
      latestCompletedIngestionStatus = 'complete';
      latestCompletedIngestionTime = event.created_at;
      break;
    }
    if (event.message === 'GSC_SNAPSHOT_PERSISTED_TRUNCATED') {
      latestCompletedIngestionStatus = 'possibly_truncated';
      latestCompletedIngestionTime = event.created_at;
      break;
    }
  }

  // 3. Determine GSC Health Status
  if (!latestStartEvent) {
    healthStatus = 'uninitialized';
  } else if (latestAttemptStatus === 'sync_in_progress') {
    healthStatus = 'sync_in_progress';
  } else if (latestAttemptStatus === 'interrupted_stalled') {
    healthStatus = 'interrupted_stalled';
  } else if (latestAttemptStatus === 'partial_write_interrupted') {
    healthStatus = 'partial_write_interrupted';
  } else if (latestAttemptStatus.startsWith('failed') || latestAttemptStatus === 'partial_write_failed') {
    healthStatus = 'failed';
  } else if (latestAttemptStatus.startsWith('successful')) {
    const elapsedMs = latestCompletedIngestionTime ? (Date.now() - new Date(latestCompletedIngestionTime).getTime()) : Infinity;
    healthStatus = elapsedMs <= 36 * 3600000 ? 'healthy' : 'stale';
  } else {
    healthStatus = 'unknown';
  }

  return {
    health_status: healthStatus,
    latest_attempt_status: latestAttemptStatus,
    latest_attempt_time: latestAttemptTime,
    latest_completed_ingestion_status: latestCompletedIngestionStatus,
    latest_completed_ingestion_time: latestCompletedIngestionTime
  };
}

/**
 * Evaluates GA4 health status independently.
 */
async function evaluateGa4Status(db) {
  const logsRes = await fetch(
    `${db.supabaseUrl}/rest/v1/seo_sync_logs?payload->>provider=eq.ga4&order=created_at.desc,id.desc&limit=20`,
    { headers: db.getPostgrestHeaders('public') }
  );

  let healthStatus = 'uninitialized';
  let latestAttemptStatus = 'unknown';
  let latestAttemptTime = null;
  let lastSuccessfulSync = null;

  if (logsRes.ok) {
    const events = await logsRes.json();
    const startEvent = events.find(e => e.message === 'PROVIDER_STARTED');

    if (startEvent) {
      latestAttemptTime = startEvent.created_at;
      const jobEvents = events.filter(e => e.job_id === startEvent.job_id);
      const jobMessages = new Set(jobEvents.map(e => e.message));

      if (jobMessages.has('GA4_UPSERT_SUCCESS')) {
        latestAttemptStatus = 'successful';
      } else if (jobMessages.has('GA4_FETCH_FAILED')) {
        latestAttemptStatus = 'failed_fetch';
      } else if (jobMessages.has('GA4_UPSERT_FAILED')) {
        latestAttemptStatus = 'failed_upsert';
      } else {
        latestAttemptStatus = 'sync_in_progress';
      }
    }

    const successEvent = events.find(e => e.message === 'GA4_UPSERT_SUCCESS');
    if (successEvent) {
      lastSuccessfulSync = successEvent.created_at;
    }

    if (!startEvent) {
      healthStatus = 'uninitialized';
    } else if (latestAttemptStatus === 'sync_in_progress') {
      healthStatus = 'sync_in_progress';
    } else if (latestAttemptStatus.startsWith('failed')) {
      healthStatus = 'failed';
    } else if (latestAttemptStatus === 'successful') {
      const elapsedMs = lastSuccessfulSync ? (Date.now() - new Date(lastSuccessfulSync).getTime()) : Infinity;
      healthStatus = elapsedMs <= 36 * 3600000 ? 'healthy' : 'stale';
    }
  }

  return {
    health_status: healthStatus,
    latest_attempt_status: latestAttemptStatus,
    latest_attempt_time: latestAttemptTime,
    last_successful_sync: lastSuccessfulSync
  };
}

export default async function handler(req, res) {
  setSeoSecurityHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET is permitted on /api/seo/status' });
  }

  const authResult = await authorizeOwnerRequest(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({
      error: authResult.error,
      message: authResult.message
    });
  }

  const db = getDatabaseAdapter();

  try {
    // 1. Evaluate GSC status via keyset pagination
    const gscEvents = await fetchGscEventsWithKeyset(db);
    const gscStatus = await evaluateGscStatus(db, gscEvents);

    // 2. Evaluate GA4 status
    const ga4Status = await evaluateGa4Status(db);

    // 3. Query physical data recency from metrics tables
    let gscDataRecordedAt = null;
    let ga4DataRecordedAt = null;

    try {
      const gscRecRes = await fetch(
        `${db.supabaseUrl}/rest/v1/seo_search_console_metrics?select=recorded_at&order=recorded_at.desc&limit=1`,
        { headers: db.getPostgrestHeaders('public') }
      );
      if (gscRecRes.ok) {
        const rows = await gscRecRes.json();
        gscDataRecordedAt = rows[0]?.recorded_at || null;
      }
    } catch {}

    try {
      const ga4RecRes = await fetch(
        `${db.supabaseUrl}/rest/v1/seo_ga4_metrics?select=recorded_at&order=recorded_at.desc&limit=1`,
        { headers: db.getPostgrestHeaders('public') }
      );
      if (ga4RecRes.ok) {
        const rows = await ga4RecRes.json();
        ga4DataRecordedAt = rows[0]?.recorded_at || null;
      }
    } catch {}

    // 4. Query recent jobs from public.seo_sync_jobs (limit 5)
    let recentJobs = [];
    try {
      const jobsRes = await fetch(
        `${db.supabaseUrl}/rest/v1/seo_sync_jobs?select=id,job_type,status,worker_id,retry_count,started_at,finished_at,created_at&order=created_at.desc&limit=5`,
        { headers: db.getPostgrestHeaders('public') }
      );
      if (jobsRes.ok) {
        recentJobs = await jobsRes.json();
      }
    } catch {}

    // 5. Query recent logs from public.seo_sync_logs (limit 10)
    let recentLogs = [];
    try {
      const logsRes = await fetch(
        `${db.supabaseUrl}/rest/v1/seo_sync_logs?select=id,job_id,level,message,payload,created_at&order=created_at.desc&limit=10`,
        { headers: db.getPostgrestHeaders('public') }
      );
      if (logsRes.ok) {
        recentLogs = await logsRes.json();
      }
    } catch {}

    // Check if queue has a currently pending or processing job
    const activeJob = recentJobs.find(j => j.status === 'processing' || j.status === 'pending') || null;

    return res.status(200).json({
      providers: {
        gsc: {
          health_status: gscStatus.health_status,
          latest_attempt_status: gscStatus.latest_attempt_status,
          latest_attempt_time: gscStatus.latest_attempt_time,
          latest_completed_ingestion_status: gscStatus.latest_completed_ingestion_status,
          latest_completed_ingestion_time: gscStatus.latest_completed_ingestion_time,
          latest_data_recorded_at: gscDataRecordedAt
        },
        ga4: {
          health_status: ga4Status.health_status,
          latest_attempt_status: ga4Status.latest_attempt_status,
          latest_attempt_time: ga4Status.latest_attempt_time,
          last_successful_sync: ga4Status.last_successful_sync,
          latest_data_recorded_at: ga4DataRecordedAt
        }
      },
      queue: {
        active_job: activeJob,
        recent_jobs: recentJobs
      },
      audit: {
        recent_logs: recentLogs
      },
      disclaimers: {
        scope_note: 'Provider health and ingestion statuses describe individual execution attempts. Rows are merged into public.seo_search_console_metrics and public.seo_ga4_metrics using unique constraints and do not replace the cumulative historical store.'
      }
    });
  } catch (err) {
    console.error('[Status Endpoint Error]', err);
    return res.status(500).json({
      error: 'STATUS_QUERY_ERROR',
      message: err.message || 'Failed to query synchronization status'
    });
  }
}
