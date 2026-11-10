import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../../src/db/client.js';
import { DatabaseAdapter } from '../../src/db/adapter.js';
import { SessionLifecycleManager } from '../../src/crawler/lifecycle.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

test('Lifecycle Integration: heartbeat lease renewal', async () => {
  const workerId = `worker-heartbeat-${randomUUID().slice(0, 8)}`;
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const adapter = new DatabaseAdapter(client, workerId);

  const session = await adapter.startCrawlSession('https://yorven.in', 1, 5);
  const sessionId = session.session_id;

  // Use short lease duration (10 seconds) so heartbeat fires at 5 seconds
  const lifecycle = new SessionLifecycleManager(adapter, { leaseDurationSeconds: 10 });
  await lifecycle.acquireOrRecover(sessionId);

  const initialToken = lifecycle.leaseToken;
  const initialGen = lifecycle.generation;
  assert.ok(initialToken);
  assert.equal(initialGen, 1);

  // Wait 6 seconds for heartbeat timer to fire
  await new Promise(r => setTimeout(r, 6000));

  assert.notEqual(lifecycle.leaseToken, initialToken, 'Heartbeat must rotate lease_token on renewal');
  assert.equal(lifecycle.generation, initialGen, 'Heartbeat renewal must keep generation unchanged');

  lifecycle.dispose();
});

test('Lifecycle Integration: crash recovery transition', async () => {
  const worker1 = `worker-crashed-${randomUUID().slice(0, 8)}`;
  const worker2 = `worker-recovery-${randomUUID().slice(0, 8)}`;
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const adapter1 = new DatabaseAdapter(client, worker1);
  const adapter2 = new DatabaseAdapter(client, worker2);

  const session = await adapter1.startCrawlSession('https://yorven.in', 1, 5);
  const sessionId = session.session_id;

  // Worker 1 acquires 10s lease
  const lease1 = await adapter1.acquireSessionLease(sessionId, 10);
  assert.equal(lease1.acquired, true);
  assert.equal(lease1.generation, 1);

  // Claim batch with worker 1 so an item enters 'processing'
  const batch = await adapter1.claimCrawlBatch(sessionId, lease1.lease_token, lease1.generation, 1);
  assert.equal(batch.length, 1);

  // Worker 2 attempts immediate acquisition: must be rejected with LEASE_ALREADY_HELD
  const premature = await adapter2.acquireSessionLease(sessionId, 10);
  assert.equal(premature.acquired, false);
  assert.equal(premature.rejection_reason, 'LEASE_ALREADY_HELD');

  // Wait 11 seconds for Worker 1's lease to expire
  await new Promise(r => setTimeout(r, 11000));

  // Worker 2 attempts acquisition on expired lease: must return EXPIRED_LEASE_REQUIRES_RECOVERY
  const expiredRes = await adapter2.acquireSessionLease(sessionId, 10);
  assert.equal(expiredRes.acquired, false);
  assert.equal(expiredRes.rejection_reason, 'EXPIRED_LEASE_REQUIRES_RECOVERY');

  // Worker 2 recovers crashed session
  const recoverRes = await adapter2.recoverCrashedSession(sessionId, 30);
  assert.equal(recoverRes.recovered, true);
  assert.equal(recoverRes.generation, 2);
  assert.equal(recoverRes.crash_count, 1);
  assert.equal(recoverRes.reclaimed_queue_items, 1);
});
