import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../../src/db/client.js';
import { DatabaseAdapter } from '../../src/db/adapter.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const WORKER_ID = `test-worker-${randomUUID().slice(0, 8)}`;

test('Adapter Integration: end-to-end RPC lifecycle and operation replay', async () => {
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const adapter = new DatabaseAdapter(client, WORKER_ID);

  // 1. Validate crawl URL
  const valRes = await adapter.validateCrawlUrl('https://yorven.in/about#fragment');
  assert.equal(valRes.is_valid, true);
  assert.equal(valRes.normalized_url, 'https://yorven.in/about');

  // 2. Start crawl session
  const session = await adapter.startCrawlSession('https://yorven.in', 2, 20);
  assert.ok(session.session_id);
  assert.equal(session.status, 'pending');
  const sessionId = session.session_id;

  // 3. Acquire session lease
  const lease = await adapter.acquireSessionLease(sessionId, 60);
  assert.equal(lease.acquired, true);
  assert.ok(lease.lease_token);
  assert.equal(lease.generation, 1);
  const leaseToken = lease.lease_token;
  const generation = lease.generation;

  // 4. Claim first batch (Robots-first barrier: must return robots.txt only)
  const batch1 = await adapter.claimCrawlBatch(sessionId, leaseToken, generation, 10);
  assert.equal(batch1.length, 1);
  assert.equal(batch1[0].resource_type, 'robots');
  assert.equal(batch1[0].url, 'https://yorven.in/robots.txt');
  const robotsItem = batch1[0];

  // 5. Complete robots item with discovered sitemap
  const sitemapUrl = 'https://yorven.in/sitemap.xml';
  const robotsOpId = randomUUID();
  const compRobots = await adapter.completeCrawlItem({
    sessionId,
    queueId: robotsItem.queue_id,
    leaseToken,
    generation,
    operationId: robotsOpId,
    url: robotsItem.url,
    resourceType: 'robots',
    fetchStatus: 'fetched',
    parseStatus: 'parsed',
    httpStatus: 200,
    discoveredUrls: [
      { url: sitemapUrl, resource_type: 'sitemap', priority: 8, depth: 1 }
    ]
  });
  assert.equal(compRobots.success, true);
  assert.equal(compRobots.discovered_urls_enqueued, 1);

  // 6. Test operation replay idempotency on robots completion
  const replayRobots = await adapter.completeCrawlItem({
    sessionId,
    queueId: robotsItem.queue_id,
    leaseToken,
    generation,
    operationId: robotsOpId, // identical operation ID
    url: robotsItem.url,
    resourceType: 'robots',
    fetchStatus: 'fetched',
    parseStatus: 'parsed',
    httpStatus: 200,
    discoveredUrls: [
      { url: sitemapUrl, resource_type: 'sitemap', priority: 8, depth: 1 }
    ]
  });
  assert.equal(replayRobots.success, true);
  assert.equal(replayRobots.discovered_urls_enqueued, 1);

  // 7. Test altered payload replay rejection
  await assert.rejects(
    () => adapter.completeCrawlItem({
      sessionId,
      queueId: robotsItem.queue_id,
      leaseToken,
      generation,
      operationId: robotsOpId, // identical ID but altered payload
      url: robotsItem.url,
      resourceType: 'robots',
      fetchStatus: 'fetched',
      parseStatus: 'parsed',
      httpStatus: 404 // altered http_status
    }),
    /OPERATION_ID_CONFLICT/
  );

  // 8. Claim second batch (Now that robots is completed, sitemap and seed page can be claimed)
  const batch2 = await adapter.claimCrawlBatch(sessionId, leaseToken, generation, 10);
  assert.ok(batch2.length >= 1);

  // Find sitemap item and complete it
  const sitemapItem = batch2.find(i => i.resource_type === 'sitemap') || batch2[0];
  const pageUrl = 'https://yorven.in/services';
  await adapter.completeCrawlItem({
    sessionId,
    queueId: sitemapItem.queue_id,
    leaseToken,
    generation,
    url: sitemapItem.url,
    resourceType: sitemapItem.resource_type,
    fetchStatus: 'fetched',
    parseStatus: 'parsed',
    httpStatus: 200,
    discoveredUrls: [
      { url: pageUrl, resource_type: 'page', priority: 5, depth: 1 }
    ]
  });

  // Also complete any other items claimed in batch2 (e.g. the seed URL https://yorven.in/)
  for (const item of batch2) {
    if (item.queue_id !== sitemapItem.queue_id) {
      await adapter.completeCrawlItem({
        sessionId,
        queueId: item.queue_id,
        leaseToken,
        generation,
        url: item.url,
        resourceType: item.resource_type,
        fetchStatus: 'fetched',
        parseStatus: 'parsed',
        httpStatus: 200
      });
    }
  }

  // 10. Claim third batch containing the page item
  const batch3 = await adapter.claimCrawlBatch(sessionId, leaseToken, generation, 10);
  const pageItem = batch3.find(i => i.url === pageUrl) || batch3[0];

  // 11. Test retry_crawl_item on page item
  const retryOpId = randomUUID();
  const retryRes = await adapter.retryCrawlItem({
    sessionId,
    queueId: pageItem.queue_id,
    leaseToken,
    generation,
    operationId: retryOpId,
    errorMessage: 'Simulated 503 Service Unavailable',
    retryDelaySeconds: 5
  });
  assert.equal(retryRes.success, true);
  assert.equal(retryRes.new_retry_count, pageItem.retry_count + 1);

  // Test retry replay idempotency
  const retryReplay = await adapter.retryCrawlItem({
    sessionId,
    queueId: pageItem.queue_id,
    leaseToken,
    generation,
    operationId: retryOpId,
    errorMessage: 'Simulated 503 Service Unavailable',
    retryDelaySeconds: 5
  });
  assert.equal(retryReplay.success, true);
  assert.equal(retryReplay.new_retry_count, pageItem.retry_count + 1);

  // 12. Re-claim page item after retry
  const batch4 = await adapter.claimCrawlBatch(sessionId, leaseToken, generation, 10);
  const reclaimedPage = batch4.find(i => i.queue_id === pageItem.queue_id) || batch4[0];

  // 13. Complete page item with issues and fingerprint
  const pageOpId = randomUUID();
  const compPage = await adapter.completeCrawlItem({
    sessionId,
    queueId: reclaimedPage.queue_id,
    leaseToken,
    generation,
    operationId: pageOpId,
    url: reclaimedPage.url,
    resourceType: reclaimedPage.resource_type,
    fetchStatus: 'fetched',
    parseStatus: 'parsed',
    httpStatus: 200,
    loadTimeMs: 120,
    title: 'Services Page',
    h1: 'Our Services',
    canonicalUrl: reclaimedPage.url,
    contentFingerprint: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    issues: [
      {
        rule_code: 'WARN_TITLE_TOO_SHORT',
        severity: 'warning',
        target_resource: 'html_document',
        message: 'Title is too short'
      }
    ]
  });
  assert.equal(compPage.success, true);
  assert.equal(compPage.issues_logged, 1);

  // Complete any remaining items in queue so session can finalize
  const remaining = await adapter.claimCrawlBatch(sessionId, leaseToken, generation, 10);
  for (const item of remaining) {
    await adapter.completeCrawlItem({
      sessionId,
      queueId: item.queue_id,
      leaseToken,
      generation,
      url: item.url,
      resourceType: item.resource_type,
      fetchStatus: 'fetched',
      parseStatus: 'parsed',
      httpStatus: 200
    });
  }

  // 14. Finalize session
  const finalRes = await adapter.finalizeCrawlSession(sessionId, leaseToken);
  assert.equal(finalRes.final_status, 'completed');
  assert.equal(finalRes.remaining_pending, 0);
});
