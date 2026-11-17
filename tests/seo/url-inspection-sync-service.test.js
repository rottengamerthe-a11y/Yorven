import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createSyncJob,
  claimSyncJob,
  completeSyncJob,
  insertInspectionRecord,
  executeUrlInspectionSingleWorkload,
  executeUrlInspectionAllWorkload,
  executeClaimedSyncWorkload
} from '../../api/seo/_sync_service.js';
import {
  setCustomUrlInspectionFetcher
} from '../../api/seo/_url_inspection_adapter.js';

describe('URL Inspection Sync Service Integration', () => {
  let originalFetch;
  let mockPages;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    setCustomUrlInspectionFetcher(null);

    mockPages = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        path: '/',
        title: 'Home',
        canonical_url: 'https://yorven.in',
        is_indexed: true,
        last_crawled_at: '2026-11-01T00:00:00Z'
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        path: '/work',
        title: 'Work',
        canonical_url: 'https://yorven.in/work',
        is_indexed: true,
        last_crawled_at: '2026-11-01T00:00:00Z'
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        path: '/about',
        title: 'About',
        canonical_url: null,
        is_indexed: true,
        last_crawled_at: '2026-11-01T00:00:00Z'
      }
    ];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setCustomUrlInspectionFetcher(null);
  });

  // --------------------------------------------------------------------------
  // 1. RPC FORWARDING: createSyncJob & claimSyncJob
  // --------------------------------------------------------------------------

  test('createSyncJob: correctly passes p_job_type, p_max_retries, and p_payload to RPC', async () => {
    let capturedName = null;
    let capturedParams = null;

    const mockDb = {
      callAuthUtilRpc: async (name, params) => {
        capturedName = name;
        capturedParams = params;
        return 'mock-job-uuid-123';
      }
    };

    const targetPageId = '11111111-1111-4111-8111-111111111111';
    const payload = { page_id: targetPageId };

    const jobId = await createSyncJob(mockDb, 'url_inspection_single', 5, payload);

    assert.equal(jobId, 'mock-job-uuid-123');
    assert.equal(capturedName, 'create_sync_job');
    assert.equal(capturedParams.p_job_type, 'url_inspection_single');
    assert.equal(capturedParams.p_max_retries, 5);
    assert.deepEqual(capturedParams.p_payload, payload);
  });

  test('createSyncJob: defaults to full_resync, 3 retries, and empty payload when omitted', async () => {
    let capturedParams = null;

    const mockDb = {
      callAuthUtilRpc: async (name, params) => {
        capturedParams = params;
        return 'default-job-uuid';
      }
    };

    await createSyncJob(mockDb);

    assert.equal(capturedParams.p_job_type, 'full_resync');
    assert.equal(capturedParams.p_max_retries, 3);
    assert.deepEqual(capturedParams.p_payload, {});
  });

  test('claimSyncJob: passes p_worker_id, leaseAttemptId, duration, and optional p_job_type_filter', async () => {
    let capturedParams = null;

    const mockDb = {
      callAuthUtilRpc: async (name, params) => {
        capturedParams = params;
        return { claimed: true, job_id: 'job-123' };
      }
    };

    const attemptId = crypto.randomUUID();
    await claimSyncJob(mockDb, 'worker-actions', attemptId, 120000, 'url_inspection_all');

    assert.equal(capturedParams.p_worker_id, 'worker-actions');
    assert.equal(capturedParams.p_lease_attempt_id, attemptId);
    assert.equal(capturedParams.p_lease_duration_ms, 120000);
    assert.equal(capturedParams.p_job_type_filter, 'url_inspection_all');
  });

  test('claimSyncJob: omits p_job_type_filter when not provided', async () => {
    let capturedParams = null;

    const mockDb = {
      callAuthUtilRpc: async (name, params) => {
        capturedParams = params;
        return { claimed: false };
      }
    };

    await claimSyncJob(mockDb, 'worker-cron', 'lease-1');
    assert.equal('p_job_type_filter' in capturedParams, false);
  });

  // --------------------------------------------------------------------------
  // 2. INSPECTION PERSISTENCE: insertInspectionRecord
  // --------------------------------------------------------------------------

  test('insertInspectionRecord: persists success attempt with verdict and null error_code', async () => {
    let insertedBody = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({ apikey: 'mock-key' })
    };

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_url_inspections')) {
        insertedBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          json: async () => [{ id: 'inspection-uuid-1', ...insertedBody }]
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const res = await insertInspectionRecord(mockDb, {
      page_id: 'page-1',
      job_id: 'job-1',
      inspection_url: 'https://yorven.in/work',
      attempt_status: 'success',
      verdict: 'PASS',
      coverage_state: 'Submitted and indexed',
      raw_response: { test: true }
    });

    assert.equal(insertedBody.page_id, 'page-1');
    assert.equal(insertedBody.job_id, 'job-1');
    assert.equal(insertedBody.attempt_status, 'success');
    assert.equal(insertedBody.verdict, 'PASS');
    assert.equal(insertedBody.error_code, null);
    assert.equal(insertedBody.coverage_state, 'Submitted and indexed');
    assert.equal(res.id, 'inspection-uuid-1');
  });

  test('insertInspectionRecord: persists failed attempt with error_code and null verdict', async () => {
    let insertedBody = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({ apikey: 'mock-key' })
    };

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_url_inspections')) {
        insertedBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          json: async () => [{ id: 'inspection-uuid-2', ...insertedBody }]
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    await insertInspectionRecord(mockDb, {
      page_id: 'page-1',
      job_id: 'job-1',
      inspection_url: 'https://yorven.in/work',
      attempt_status: 'failed',
      error_code: 'HTTP_429_QUOTA',
      error_message: 'Quota exceeded',
      raw_response: {}
    });

    assert.equal(insertedBody.attempt_status, 'failed');
    assert.equal(insertedBody.verdict, null);
    assert.equal(insertedBody.error_code, 'HTTP_429_QUOTA');
    assert.equal(insertedBody.error_message, 'Quota exceeded');
  });

  // --------------------------------------------------------------------------
  // 3. SINGLE ROUTE WORKLOAD: url_inspection_single
  // --------------------------------------------------------------------------

  test('url_inspection_single: successful inspection resolves canonical URL from DB and completes job', async () => {
    let completedStatus = null;
    let persistedRow = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'complete_sync_job') {
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
          indexStatusResult: {
            verdict: 'PASS',
            coverageState: 'Indexed',
            googleCanonical: 'https://yorven.in/work'
          }
        }
      };
    });

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      if (url.includes('/rest/v1/seo_url_inspections')) {
        persistedRow = JSON.parse(options.body);
        return { ok: true, status: 201, json: async () => [{ id: 'ins-1', ...persistedRow }] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const targetPageId = '22222222-2222-4222-8222-222222222222';
    const result = await executeUrlInspectionSingleWorkload({
      db: mockDb,
      jobId: 'job-single-1',
      generation: 2,
      leaseAttemptId: 'lease-single-1',
      workerId: 'worker-test',
      payload: { page_id: targetPageId }
    });

    assert.equal(result.success, true);
    assert.equal(completedStatus, 'completed');
    assert.equal(persistedRow.page_id, targetPageId);
    assert.equal(persistedRow.inspection_url, 'https://yorven.in/work');
    assert.equal(persistedRow.verdict, 'PASS');
    assert.equal(persistedRow.error_code, null);
  });

  test('url_inspection_single: failed inspection persists error attempt and marks job failed', async () => {
    let completedStatus = null;
    let completedError = null;
    let persistedRow = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'complete_sync_job') {
          completedStatus = params.p_status;
          completedError = params.p_error_message;
          return { success: true };
        }
        return {};
      }
    };

    setCustomUrlInspectionFetcher(async () => {
      const err = new Error('Rate limit exceeded');
      err.status = 429;
      throw err;
    });

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      if (url.includes('/rest/v1/seo_url_inspections')) {
        persistedRow = JSON.parse(options.body);
        return { ok: true, status: 201, json: async () => [{ id: 'ins-failed', ...persistedRow }] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const targetPageId = '11111111-1111-4111-8111-111111111111';
    const result = await executeUrlInspectionSingleWorkload({
      db: mockDb,
      jobId: 'job-single-err',
      generation: 1,
      leaseAttemptId: 'lease-single-err',
      workerId: 'worker-test',
      payload: { page_id: targetPageId }
    });

    assert.equal(result.success, false);
    assert.equal(completedStatus, 'failed');
    assert.match(completedError, /Rate limit exceeded/);
    assert.equal(persistedRow.page_id, targetPageId);
    assert.equal(persistedRow.attempt_status, 'failed');
    assert.equal(persistedRow.error_code, 'HTTP_429_QUOTA');
    assert.equal(persistedRow.verdict, null);
  });

  test('url_inspection_single: fails cleanly if page_id is missing or invalid UUID', async () => {
    let completedStatus = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        completedStatus = params.p_status;
        return {};
      }
    };

    const result = await executeUrlInspectionSingleWorkload({
      db: mockDb,
      jobId: 'job-invalid-payload',
      generation: 1,
      leaseAttemptId: 'lease-1',
      workerId: 'worker-test',
      payload: { page_id: 'not-a-uuid' }
    });

    assert.equal(result.success, false);
    assert.equal(completedStatus, 'failed');
    assert.match(result.error, /INVALID_SINGLE_ROUTE_PAYLOAD/);
  });

  test('url_inspection_single: fails cleanly if page_id is not in monitored registry', async () => {
    let completedStatus = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        completedStatus = params.p_status;
        return {};
      }
    };

    globalThis.fetch = async (url) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const unknownPageId = '99999999-9999-4999-8999-999999999999';
    const result = await executeUrlInspectionSingleWorkload({
      db: mockDb,
      jobId: 'job-unknown-page',
      generation: 1,
      leaseAttemptId: 'lease-1',
      workerId: 'worker-test',
      payload: { page_id: unknownPageId }
    });

    assert.equal(result.success, false);
    assert.equal(completedStatus, 'failed');
    assert.match(result.error, /PAGE_NOT_FOUND/);
  });

  // --------------------------------------------------------------------------
  // 4. BULK ROUTE WORKLOAD: url_inspection_all
  // --------------------------------------------------------------------------

  test('url_inspection_all: inspects all routes in immutable snapshot sequentially', async () => {
    let completedStatus = null;
    const inspectedUrls = [];
    const persistedRows = [];

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'complete_sync_job') {
          completedStatus = params.p_status;
          return { success: true };
        }
        return {};
      }
    };

    setCustomUrlInspectionFetcher(async ({ inspectionUrl }) => {
      inspectedUrls.push(inspectionUrl);
      return {
        inspectionResult: {
          indexStatusResult: {
            verdict: 'PASS',
            coverageState: 'Indexed'
          }
        }
      };
    });

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      if (url.includes('/rest/v1/seo_url_inspections')) {
        const body = JSON.parse(options.body);
        persistedRows.push(body);
        return { ok: true, status: 201, json: async () => [body] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const targetSnapshot = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    ];

    const result = await executeUrlInspectionAllWorkload({
      db: mockDb,
      jobId: 'job-bulk-1',
      generation: 1,
      leaseAttemptId: 'lease-bulk-1',
      workerId: 'worker-test',
      payload: { target_page_ids: targetSnapshot },
      pacingDelayMs: 0
    });

    assert.equal(result.success, true);
    assert.equal(completedStatus, 'completed');
    assert.equal(result.inspectedCount, 2);
    assert.equal(result.successCount, 2);
    assert.equal(result.failureCount, 0);
    assert.deepEqual(inspectedUrls, ['https://yorven.in', 'https://yorven.in/work']);
    assert.equal(persistedRows.length, 2);
  });

  test('url_inspection_all: pacing delay is applied between sequential route requests', async () => {
    const timestamps = [];

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async () => ({ success: true })
    };

    setCustomUrlInspectionFetcher(async () => {
      timestamps.push(Date.now());
      return {
        inspectionResult: {
          indexStatusResult: { verdict: 'PASS' }
        }
      };
    });

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      if (url.includes('/rest/v1/seo_url_inspections')) {
        return { ok: true, status: 201, json: async () => [JSON.parse(options.body)] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const targetSnapshot = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    ];

    await executeUrlInspectionAllWorkload({
      db: mockDb,
      jobId: 'job-pacing',
      generation: 1,
      leaseAttemptId: 'lease-pacing',
      workerId: 'worker-test',
      payload: { target_page_ids: targetSnapshot },
      pacingDelayMs: 30 // Fast test pacing
    });

    assert.equal(timestamps.length, 2);
    const diff = timestamps[1] - timestamps[0];
    assert.ok(diff >= 25, `Pacing delay should be at least 25ms, got ${diff}ms`);
  });

  test('url_inspection_all: HTTP 429 quota exhaustion immediately halts remaining requests and preserves earlier successes', async () => {
    let callCount = 0;
    const persistedRows = [];
    let completedStatus = null;
    let completedError = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'complete_sync_job') {
          completedStatus = params.p_status;
          completedError = params.p_error_message;
          return { success: true };
        }
        return {};
      }
    };

    setCustomUrlInspectionFetcher(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          inspectionResult: {
            indexStatusResult: { verdict: 'PASS' }
          }
        };
      }
      // Second call fails with 429
      const err = new Error('Quota exceeded');
      err.status = 429;
      throw err;
    });

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      if (url.includes('/rest/v1/seo_url_inspections')) {
        const body = JSON.parse(options.body);
        persistedRows.push(body);
        return { ok: true, status: 201, json: async () => [body] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const targetSnapshot = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333' // Third route must NOT be called
    ];

    const result = await executeUrlInspectionAllWorkload({
      db: mockDb,
      jobId: 'job-quota-halt',
      generation: 1,
      leaseAttemptId: 'lease-quota',
      workerId: 'worker-test',
      payload: { target_page_ids: targetSnapshot },
      pacingDelayMs: 0
    });

    assert.equal(result.success, false);
    assert.equal(result.quotaExhausted, true);
    assert.equal(completedStatus, 'failed');
    assert.match(completedError, /HTTP_429_QUOTA/);
    assert.equal(callCount, 2, 'Should halt after route 2; route 3 was never called');
    assert.equal(persistedRows.length, 2);
    assert.equal(persistedRows[0].attempt_status, 'success');
    assert.equal(persistedRows[0].verdict, 'PASS');
    assert.equal(persistedRows[1].attempt_status, 'failed');
    assert.equal(persistedRows[1].error_code, 'HTTP_429_QUOTA');
  });

  test('url_inspection_all: missing or deleted route in snapshot is handled cleanly without crashing', async () => {
    let callCount = 0;
    let completedStatus = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'complete_sync_job') {
          completedStatus = params.p_status;
          return { success: true };
        }
        return {};
      }
    };

    setCustomUrlInspectionFetcher(async () => {
      callCount++;
      return {
        inspectionResult: {
          indexStatusResult: { verdict: 'PASS' }
        }
      };
    });

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      if (url.includes('/rest/v1/seo_url_inspections')) {
        return { ok: true, status: 201, json: async () => [JSON.parse(options.body)] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const targetSnapshot = [
      '11111111-1111-4111-8111-111111111111',
      '99999999-9999-4999-8999-999999999999', // Missing ID
      '22222222-2222-4222-8222-222222222222'
    ];

    const result = await executeUrlInspectionAllWorkload({
      db: mockDb,
      jobId: 'job-deleted-route',
      generation: 1,
      leaseAttemptId: 'lease-del',
      workerId: 'worker-test',
      payload: { target_page_ids: targetSnapshot },
      pacingDelayMs: 0
    });

    assert.equal(result.success, false);
    assert.equal(completedStatus, 'failed');
    assert.equal(result.inspectedCount, 2);
    assert.equal(result.failureCount, 1);
    assert.equal(callCount, 2);
  });

  // --------------------------------------------------------------------------
  // 5. WORKLOAD ROUTING & GENERATION FENCING
  // --------------------------------------------------------------------------

  test('executeClaimedSyncWorkload: dispatches url_inspection_single with generation fencing parameters', async () => {
    let completedGeneration = null;
    let completedLeaseAttemptId = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'complete_sync_job') {
          completedGeneration = params.p_expected_generation;
          completedLeaseAttemptId = params.p_lease_attempt_id;
          return { success: true };
        }
        return {};
      }
    };

    setCustomUrlInspectionFetcher(async () => ({
      inspectionResult: { indexStatusResult: { verdict: 'PASS' } }
    }));

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      if (url.includes('/rest/v1/seo_url_inspections')) {
        return { ok: true, status: 201, json: async () => [JSON.parse(options.body)] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const targetPageId = '11111111-1111-4111-8111-111111111111';
    const result = await executeClaimedSyncWorkload({
      db: mockDb,
      jobId: 'job-fencing-1',
      jobType: 'url_inspection_single',
      generation: 7,
      leaseAttemptId: 'attempt-fencing-uuid',
      workerId: 'worker-fencing',
      payload: { page_id: targetPageId }
    });

    assert.equal(result.success, true);
    assert.equal(completedGeneration, 7);
    assert.equal(completedLeaseAttemptId, 'attempt-fencing-uuid');
  });

  test('executeClaimedSyncWorkload: rejects unknown job type and completes job as failed', async () => {
    let completedStatus = null;
    let completedError = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'complete_sync_job') {
          completedStatus = params.p_status;
          completedError = params.p_error_message;
          return { success: true };
        }
        return {};
      }
    };

    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

    const result = await executeClaimedSyncWorkload({
      db: mockDb,
      jobId: 'job-unknown',
      jobType: 'invalid_unsupported_type',
      generation: 1,
      leaseAttemptId: 'lease-unsupported',
      workerId: 'worker-test'
    });

    assert.equal(result.success, false);
    assert.equal(completedStatus, 'failed');
    assert.match(completedError, /UNKNOWN_JOB_TYPE/);
  });

  test('executeClaimedSyncWorkload: fetches payload from DB if not passed directly for inspection job', async () => {
    const targetPageId = '22222222-2222-4222-8222-222222222222';
    let fetchedPayloadUrl = null;

    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async () => ({ success: true })
    };

    setCustomUrlInspectionFetcher(async () => ({
      inspectionResult: { indexStatusResult: { verdict: 'PASS' } }
    }));

    globalThis.fetch = async (url, options) => {
      if (url.includes('/rest/v1/seo_sync_jobs')) {
        fetchedPayloadUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => [{ payload: { page_id: targetPageId } }]
        };
      }
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      if (url.includes('/rest/v1/seo_url_inspections')) {
        return { ok: true, status: 201, json: async () => [JSON.parse(options.body)] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const result = await executeClaimedSyncWorkload({
      db: mockDb,
      jobId: 'job-fetch-payload',
      jobType: 'url_inspection_single',
      generation: 1,
      leaseAttemptId: 'lease-payload',
      workerId: 'worker-test'
      // payload omitted intentionally
    });

    assert.equal(result.success, true);
    assert.match(fetchedPayloadUrl, /id=eq\.job-fetch-payload/);
  });

  test('createSyncJob: propagates 409 conflict error when duplicate active job exists', async () => {
    const mockDb = {
      callAuthUtilRpc: async () => {
        const err = new Error('RPC create_sync_job failed with HTTP 409');
        err.status = 409;
        err.data = { message: 'duplicate key value violates unique constraint' };
        throw err;
      }
    };

    await assert.rejects(
      async () => {
        await createSyncJob(mockDb, 'url_inspection_all', 3, {});
      },
      (err) => {
        assert.equal(err.status, 409);
        assert.match(err.message, /HTTP 409/);
        return true;
      }
    );
  });

  test('executeClaimedSyncWorkload: dispatches full_resync without calling inspection adapter', async () => {
    let inspectionCalled = false;
    setCustomUrlInspectionFetcher(async () => {
      inspectionCalled = true;
      return {};
    });

    let completedStatus = null;
    const mockDb = {
      supabaseUrl: 'https://mock.supabase.co',
      getPostgrestHeaders: () => ({}),
      callAuthUtilRpc: async (name, params) => {
        if (name === 'complete_sync_job') {
          completedStatus = params.p_status;
          return { success: true };
        }
        return {};
      }
    };

    // Mock monitored pages and empty responses for GSC and GA4
    globalThis.fetch = async (url) => {
      if (url.includes('/rest/v1/seo_pages')) {
        return { ok: true, status: 200, json: async () => mockPages };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    // executeClaimedSyncWorkload with mock GSC & GA4 fetchers
    const result = await executeClaimedSyncWorkload({
      db: mockDb,
      jobId: 'job-full-resync',
      jobType: 'full_resync',
      generation: 1,
      leaseAttemptId: 'lease-resync',
      workerId: 'worker-test',
      profile: 'manual'
    });

    assert.equal(inspectionCalled, false, 'URL inspection adapter must not be called during full_resync');
    assert.equal(result.jobType, 'full_resync');
  });
});
