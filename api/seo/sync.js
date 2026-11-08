/**
 * POST /api/seo/sync
 * Serverless synchronization endpoint for Yorven SEO Dashboard.
 * Supports Owner AAL2 JWT and machine-to-machine Runner Secret.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';
import { getDatabaseAdapter } from '../auth/_utils.js';
import { authorizeSyncRequest, setSeoSecurityHeaders } from './_auth.js';
import {
  createSyncJob,
  claimSyncJob,
  executeClaimedSyncWorkload
} from './_sync_service.js';

const VALID_JOB_TYPES = new Set(['gsc_daily', 'ga4_daily', 'full_resync']);

export default async function handler(req, res) {
  setSeoSecurityHeaders(res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST is permitted on /api/seo/sync' });
  }

  // 1. Dual-path authentication (Owner JWT or Runner Secret)
  const authResult = await authorizeSyncRequest(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({
      error: authResult.error,
      message: authResult.message
    });
  }

  // 2. Parse and validate requested job type
  let requestedJobType = 'full_resync';
  if (req.body) {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // Leave default
      }
    }
    if (body?.job_type && VALID_JOB_TYPES.has(body.job_type)) {
      requestedJobType = body.job_type;
    } else if (body?.job_type && !VALID_JOB_TYPES.has(body.job_type)) {
      return res.status(400).json({
        error: 'INVALID_JOB_TYPE',
        message: "job_type must be one of: 'gsc_daily', 'ga4_daily', 'full_resync'"
      });
    }
  }

  const db = getDatabaseAdapter();
  const workerId = authResult.workerId;
  const leaseAttemptId = crypto.randomUUID();

  try {
    // 3. Create requested job in public.seo_sync_jobs (status = 'pending')
    const enqueuedJobId = await createSyncJob(db, requestedJobType, 3);

    // 4. Claim oldest eligible job in FIFO order via auth_util.claim_sync_job()
    const claimRes = await claimSyncJob(db, workerId, leaseAttemptId, 300000);

    if (!claimRes || !claimRes.claimed) {
      // Job was enqueued but could not be claimed immediately (e.g. concurrent claim or queue lock)
      return res.status(202).json({
        ok: true,
        enqueued: true,
        claimed: false,
        enqueued_job_id: enqueuedJobId,
        message: 'Job enqueued successfully; execution deferred to queue worker.'
      });
    }

    const claimedJobId = claimRes.job_id;
    const claimedJobType = claimRes.job_type;
    const generation = claimRes.generation;

    // 5. Execute strictly the workload matching claimedJobType under manual profile (6,500 ms cutoff)
    const execResult = await executeClaimedSyncWorkload({
      db,
      jobId: claimedJobId,
      jobType: claimedJobType,
      generation,
      leaseAttemptId,
      workerId,
      profile: 'manual'
    });

    if (!execResult.success) {
      return res.status(502).json({
        ok: false,
        executed_job_id: claimedJobId,
        executed_job_type: claimedJobType,
        enqueued_job_id: enqueuedJobId,
        requested_job_type: requestedJobType,
        job_type_matched: requestedJobType === claimedJobType,
        error: execResult.error,
        duration_ms: execResult.durationMs,
        gsc_rows: execResult.gscPersistedRows,
        ga4_rows: execResult.ga4PersistedRows,
        gsc_truncation_status: execResult.gscTruncationStatus
      });
    }

    return res.status(200).json({
      ok: true,
      executed_job_id: claimedJobId,
      executed_job_type: claimedJobType,
      enqueued_job_id: enqueuedJobId,
      requested_job_type: requestedJobType,
      job_type_matched: requestedJobType === claimedJobType,
      note: requestedJobType !== claimedJobType
        ? `Claimed prior pending ${claimedJobType} job in FIFO queue order; executed ${claimedJobType} workload only.`
        : undefined,
      duration_ms: execResult.durationMs,
      gsc_rows: execResult.gscPersistedRows,
      ga4_rows: execResult.ga4PersistedRows,
      gsc_truncation_status: execResult.gscTruncationStatus
    });
  } catch (err) {
    console.error('[Sync Endpoint Error]', err);
    return res.status(500).json({
      error: 'SYNC_EXECUTION_ERROR',
      message: err.message || 'Internal synchronization error'
    });
  }
}
