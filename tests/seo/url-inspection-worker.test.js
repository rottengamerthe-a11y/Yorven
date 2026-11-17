import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  runInspectionWorker,
  INSPECTION_JOB_TYPES
} from '../../scripts/seo_url_inspection_worker.js';
import {
  setCustomUrlInspectionFetcher
} from '../../api/seo/_url_inspection_adapter.js';

describe('Dedicated URL Inspection Worker (scripts/seo_url_inspection_worker.js)', () => {
  let originalFetch;
  let mockPages;
  const targetPageId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    setCustomUrlInspectionFetcher(null);

    mockPages = [
      {
        id: targetPageId,
        path: '/work',
        title: 'Work',
        canonical_url: 'https://yorven.in/work',
        is_indexed: true,
        last_crawled_at: '2026-11-01T00:00:00Z'
      }
    ];

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      if (url.includes('/rest/v1/seo_url_inspections')) {
        return { ok: true, status: 201, json: async () => [JSON.parse(options.body)] };
      }
      if (url.includes('/rest/v1/seo_sync_logs')) {
        return { ok: true, status: 201, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setCustomUrlInspectionFetcher(null);
  });

  // 1 & 10. Correct job-type filtering & GSC/GA4 isolation
  test('Job Filtering: worker strictly requests only url_inspection_single or url_inspection_all and never claims GSC/GA4', async () => {
    const requestedFilters = [];

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'claim_sync_job') {
          requestedFilters.push(params.p_job_type_filter);
          return { claimed: false }; // End loop
        }
        return {};
      }
    };

    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 5,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.ok(requestedFilters.length >= 2);
    for (const filter of requestedFilters) {
      assert.ok(
        filter === 'url_inspection_single' || filter === 'url_inspection_all',
        `Worker must only claim inspection types, got '${filter}'`
      );
      assert.notEqual(filter, 'gsc_daily');
      assert.notEqual(filter, 'ga4_daily');
      assert.notEqual(filter, 'full_resync');
      assert.notEqual(filter, null);
      assert.notEqual(filter, undefined);
    }
  });

  // 2. Processing single inspection jobs
  test('Single Inspection: successfully claims and completes url_inspection_single job', async () => {
    let claimedOnce = false;
    let completedJobId = null;
    let completedStatus = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'claim_sync_job') {
          if (!claimedOnce && params.p_job_type_filter === 'url_inspection_single') {
            claimedOnce = true;
            return {
              claimed: true,
              job_id: 'job-single-123',
              job_type: 'url_inspection_single',
              generation: 1,
              payload: { page_id: targetPageId }
            };
          }
          return { claimed: false };
        }
        if (name === 'complete_sync_job') {
          completedJobId = params.p_job_id;
          completedStatus = params.p_status;
          return { success: true };
        }
        return {};
      }
    };

    setCustomUrlInspectionFetcher(async ({ inspectionUrl }) => {
      assert.equal(inspectionUrl, 'https://yorven.in/work');
      return {
        inspectionResult: {
          indexStatusResult: { verdict: 'PASS' }
        }
      };
    });

    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 5,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.equal(res.jobsProcessed, 1);
    assert.equal(res.successfulJobs, 1);
    assert.equal(res.failedJobs, 0);
    assert.equal(completedJobId, 'job-single-123');
    assert.equal(completedStatus, 'completed');
  });

  // 3. Processing bulk inspection jobs
  test('Bulk Inspection: successfully claims and completes url_inspection_all job', async () => {
    let claimedOnce = false;
    let completedStatus = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'claim_sync_job') {
          if (!claimedOnce && params.p_job_type_filter === 'url_inspection_all') {
            claimedOnce = true;
            return {
              claimed: true,
              job_id: 'job-bulk-456',
              job_type: 'url_inspection_all',
              generation: 1,
              payload: { target_page_ids: [targetPageId] }
            };
          }
          return { claimed: false };
        }
        if (name === 'complete_sync_job') {
          completedStatus = params.p_status;
          return { success: true };
        }
        return {};
      }
    };

    setCustomUrlInspectionFetcher(async () => ({
      inspectionResult: { indexStatusResult: { verdict: 'PASS' } }
    }));

    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 5,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.equal(res.jobsProcessed, 1);
    assert.equal(res.successfulJobs, 1);
    assert.equal(completedStatus, 'completed');
  });

  // 4. Alternating between job types without starvation
  test('Starvation Prevention: alternates primary claim filter after each processed job', async () => {
    const queue = [
      { id: 'job-s1', type: 'url_inspection_single', payload: { page_id: targetPageId } },
      { id: 'job-b1', type: 'url_inspection_all', payload: { target_page_ids: [targetPageId] } },
      { id: 'job-s2', type: 'url_inspection_single', payload: { page_id: targetPageId } }
    ];

    const firstCheckedFilters = [];

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'claim_sync_job') {
          const filter = params.p_job_type_filter;
          firstCheckedFilters.push(filter);

          const idx = queue.findIndex((j) => j.type === filter);
          if (idx !== -1) {
            const [claimed] = queue.splice(idx, 1);
            return {
              claimed: true,
              job_id: claimed.id,
              job_type: claimed.type,
              generation: 1,
              payload: claimed.payload
            };
          }
          return { claimed: false };
        }
        return { success: true };
      }
    };

    setCustomUrlInspectionFetcher(async () => ({
      inspectionResult: { indexStatusResult: { verdict: 'PASS' } }
    }));

    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 3,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.equal(res.jobsProcessed, 3);
    assert.equal(res.successfulJobs, 3);

    // Initial claim checked 'url_inspection_single' first
    assert.equal(firstCheckedFilters[0], 'url_inspection_single');
    // After claiming single, the next iteration checked 'url_inspection_all' first
    assert.equal(firstCheckedFilters[1], 'url_inspection_all');
  });

  // 5. Empty queue exits successfully
  test('Empty Queue: cleanly exits with exitCode 0 and 0 jobs processed when queue is empty', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async () => ({ claimed: false })
    };

    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 10,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.equal(res.success, true);
    assert.equal(res.jobsProcessed, 0);
  });

  // 6. Multiple jobs processed up to configured maximum
  test('Max Jobs Limit: processes up to configured maxJobs then halts queue loop', async () => {
    let claimCount = 0;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'claim_sync_job') {
          claimCount++;
          return {
            claimed: true,
            job_id: `job-${claimCount}`,
            job_type: 'url_inspection_single',
            generation: 1,
            payload: { page_id: targetPageId }
          };
        }
        return { success: true };
      }
    };

    setCustomUrlInspectionFetcher(async () => ({
      inspectionResult: { indexStatusResult: { verdict: 'PASS' } }
    }));

    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 4,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.equal(res.jobsProcessed, 4);
    assert.equal(res.successfulJobs, 4);
    assert.equal(claimCount, 4);
  });

  // 7. Runtime limit respected
  test('Runtime Limit: halts queue processing when execution duration limit is reached', async () => {
    let claimCount = 0;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name) => {
        if (name === 'claim_sync_job') {
          claimCount++;
          return {
            claimed: true,
            job_id: `job-${claimCount}`,
            job_type: 'url_inspection_single',
            generation: 1,
            payload: { page_id: targetPageId }
          };
        }
        return { success: true };
      }
    };

    setCustomUrlInspectionFetcher(async () => ({
      inspectionResult: { indexStatusResult: { verdict: 'PASS' } }
    }));

    // maxDurationMs = 1 ms causes immediate timeout on second loop iteration
    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 100,
      maxDurationMs: 1,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.ok(res.jobsProcessed <= 1);
  });

  // 8. Individual job failure does not corrupt later job processing
  test('Resilience: continues to process next job even if an earlier job fails', async () => {
    let callIndex = 0;
    const completedStatuses = [];

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'claim_sync_job') {
          callIndex++;
          if (callIndex === 1) {
            return {
              claimed: true,
              job_id: 'job-failing',
              job_type: 'url_inspection_single',
              generation: 1,
              payload: { page_id: targetPageId }
            };
          }
          if (callIndex === 2) {
            return {
              claimed: true,
              job_id: 'job-succeeding',
              job_type: 'url_inspection_single',
              generation: 1,
              payload: { page_id: targetPageId }
            };
          }
          return { claimed: false };
        }
        if (name === 'complete_sync_job') {
          completedStatuses.push({ id: params.p_job_id, status: params.p_status });
          return { success: true };
        }
        return {};
      }
    };

    let fetchCount = 0;
    setCustomUrlInspectionFetcher(async () => {
      fetchCount++;
      if (fetchCount === 1) {
        throw new Error('Upstream error on first job');
      }
      return {
        inspectionResult: { indexStatusResult: { verdict: 'PASS' } }
      };
    });

    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 5,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.equal(res.jobsProcessed, 2);
    assert.equal(res.successfulJobs, 1);
    assert.equal(res.failedJobs, 1);
    assert.deepEqual(completedStatuses, [
      { id: 'job-failing', status: 'failed' },
      { id: 'job-succeeding', status: 'completed' }
    ]);
  });

  // 9. Fatal database/configuration failure exits non-zero
  test('Configuration Error: missing Supabase credentials exits with exitCode 1', async () => {
    const savedUrl = process.env.SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const res = await runInspectionWorker();
      assert.equal(res.exitCode, 1);
      assert.equal(res.success, false);
      assert.match(res.error, /Missing SUPABASE_URL/);
    } finally {
      if (savedUrl) process.env.SUPABASE_URL = savedUrl;
      if (savedKey) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    }
  });

  test('Fatal RPC Error: unhandled database error during claimSyncJob exits with exitCode 1', async () => {
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name) => {
        if (name === 'claim_sync_job') {
          throw new Error('FATAL: Database connection terminated abruptly');
        }
        return {};
      }
    };

    const res = await runInspectionWorker({ db: mockDb });

    assert.equal(res.exitCode, 1);
    assert.equal(res.success, false);
    assert.match(res.error, /Database connection terminated/);
  });

  // 11. Lease and generation information passed through unchanged
  test('Generation Fencing: passes leaseAttemptId and generation through to completeSyncJob unchanged', async () => {
    let completedLeaseAttemptId = null;
    let completedGeneration = null;

    const testGeneration = 42;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'claim_sync_job') {
          if (!completedGeneration) {
            return {
              claimed: true,
              job_id: 'job-fencing-test',
              job_type: 'url_inspection_single',
              generation: testGeneration,
              payload: { page_id: targetPageId }
            };
          }
          return { claimed: false };
        }
        if (name === 'complete_sync_job') {
          completedLeaseAttemptId = params.p_lease_attempt_id;
          completedGeneration = params.p_expected_generation;
          return { success: true };
        }
        return {};
      }
    };

    setCustomUrlInspectionFetcher(async () => ({
      inspectionResult: { indexStatusResult: { verdict: 'PASS' } }
    }));

    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 1,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.equal(completedGeneration, testGeneration);
    assert.ok(typeof completedLeaseAttemptId === 'string' && completedLeaseAttemptId.length === 36);
  });

  // 12. No automatic bulk job creation when queue is empty
  test('Queue Idempotency: never automatically enqueues jobs when queue is empty', async () => {
    let createJobCalled = false;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name) => {
        if (name === 'create_sync_job') {
          createJobCalled = true;
          return 'stray-job-id';
        }
        return { claimed: false };
      }
    };

    const res = await runInspectionWorker({
      db: mockDb,
      maxJobs: 5,
      pacingDelayMs: 0
    });

    assert.equal(res.exitCode, 0);
    assert.equal(createJobCalled, false, 'Dedicated inspection worker must never auto-create jobs when idle');
  });
});
