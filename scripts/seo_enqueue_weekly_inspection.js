#!/usr/bin/env node
/**
 * Weekly SEO Bulk URL Inspection Enqueue Script
 * Enqueues exactly one 'url_inspection_all' job in public.seo_sync_jobs.
 * Runs autonomously as a Node CLI process or imported in test runners.
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseAdapter, setDatabaseAdapter } from '../api/auth/_utils.js';
import { createSyncJob } from '../api/seo/_sync_service.js';

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

/**
 * Enqueues a scheduled url_inspection_all job without manual target snapshots.
 * The database RPC atomically snapshots all active monitored routes from public.seo_pages.
 *
 * @param {Object} options
 * @param {Object} [options.db] - Injected database adapter for testing
 * @returns {Promise<Object>} Execution result { success, exitCode, jobId, skipped, error }
 */
export async function enqueueWeeklyInspection(options = {}) {
  let db = options.db;
  if (!db) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[EnqueueWeekly Error] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
      return {
        success: false,
        exitCode: 1,
        error: 'CONFIG_ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      };
    }
    db = new DatabaseAdapter({ supabaseUrl, serviceRoleKey });
    setDatabaseAdapter(db);
  }

  try {
    console.log(`[${new Date().toISOString()}] [EnqueueWeekly] Enqueueing scheduled url_inspection_all job...`);
    // Pass empty payload: database RPC captures target_page_ids snapshot atomically from public.seo_pages
    const jobId = await createSyncJob(db, 'url_inspection_all', 3, {});
    console.log(`[EnqueueWeekly] Successfully enqueued url_inspection_all job: ${jobId}`);
    return {
      success: true,
      exitCode: 0,
      jobId,
      status: 'enqueued'
    };
  } catch (err) {
    // Gracefully handle duplicate active bulk job in queue (uq_seo_sync_jobs_active_inspection_all)
    if (
      err?.status === 409 ||
      err?.data?.code === '23505' ||
      err?.message?.includes('409') ||
      err?.message?.includes('duplicate key') ||
      err?.message?.includes('unique constraint') ||
      err?.message?.includes('uq_seo_sync_jobs_active_inspection_all')
    ) {
      console.log('[EnqueueWeekly] An active bulk inspection job is already pending or processing. Skipping enqueue.');
      return {
        success: true,
        exitCode: 0,
        skipped: true,
        reason: 'ACTIVE_BULK_JOB_EXISTS'
      };
    }

    console.error('[EnqueueWeekly Error] Failed to enqueue bulk inspection job:', err?.message || err);
    return {
      success: false,
      exitCode: 1,
      error: err?.message || 'Failed to enqueue bulk inspection job'
    };
  }
}

// Direct CLI entrypoint execution
const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedFile && currentFile === invokedFile) {
  loadEnvIfLocal();
  enqueueWeeklyInspection()
    .then((res) => {
      process.exit(res.exitCode);
    })
    .catch((err) => {
      console.error('[EnqueueWeekly Fatal Unhandled]', err);
      process.exit(1);
    });
}
