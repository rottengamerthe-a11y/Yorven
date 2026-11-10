import test from 'node:test';
import assert from 'node:assert/strict';
import { CrawlOrchestrator } from '../../src/crawler/crawler.js';

test('Crawler: ERR_REDIRECT_CHAIN_LOOP emits Rule 12 and does not misclassify as transport failure', async () => {
  const completedCalls = [];
  const retryCalls = [];

  const mockDb = {
    completeCrawlItem: async (params) => {
      completedCalls.push(params);
      return { success: true };
    },
    retryCrawlItem: async (params) => {
      retryCalls.push(params);
      return { success: true };
    }
  };

  const mockLifecycle = {
    sessionId: 'session-test-uuid',
    leaseToken: 'lease-test-uuid',
    generation: 1
  };

  const redirectError = new Error('ERR_REDIRECT_CHAIN_LOOP: Circular redirect loop detected');
  redirectError.code = 'ERR_REDIRECT_CHAIN_LOOP';
  redirectError.redirectChain = [
    { from: 'https://yorven.in/page-a', to: 'https://yorven.in/page-b', status: 301 },
    { from: 'https://yorven.in/page-b', to: 'https://yorven.in/page-a', status: 302 }
  ];

  const mockFetcher = {
    fetch: async () => {
      throw redirectError;
    }
  };

  const orchestrator = new CrawlOrchestrator(mockDb, mockLifecycle, {
    fetcher: mockFetcher,
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });

  const queueItem = {
    queue_id: 'queue-test-uuid',
    url: 'https://yorven.in/page-a',
    resource_type: 'page',
    retry_count: 0
  };

  await orchestrator.processPageItem(queueItem);

  // Assert no retries were triggered (redirect loop is deterministic)
  assert.equal(retryCalls.length, 0);

  // Assert completeCrawlItem was called exactly once
  assert.equal(completedCalls.length, 1);
  const call = completedCalls[0];
  assert.equal(call.fetchStatus, 'fetch_failed');
  assert.equal(call.parseStatus, 'not_applicable');
  assert.equal(call.httpStatus, 0);
  assert.deepEqual(call.redirectChain, redirectError.redirectChain);

  // Assert rule code is ERR_REDIRECT_CHAIN_LOOP (not ERR_TRANSPORT_FAILURE)
  assert.equal(call.issues.length, 1);
  const issue = call.issues[0];
  assert.equal(issue.rule_code, 'ERR_REDIRECT_CHAIN_LOOP');
  assert.equal(issue.severity, 'critical');
  assert.equal(issue.target_resource, 'redirect_hop');
  assert.ok(issue.message.includes('Circular redirect loop detected'));
});

test('Crawler: HTTP 206 Partial Content emits WARN_HTTP_PARTIAL_CONTENT and bypasses HTML parsing', async () => {
  const completedCalls = [];

  const mockDb = {
    completeCrawlItem: async (params) => {
      completedCalls.push(params);
      return { success: true };
    }
  };

  const mockLifecycle = {
    sessionId: 'session-test-uuid',
    leaseToken: 'lease-test-uuid',
    generation: 1
  };

  // Mock server returning HTTP 206 with incomplete HTML fragment
  const mockFetcher = {
    fetch: async () => ({
      status: 206,
      body: '<html><body><p>Partial chunk without title or h1',
      headers: new Headers({ 'Content-Type': 'text/html' }),
      loadTimeMs: 42,
      redirectChain: [],
      finalUrl: 'https://yorven.in/partial'
    })
  };

  const orchestrator = new CrawlOrchestrator(mockDb, mockLifecycle, {
    fetcher: mockFetcher,
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });

  const queueItem = {
    queue_id: 'queue-test-uuid-206',
    url: 'https://yorven.in/partial',
    resource_type: 'page',
    retry_count: 0
  };

  await orchestrator.processPageItem(queueItem);

  // Assert completeCrawlItem called
  assert.equal(completedCalls.length, 1);
  const call = completedCalls[0];

  assert.equal(call.fetchStatus, 'fetched');
  assert.equal(call.parseStatus, 'not_applicable');
  assert.equal(call.httpStatus, 206);
  assert.equal(call.loadTimeMs, 42);

  // HTML metadata fingerprint and rules must NOT have run (no ERR_TITLE_MISSING or ERR_H1_MISSING)
  assert.equal(call.contentFingerprint, undefined);
  assert.equal(call.title, undefined);
  assert.equal(call.h1, undefined);

  // Issues must contain strictly WARN_HTTP_PARTIAL_CONTENT
  assert.equal(call.issues.length, 1);
  const issue = call.issues[0];
  assert.equal(issue.rule_code, 'WARN_HTTP_PARTIAL_CONTENT');
  assert.equal(issue.severity, 'warning');
  assert.equal(issue.target_resource, 'page');
});

test('Crawler: Sitemap ERR_REDIRECT_CHAIN_LOOP classifies as Rule 12', async () => {
  const completedCalls = [];

  const mockDb = {
    completeCrawlItem: async (params) => {
      completedCalls.push(params);
      return { success: true };
    }
  };

  const mockLifecycle = {
    sessionId: 'session-test-uuid',
    leaseToken: 'lease-test-uuid',
    generation: 1
  };

  const loopErr = new Error('ERR_REDIRECT_CHAIN_LOOP: Redirect hops exceeded maximum (5)');
  loopErr.code = 'ERR_REDIRECT_CHAIN_LOOP';
  loopErr.redirectChain = [
    { from: 'https://yorven.in/sitemap.xml', to: 'https://yorven.in/sitemap-1.xml', status: 301 }
  ];

  const mockFetcher = {
    fetch: async () => {
      throw loopErr;
    }
  };

  const orchestrator = new CrawlOrchestrator(mockDb, mockLifecycle, {
    fetcher: mockFetcher,
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });

  const queueItem = {
    queue_id: 'queue-test-sitemap-loop',
    url: 'https://yorven.in/sitemap.xml',
    resource_type: 'sitemap',
    retry_count: 0
  };

  await orchestrator.processSitemapItem(queueItem);

  assert.equal(completedCalls.length, 1);
  const call = completedCalls[0];
  assert.equal(call.fetchStatus, 'fetch_failed');
  assert.equal(call.parseStatus, 'not_applicable');
  assert.equal(call.issues.length, 1);
  assert.equal(call.issues[0].rule_code, 'ERR_REDIRECT_CHAIN_LOOP');
  assert.equal(call.issues[0].severity, 'critical');
});

test('Crawler: Rule 17 ERR_CANONICAL_TARGET_BLOCKED is emitted and attributed to source page', async () => {
  const { RobotsManager } = await import('../../src/parser/robots.js');
  const completedCalls = [];

  const mockDb = {
    completeCrawlItem: async (params) => {
      completedCalls.push(params);
      return { success: true };
    }
  };

  const mockLifecycle = {
    sessionId: 'session-test-uuid',
    leaseToken: 'lease-test-uuid',
    generation: 1
  };

  // Source page is https://yorven.in/pricing, which declares canonical to https://yorven.in/admin
  const htmlBody = `
<!DOCTYPE html>
<html>
  <head>
    <title>Pricing Plans and Options</title>
    <meta name="description" content="Explore Yorven pricing plans for small business and teams worldwide.">
    <link rel="canonical" href="https://yorven.in/admin">
  </head>
  <body>
    <h1>Transparent Pricing</h1>
    <p>Detailed breakdown of features and pricing options for customers.</p>
  </body>
</html>
`;

  const mockFetcher = {
    fetch: async () => ({
      status: 200,
      body: htmlBody,
      headers: new Headers({ 'Content-Type': 'text/html' }),
      loadTimeMs: 35,
      redirectChain: [],
      finalUrl: 'https://yorven.in/pricing'
    })
  };

  const orchestrator = new CrawlOrchestrator(mockDb, mockLifecycle, {
    fetcher: mockFetcher,
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });

  // Robots policy disallows /admin
  orchestrator.robotsManager = new RobotsManager('https://yorven.in/robots.txt', 'User-agent: *\nDisallow: /admin\n');

  const queueItem = {
    queue_id: 'queue-test-pricing',
    url: 'https://yorven.in/pricing',
    resource_type: 'page',
    retry_count: 0
  };

  await orchestrator.processPageItem(queueItem);

  assert.equal(completedCalls.length, 1);
  const call = completedCalls[0];

  // Verified attributed to the source page
  assert.equal(call.url, 'https://yorven.in/pricing');
  assert.equal(call.fetchStatus, 'fetched');
  assert.equal(call.parseStatus, 'parsed');

  // Rule 17 issue must be present
  const rule17 = call.issues.find(i => i.rule_code === 'ERR_CANONICAL_TARGET_BLOCKED');
  assert.ok(rule17, 'ERR_CANONICAL_TARGET_BLOCKED must be present in issues');
  assert.equal(rule17.severity, 'critical');
  assert.equal(rule17.target_resource, 'html_document');
  assert.ok(rule17.message.includes('https://yorven.in/admin'));
  assert.equal(rule17.context_data.canonicalUrl, 'https://yorven.in/admin');
});
