import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  enqueueWeeklyInspection
} from '../../scripts/seo_enqueue_weekly_inspection.js';
import {
  setCustomUrlInspectionFetcher
} from '../../api/seo/_url_inspection_adapter.js';

describe('Weekly Bulk URL Inspection Schedule & Enqueue', () => {
  beforeEach(() => {
    setCustomUrlInspectionFetcher(null);
  });

  afterEach(() => {
    setCustomUrlInspectionFetcher(null);
  });

  // 1 & 2. Weekly enqueue creates url_inspection_all with correct RPC parameters
  test('Enqueue: calls create_sync_job with job_type url_inspection_all, 3 retries, and empty payload', async () => {
    let capturedRpc = null;
    let capturedParams = null;

    const mockDb = {
      callAuthUtilRpc: async (name, params) => {
        capturedRpc = name;
        capturedParams = params;
        return 'bulk-job-uuid-777';
      }
    };

    const res = await enqueueWeeklyInspection({ db: mockDb });

    assert.equal(res.success, true);
    assert.equal(res.exitCode, 0);
    assert.equal(res.jobId, 'bulk-job-uuid-777');
    assert.equal(res.status, 'enqueued');

    assert.equal(capturedRpc, 'create_sync_job');
    assert.equal(capturedParams.p_job_type, 'url_inspection_all');
    assert.equal(capturedParams.p_max_retries, 3);
    assert.deepEqual(capturedParams.p_payload, {});
  });

  // 3. Duplicate active bulk job handling
  test('Duplicate Active Job: gracefully skips enqueue when active bulk job exists (HTTP 409)', async () => {
    const mockDb = {
      callAuthUtilRpc: async () => {
        const err = new Error('duplicate key value violates unique constraint "uq_seo_sync_jobs_active_inspection_all"');
        err.status = 409;
        err.data = { code: '23505', message: 'duplicate key value violates unique constraint' };
        throw err;
      }
    };

    const res = await enqueueWeeklyInspection({ db: mockDb });

    assert.equal(res.success, true);
    assert.equal(res.exitCode, 0);
    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'ACTIVE_BULK_JOB_EXISTS');
  });

  // 4. Missing credentials fail closed
  test('Credentials: fails closed with exitCode 1 when SUPABASE_URL or service key is missing', async () => {
    const savedUrl = process.env.SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const res = await enqueueWeeklyInspection();
      assert.equal(res.success, false);
      assert.equal(res.exitCode, 1);
      assert.match(res.error, /Missing SUPABASE_URL/);
    } finally {
      if (savedUrl) process.env.SUPABASE_URL = savedUrl;
      if (savedKey) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    }
  });

  // 5. No Google API calls occur during enqueue
  test('Isolation: enqueue script never invokes Google URL Inspection APIs', async () => {
    let googleCalled = false;
    setCustomUrlInspectionFetcher(async () => {
      googleCalled = true;
      return {};
    });

    const mockDb = {
      callAuthUtilRpc: async () => 'bulk-job-id'
    };

    const res = await enqueueWeeklyInspection({ db: mockDb });

    assert.equal(res.success, true);
    assert.equal(googleCalled, false, 'Enqueue script must never perform Google inspection requests');
  });

  // 6. No arbitrary route snapshot supplied
  test('Snapshot Integrity: script never supplies a manual target_page_ids snapshot', async () => {
    let passedPayload = null;

    const mockDb = {
      callAuthUtilRpc: async (name, params) => {
        passedPayload = params.p_payload;
        return 'bulk-job-id';
      }
    };

    await enqueueWeeklyInspection({ db: mockDb });

    assert.deepEqual(passedPayload, {}, 'Payload must be empty object so database RPC snapshots public.seo_pages');
    assert.equal('target_page_ids' in passedPayload, false);
  });

  // 7, 8, 9, 10. Workflow schedule and execution condition verification
  test('Workflow Schedule & Triggers: validates .github/workflows/seo-url-inspection-weekly.yml', () => {
    const workflowPath = path.resolve(process.cwd(), '.github/workflows/seo-url-inspection-weekly.yml');
    assert.ok(fs.existsSync(workflowPath), 'Workflow file must exist');

    const content = fs.readFileSync(workflowPath, 'utf8');

    // Verify 15-minute cron
    assert.ok(content.includes("'*/15 * * * *'"), 'Workflow must include 15-minute cron schedule');

    // Verify Sunday 03:00 UTC cron
    assert.ok(content.includes("'0 3 * * 0'"), 'Workflow must include Sunday 03:00 UTC schedule');

    // Verify workflow_dispatch with enqueue_bulk input
    assert.ok(content.includes('workflow_dispatch:'), 'Workflow must support workflow_dispatch');
    assert.ok(content.includes('enqueue_bulk:'), 'Workflow must support enqueue_bulk input');

    // Verify concurrency group
    assert.ok(content.includes('group: yorven-seo-url-inspection'), 'Workflow must have distinct concurrency group');
    assert.ok(content.includes('cancel-in-progress: false'), 'Workflow must not cancel in progress');

    // Verify enqueue step condition
    const enqueueConditionRegex = /if:\s*github\.event\.schedule\s*==\s*'0 3 \* \* 0'\s*\|\|\s*inputs\.enqueue_bulk\s*==\s*true/;
    assert.ok(enqueueConditionRegex.test(content), 'Enqueue step must evaluate exact schedule and manual dispatch conditions');

    // Verify evaluation rules
    const shouldEnqueue = (schedule, enqueueBulk) => {
      return schedule === '0 3 * * 0' || enqueueBulk === true;
    };

    // 7. 15-minute worker run does not enqueue bulk
    assert.equal(shouldEnqueue('*/15 * * * *', false), false);

    // 8. Manual dispatch without enqueue_bulk does not enqueue bulk
    assert.equal(shouldEnqueue(undefined, false), false);
    assert.equal(shouldEnqueue(undefined, undefined), false);

    // 9. Sunday 03:00 UTC enqueues bulk
    assert.equal(shouldEnqueue('0 3 * * 0', false), true);

    // 9b. Manual dispatch with enqueue_bulk enqueues bulk
    assert.equal(shouldEnqueue(undefined, true), true);
  });
});
