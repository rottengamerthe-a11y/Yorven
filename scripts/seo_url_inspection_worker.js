#!/usr/bin/env node
/**
 * Standalone Background SEO URL Inspection Worker
 * Dedicated worker for url_inspection_single and url_inspection_all jobs.
 * Runs autonomously as a Node CLI process or imported in test runners.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseAdapter, setDatabaseAdapter } from '../api/auth/_utils.js';
import {
  claimSyncJob,
  executeClaimedSyncWorkload
} from '../api/seo/_sync_service.js';

// Load local environment files if running outside GitHub Actions (e.g. during local tests)
export function loadEnvIfLocal() {
  const envFiles = ['.env.local', '.env'];
  for (const f of envFiles) {
    const fullPath = path.resolve(process.cwd(), f);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

export const INSPECTION_JOB_TYPES = ['url_inspection_single', 'url_inspection_all'];

/**
 * Main worker logic. Returns structured execution outcome.
 * Does not call process.exit directly to ensure full testability.
 */
export async function runInspectionWorker(options = {}) {
  const startTime = Date.now();
  const maxJobs = typeof options.maxJobs === 'number'
    ? options.maxJobs
    : (parseInt(process.env.MAX_INSPECTION_JOBS, 10) || 10);
  const maxDurationMs = typeof options.maxDurationMs === 'number'
    ? options.maxDurationMs
    : (parseInt(process.env.MAX_WORKER_DURATION_MS, 10) || 840000);
  const workerId = options.workerId || process.env.WORKER_ID || 'worker-url-inspection';
  const pacingDelayMs = typeof options.pacingDelayMs === 'number' ? options.pacingDelayMs : 1000;

  // Initialize DB if not injected
  let db = options.db;
  if (!db) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[InspectionWorker Error] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
      return {
        success: false,
        exitCode: 1,
        jobsProcessed: 0,
        error: 'CONFIG_ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      };
    }
    db = new DatabaseAdapter({ supabaseUrl, serviceRoleKey });
    setDatabaseAdapter(db);
  }

  let primaryTypeIdx = 0;
  let jobsProcessed = 0;
  let successfulJobs = 0;
  let failedJobs = 0;

  console.log(`[${new Date().toISOString()}] [InspectionWorker] Starting worker (${workerId}, maxJobs=${maxJobs}, maxDuration=${maxDurationMs}ms)...`);

  while (jobsProcessed < maxJobs) {
    // Check execution deadline or external cancellation
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxDurationMs || options.signal?.aborted) {
      console.log(`[InspectionWorker] Reached execution deadline or received abort signal (elapsed=${elapsed}ms). Halting queue loop.`);
      break;
    }

    const type1 = INSPECTION_JOB_TYPES[primaryTypeIdx];
    const type2 = INSPECTION_JOB_TYPES[1 - primaryTypeIdx];
    const leaseAttemptId = crypto.randomUUID();

    let claimRes = null;
    try {
      // 1. Attempt claim on primary inspection type
      claimRes = await claimSyncJob(db, workerId, leaseAttemptId, 300000, type1);

      // 2. If nothing claimed, try the secondary inspection type
      if (!claimRes || !claimRes.claimed) {
        claimRes = await claimSyncJob(db, workerId, leaseAttemptId, 300000, type2);
      }
    } catch (claimErr) {
      console.error('[InspectionWorker] Error while claiming job from queue:', claimErr.message || claimErr);
      return {
        success: false,
        exitCode: 1,
        jobsProcessed,
        error: claimErr.message || 'Error claiming sync job'
      };
    }

    if (!claimRes || !claimRes.claimed) {
      console.log('[InspectionWorker] No more eligible inspection jobs in queue. Drained successfully.');
      break;
    }

    // Alternate primary type for next iteration to prevent starvation
    primaryTypeIdx = 1 - primaryTypeIdx;

    const { job_id: jobId, job_type: jobType, generation, payload } = claimRes;
    console.log(`[InspectionWorker] Claimed job ${jobId} (type=${jobType}, gen=${generation}). Executing workload...`);

    let execResult = null;
    try {
      execResult = await executeClaimedSyncWorkload({
        db,
        jobId,
        jobType,
        generation,
        leaseAttemptId,
        workerId,
        profile: 'worker',
        parentSignal: options.signal,
        payload,
        pacingDelayMs
      });
    } catch (execErr) {
      console.error(`[InspectionWorker] Unexpected error executing workload for job ${jobId}:`, execErr.message || execErr);
      failedJobs++;
      jobsProcessed++;
      continue;
    }

    jobsProcessed++;
    if (execResult?.success) {
      successfulJobs++;
      console.log(`[InspectionWorker] Job ${jobId} finished successfully in ${execResult.durationMs}ms.`);
    } else {
      failedJobs++;
      console.error(`[InspectionWorker] Job ${jobId} reported failure: ${execResult?.error || 'Unknown failure'}. Continuing queue loop.`);
    }
  }

  const totalDurationMs = Date.now() - startTime;
  console.log(`[InspectionWorker] Run complete: processed ${jobsProcessed} jobs (${successfulJobs} succeeded, ${failedJobs} failed) in ${totalDurationMs}ms.`);

  return {
    success: true,
    exitCode: 0,
    jobsProcessed,
    successfulJobs,
    failedJobs,
    durationMs: totalDurationMs
  };
}

// Direct CLI entrypoint execution
const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile && currentFile === invokedFile) {
  loadEnvIfLocal();
  runInspectionWorker()
    .then((res) => {
      process.exit(res.exitCode);
    })
    .catch((err) => {
      console.error('[InspectionWorker Fatal Unhandled]', err);
      process.exit(1);
    });
}
