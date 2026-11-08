#!/usr/bin/env node
/**
 * Standalone Background SEO Sync Worker
 * Scheduled via GitHub Actions (.github/workflows/seo-sync-daily.yml) daily at 02:00 UTC.
 * Runs autonomously as a Node CLI process on the runner VM.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseAdapter, setDatabaseAdapter } from '../api/auth/_utils.js';
import {
  createSyncJob,
  claimSyncJob,
  executeClaimedSyncWorkload
} from '../api/seo/_sync_service.js';

// Load local environment files if running outside GitHub Actions (e.g. during local tests)
function loadEnvIfLocal() {
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

loadEnvIfLocal();

const WORKER_ID = 'worker-github-actions';

async function main() {
  console.log(`[${new Date().toISOString()}] [Worker] Initializing SEO sync worker (${WORKER_ID})...`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[Worker Error] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
    process.exit(1);
  }

  const db = new DatabaseAdapter({ supabaseUrl, serviceRoleKey });
  setDatabaseAdapter(db);

  const leaseAttemptId = crypto.randomUUID();

  try {
    // 1. Queue Pre-Check: Inspect for claimable jobs (pending OR expired lease) across the queue
    console.log('[Worker] Inspecting queue for claimable jobs...');
    const claimableRes = await fetch(
      `${supabaseUrl}/rest/v1/seo_sync_jobs?or=(status.eq.pending,and(status.eq.processing,lease_expires_at.lte.now()))&order=created_at.asc&limit=1`,
      { headers: db.getPostgrestHeaders('public') }
    );

    let hasClaimableJob = false;
    if (claimableRes.ok) {
      const claimable = await claimableRes.json();
      hasClaimableJob = Array.isArray(claimable) && claimable.length > 0;
    }

    if (!hasClaimableJob) {
      // 2. Check if another worker currently holds an active, unexpired lease
      const activeRes = await fetch(
        `${supabaseUrl}/rest/v1/seo_sync_jobs?status=eq.processing&lease_expires_at=gt.now()&limit=1`,
        { headers: db.getPostgrestHeaders('public') }
      );
      if (activeRes.ok) {
        const activeJobs = await activeRes.json();
        if (Array.isArray(activeJobs) && activeJobs.length > 0) {
          console.log(`[Worker] Active job ${activeJobs[0].id} currently holds an unexpired lease. Exiting cleanly.`);
          process.exit(0);
        }
      }

      // 3. Queue is truly idle -> Enqueue scheduled full_resync job
      console.log('[Worker] Queue is idle. Enqueuing scheduled full_resync job...');
      const enqueuedId = await createSyncJob(db, 'full_resync', 3);
      console.log(`[Worker] Enqueued new job: ${enqueuedId}`);
    } else {
      console.log('[Worker] Existing claimable job found in queue. Proceeding directly to claim...');
    }

    // 4. Claim oldest eligible job via auth_util.claim_sync_job()
    console.log('[Worker] Claiming job in FIFO order...');
    const claimRes = await claimSyncJob(db, WORKER_ID, leaseAttemptId, 300000);

    if (!claimRes || !claimRes.claimed) {
      console.log(`[Worker] No jobs available to claim (reason: ${claimRes?.error || 'unknown'}). Exiting.`);
      process.exit(0);
    }

    const { job_id: jobId, job_type: jobType, generation } = claimRes;
    console.log(`[Worker] Successfully claimed job ${jobId} (type: ${jobType}, gen: ${generation}).`);

    // 5. Execute workload under 'worker' profile (10-minute VM allowance, up to 10k GSC rows, 5k GA4 rows)
    const result = await executeClaimedSyncWorkload({
      db,
      jobId,
      jobType,
      generation,
      leaseAttemptId,
      workerId: WORKER_ID,
      profile: 'worker'
    });

    console.log('[Worker] Execution finished with result:', JSON.stringify(result, null, 2));

    if (!result.success) {
      console.error(`[Worker Failed] ${result.error}`);
      process.exit(1);
    }

    console.log(`[Worker Complete] Job ${jobId} finished in ${result.durationMs}ms.`);
    process.exit(0);
  } catch (err) {
    console.error('[Worker Fatal Error]', err);
    process.exit(1);
  }
}

main();
