import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../../src/db/client.js';
import { DatabaseAdapter } from '../../src/db/adapter.js';
import { SessionLifecycleManager } from '../../src/crawler/lifecycle.js';
import { CrawlOrchestrator } from '../../src/crawler/crawler.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Creates a real HTTP server on 127.0.0.1 and a fetcher that routes https://yorven.in
 * requests over loopback HTTP sockets to that server, exercising real TCP network streams.
 */
function createTestServerAndFetcher(routeHandler) {
  const server = http.createServer(routeHandler);
  let port = null;

  const start = async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  };

  const stop = () => new Promise(r => server.close(r));

  const fetcher = {
    fetch: async (url) => {
      const parsed = new URL(url);
      const reqPath = `${parsed.pathname}${parsed.search}`;

      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: reqPath,
          method: 'GET',
          headers: {
            'User-Agent': 'YorvenSEO-AuditBot/1.0 (+https://yorven.in/robots.txt)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
            'Host': 'yorven.in'
          }
        }, (res) => {
          let body = '';
          const decoder = new TextDecoder('utf-8');
          res.on('data', chunk => { body += decoder.decode(chunk, { stream: true }); });
          res.on('end', () => {
            body += decoder.decode();
            resolve({
              status: res.statusCode,
              body,
              headers: new Headers(res.headers),
              loadTimeMs: 15,
              redirectChain: [],
              finalUrl: url
            });
          });
          res.on('error', reject);
        });

        req.on('error', reject);
        req.end();
      });
    }
  };

  return { start, stop, fetcher };
}

test('Orchestration E2E 1: Successful crawl of robots, sitemap, and multiple HTML pages with database verification', async () => {
  const { start, stop, fetcher } = createTestServerAndFetcher((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\nSitemap: https://yorven.in/sitemap.xml\n');
    } else if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://yorven.in/page-alpha</loc></url>
</urlset>`);
    } else if (req.url === '/' || req.url === '') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>Home Page Title Length 15</title></head><body><h1>Welcome</h1><a href="/page-beta">Beta</a></body></html>`);
    } else if (req.url === '/page-alpha') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>Alpha Page Title 15</title></head><body><h1>Alpha Header</h1><a href="/page-gamma">Gamma</a></body></html>`);
    } else if (req.url === '/page-beta') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>Beta Page Title 15</title></head><body><h1>Beta Header</h1></body></html>`);
    } else if (req.url === '/page-gamma') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>Gamma Page Title 15</title></head><body><h1>Gamma Header</h1></body></html>`);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await start();

  const workerId = `worker-e2e-success-${randomUUID().slice(0, 8)}`;
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const db = new DatabaseAdapter(client, workerId);
  const lifecycle = new SessionLifecycleManager(db, { leaseDurationSeconds: 30 });
  const orchestrator = new CrawlOrchestrator(db, lifecycle, { fetcher });

  try {
    const session = await db.startCrawlSession('https://yorven.in', 2, 20);
    const sessionId = session.session_id;

    await lifecycle.acquireOrRecover(sessionId);
    const result = await orchestrator.run();

    // 1. Verify returned result
    assert.ok(result);
    assert.equal(result.final_status, 'completed');
    assert.equal(result.remaining_pending, 0);

    // 2. Direct PostgreSQL table verification via Supabase client
    const { data: sessionRows } = await client
      .schema('public')
      .from('seo_crawl_sessions')
      .select('*')
      .eq('session_id', sessionId);
    assert.equal(sessionRows[0].status, 'completed');
    assert.ok(sessionRows[0].completed_at);
    assert.equal(sessionRows[0].lease_token, null); // Lease cleared on finalization

    // 3. Queue verification: 0 pending or processing items
    const { data: remainingQueue } = await client
      .schema('public')
      .from('seo_crawl_queue')
      .select('status')
      .eq('session_id', sessionId)
      .in('status', ['pending', 'processing']);
    assert.equal(remainingQueue.length, 0);

    // 4. Crawled pages verification: robots, sitemap, root, alpha, beta, gamma all crawled
    const { data: crawledPages } = await client
      .schema('public')
      .from('seo_crawled_pages')
      .select('url, resource_type, fetch_status, http_status')
      .eq('session_id', sessionId);
    assert.ok(crawledPages.length >= 5);
    const urls = crawledPages.map(p => p.url);
    assert.ok(urls.includes('https://yorven.in/robots.txt'));
    assert.ok(urls.includes('https://yorven.in/sitemap.xml'));
    assert.ok(urls.includes('https://yorven.in/'));
    assert.ok(urls.includes('https://yorven.in/page-alpha'));
  } finally {
    lifecycle.dispose();
    await stop();
  }
});

test('Orchestration E2E 2: Robots.txt failure fails closed and cancels session safely', async () => {
  const { start, stop, fetcher } = createTestServerAndFetcher((req, res) => {
    // Robots.txt returns server 500 error
    if (req.url === '/robots.txt') {
      res.writeHead(500);
      res.end('Internal Server Error');
    } else {
      res.writeHead(200);
      res.end('<html><head><title>Allowed Title</title></head><body><h1>Allowed</h1></body></html>');
    }
  });

  await start();

  const workerId = `worker-e2e-robots-fail-${randomUUID().slice(0, 8)}`;
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const db = new DatabaseAdapter(client, workerId);
  const lifecycle = new SessionLifecycleManager(db, { leaseDurationSeconds: 30 });
  const orchestrator = new CrawlOrchestrator(db, lifecycle, { fetcher });

  try {
    const session = await db.startCrawlSession('https://yorven.in', 2, 20);
    const sessionId = session.session_id;

    await lifecycle.acquireOrRecover(sessionId);
    const result = await orchestrator.run();

    // Must return cancelled status
    assert.ok(result);
    assert.equal(result.final_status, 'cancelled');

    // Verify in database: session status is cancelled
    const { data: sessionRows } = await client
      .schema('public')
      .from('seo_crawl_sessions')
      .select('status')
      .eq('session_id', sessionId);
    assert.equal(sessionRows[0].status, 'cancelled');

    // Verify robots item failed
    const { data: robotsQueue } = await client
      .schema('public')
      .from('seo_crawl_queue')
      .select('status, last_error')
      .eq('session_id', sessionId)
      .eq('resource_type', 'robots');
    assert.equal(robotsQueue[0].status, 'failed');

    // Verify remaining queue items (seed URL) were cancelled
    const { data: pendingQueue } = await client
      .schema('public')
      .from('seo_crawl_queue')
      .select('status')
      .eq('session_id', sessionId)
      .in('status', ['pending', 'processing']);
    assert.equal(pendingQueue.length, 0);

    // Verify NO pages were crawled
    const { data: crawledPages } = await client
      .schema('public')
      .from('seo_crawled_pages')
      .select('url')
      .eq('session_id', sessionId)
      .eq('resource_type', 'page');
    assert.equal(crawledPages.length, 0);
  } finally {
    lifecycle.dispose();
    await stop();
  }
});

test('Orchestration E2E 3: Transient fetch failure triggers retry and succeeds on next attempt', async () => {
  let rootAttempts = 0;
  const { start, stop, fetcher } = createTestServerAndFetcher((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\n');
    } else if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    } else if (req.url === '/' || req.url === '') {
      rootAttempts++;
      if (rootAttempts === 1) {
        // Attempt 1 fails with transient 503 error
        res.writeHead(503);
        res.end('Service Unavailable');
      } else {
        // Attempt 2 succeeds
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><head><title>Root Page Recovered 15</title></head><body><h1>Recovered</h1></body></html>');
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await start();

  const workerId = `worker-e2e-retry-${randomUUID().slice(0, 8)}`;
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const db = new DatabaseAdapter(client, workerId);
  const lifecycle = new SessionLifecycleManager(db, { leaseDurationSeconds: 30 });
  const orchestrator = new CrawlOrchestrator(db, lifecycle, { fetcher });

  try {
    const session = await db.startCrawlSession('https://yorven.in', 1, 5);
    const sessionId = session.session_id;

    await lifecycle.acquireOrRecover(sessionId);

    // Run orchestrator to completion (will wait through the backoff delay)
    const result = await orchestrator.run();
    assert.ok(result);
    assert.equal(result.final_status, 'completed');
    assert.ok(rootAttempts >= 2, `Root page must have been retried (attempts: ${rootAttempts})`);

    // Verify in database: root page is completed with HTTP 200
    const { data: pageRows } = await client
      .schema('public')
      .from('seo_crawled_pages')
      .select('url, http_status, fetch_status')
      .eq('session_id', sessionId)
      .eq('url', 'https://yorven.in/');
    assert.equal(pageRows[0].fetch_status, 'fetched');
    assert.equal(pageRows[0].http_status, 200);

    // Queue retry count should be 1
    const { data: queueRows } = await client
      .schema('public')
      .from('seo_crawl_queue')
      .select('retry_count, status')
      .eq('session_id', sessionId)
      .eq('url', 'https://yorven.in/');
    assert.equal(queueRows[0].retry_count, 1);
    assert.equal(queueRows[0].status, 'completed');
  } finally {
    lifecycle.dispose();
    await stop();
  }
});

test('Orchestration E2E 4: Permanently failed page (404) records issue and allows session completion', async () => {
  const { start, stop, fetcher } = createTestServerAndFetcher((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\nSitemap: https://yorven.in/sitemap.xml\n');
    } else if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://yorven.in/missing-404</loc></url></urlset>');
    } else if (req.url === '/' || req.url === '') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>Root Page Title 15</title></head><body><h1>Root</h1></body></html>');
    } else if (req.url === '/missing-404') {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('Not Found');
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await start();

  const workerId = `worker-e2e-404-${randomUUID().slice(0, 8)}`;
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const db = new DatabaseAdapter(client, workerId);
  const lifecycle = new SessionLifecycleManager(db, { leaseDurationSeconds: 30 });
  const orchestrator = new CrawlOrchestrator(db, lifecycle, { fetcher });

  try {
    const session = await db.startCrawlSession('https://yorven.in', 1, 10);
    const sessionId = session.session_id;

    await lifecycle.acquireOrRecover(sessionId);
    const result = await orchestrator.run();

    assert.ok(result);
    assert.equal(result.final_status, 'completed');

    // Verify 404 page in database
    const { data: pageRows } = await client
      .schema('public')
      .from('seo_crawled_pages')
      .select('url, http_status, fetch_status, parse_status')
      .eq('session_id', sessionId)
      .eq('url', 'https://yorven.in/missing-404');
    assert.equal(pageRows[0].fetch_status, 'fetch_failed');
    assert.equal(pageRows[0].parse_status, 'not_applicable');
    assert.equal(pageRows[0].http_status, 404);

    // Verify issue logged
    const { data: issueRows } = await client
      .schema('public')
      .from('seo_crawl_issues')
      .select('rule_code, severity')
      .eq('session_id', sessionId)
      .eq('url', 'https://yorven.in/missing-404');
    assert.ok(issueRows.length > 0);
    assert.equal(issueRows[0].rule_code, 'ERR_SITEMAP_LISTED_PAGE_4XX');
    assert.equal(issueRows[0].severity, 'critical');
  } finally {
    lifecycle.dispose();
    await stop();
  }
});

test('Orchestration E2E 5: Worker interruption with in-flight work and subsequent recovery by Worker 2', async () => {
  const { start, stop, fetcher } = createTestServerAndFetcher((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\n');
    } else if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    } else if (req.url === '/' || req.url === '') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>Root Page Title 15</title></head><body><h1>Root</h1></body></html>');
    }
  });

  await start();

  const worker1Id = `worker-crash-1-${randomUUID().slice(0, 8)}`;
  const worker2Id = `worker-crash-2-${randomUUID().slice(0, 8)}`;
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const db1 = new DatabaseAdapter(client, worker1Id);
  const db2 = new DatabaseAdapter(client, worker2Id);

  // Worker 1 acquires a short 10s lease
  const lifecycle1 = new SessionLifecycleManager(db1, { leaseDurationSeconds: 10 });

  try {
    const session = await db1.startCrawlSession('https://yorven.in', 1, 5);
    const sessionId = session.session_id;

    await lifecycle1.acquireOrRecover(sessionId);

    // Worker 1 claims a batch, putting robots.txt into 'processing'
    const batch1 = await db1.claimCrawlBatch(sessionId, lifecycle1.leaseToken, lifecycle1.generation, 1, 10);
    assert.equal(batch1.length, 1);
    assert.equal(batch1[0].resource_type, 'robots');

    // Worker 1 abruptly dies (disposed without heartbeating or completing item)
    lifecycle1.dispose();

    // Wait 11 seconds for Worker 1's lease to expire in PostgreSQL
    await new Promise(r => setTimeout(r, 11000));

    // Worker 2 starts up, recovers crashed session, and completes the crawl
    const lifecycle2 = new SessionLifecycleManager(db2, { leaseDurationSeconds: 30 });
    const orchestrator2 = new CrawlOrchestrator(db2, lifecycle2, { fetcher });

    await lifecycle2.acquireOrRecover(sessionId);

    // Verify crash recovery state in Worker 2
    assert.equal(lifecycle2.generation, 2, 'Generation must increment to 2 on recovery');

    // Run Worker 2 to completion
    const result = await orchestrator2.run();
    assert.ok(result);
    assert.equal(result.final_status, 'completed');

    // Verify in database: session status completed, crash_count = 1
    const { data: sessionRows } = await client
      .schema('public')
      .from('seo_crawl_sessions')
      .select('status, crash_count')
      .eq('session_id', sessionId);
    assert.equal(sessionRows[0].status, 'completed');
    assert.equal(sessionRows[0].crash_count, 1);

    lifecycle2.dispose();
  } finally {
    lifecycle1.dispose();
    await stop();
  }
});

test('Orchestration E2E 6: Clean shutdown stops claiming work without falsely completing active items', async () => {
  const { start, stop, fetcher } = createTestServerAndFetcher((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\nSitemap: https://yorven.in/sitemap.xml\n');
    } else if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://yorven.in/page-1</loc></url>
  <url><loc>https://yorven.in/page-2</loc></url>
  <url><loc>https://yorven.in/page-3</loc></url>
</urlset>`);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>Page Title 15 Chars</title></head><body><h1>Header</h1></body></html>');
    }
  });

  await start();

  const workerId = `worker-e2e-shutdown-${randomUUID().slice(0, 8)}`;
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const db = new DatabaseAdapter(client, workerId);
  const lifecycle = new SessionLifecycleManager(db, { leaseDurationSeconds: 30 });
  const orchestrator = new CrawlOrchestrator(db, lifecycle, { fetcher });

  try {
    const session = await db.startCrawlSession('https://yorven.in', 2, 20);
    const sessionId = session.session_id;

    await lifecycle.acquireOrRecover(sessionId);

    // Process robots.txt and sitemap to populate queue with pages
    const batch1 = await db.claimCrawlBatch(sessionId, lifecycle.leaseToken, lifecycle.generation, 10);
    await orchestrator.processRobotsItem(batch1[0]);

    const batch2 = await db.claimCrawlBatch(sessionId, lifecycle.leaseToken, lifecycle.generation, 10);
    const sitemapItem = batch2.find(i => i.resource_type === 'sitemap');
    await orchestrator.processSitemapItem(sitemapItem);

    // Queue now has pending pages. Request graceful shutdown before running loop
    orchestrator.requestShutdown();

    const result = await orchestrator.run();
    // Must return null (did not finalize)
    assert.equal(result, null);

    // In database: session must STILL be 'running' (not finalized as 'completed')
    const { data: sessionRows } = await client
      .schema('public')
      .from('seo_crawl_sessions')
      .select('status')
      .eq('session_id', sessionId);
    assert.equal(sessionRows[0].status, 'running');

    // Pending queue items must remain pending (not falsely marked completed)
    const { data: pendingItems } = await client
      .schema('public')
      .from('seo_crawl_queue')
      .select('status')
      .eq('session_id', sessionId)
      .eq('status', 'pending');
    assert.ok(pendingItems.length >= 2, 'Pending items must remain in pending status');
  } finally {
    lifecycle.dispose();
    await stop();
  }
});

test('Orchestration E2E 7: Finalize is rejected by database if pending items remain', async () => {
  const workerId = `worker-e2e-fin-reject-${randomUUID().slice(0, 8)}`;
  const client = createDatabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const db = new DatabaseAdapter(client, workerId);

  const session = await db.startCrawlSession('https://yorven.in', 2, 20);
  const sessionId = session.session_id;
  const lease = await db.acquireSessionLease(sessionId, 60);

  // Attempt to finalize while queue still has pending items (robots and seed)
  await assert.rejects(
    () => db.finalizeCrawlSession(sessionId, lease.lease_token),
    (err) => {
      assert.ok(err.message.includes('CANNOT_FINALIZE_ACTIVE_QUEUE'));
      return true;
    }
  );
});
