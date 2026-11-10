import { SafeHttpFetcher } from '../fetcher/fetcher.js';
import { RobotsManager } from '../parser/robots.js';
import { parseSitemapXml } from '../parser/sitemap.js';
import { parseHtml } from '../parser/html.js';
import { computePageFingerprint } from '../parser/fingerprint.js';
import { RuleEvaluator } from '../rules/evaluator.js';
import { createLogger, TARGET_ORIGIN } from '../config.js';

export class CrawlOrchestrator {
  /**
   * @param {import('../db/adapter.js').DatabaseAdapter} dbAdapter
   * @param {import('./lifecycle.js').SessionLifecycleManager} lifecycle
   * @param {object} [options]
   * @param {SafeHttpFetcher} [options.fetcher]
   * @param {import('../config.js').createLogger} [options.logger]
   */
  constructor(dbAdapter, lifecycle, options = {}) {
    this.db = dbAdapter;
    this.lifecycle = lifecycle;
    this.fetcher = options.fetcher || new SafeHttpFetcher();
    this.logger = options.logger || createLogger();

    this.sitemapUrls = new Set();
    this.knownBodyHashes = new Set();
    this.robotsManager = null;
    this.robotsFailed = false;
    this.shutdownRequested = false;
  }

  /**
   * Request graceful stop of crawl.
   */
  requestShutdown() {
    this.logger.info('Graceful shutdown requested. Finishing current batch...');
    this.shutdownRequested = true;
  }

  /**
   * Process a single robots.txt queue item.
   */
  async processRobotsItem(item) {
    this.logger.info(`Fetching robots.txt from '${item.url}'...`);
    let fetchRes;
    try {
      fetchRes = await this.fetcher.fetch(item.url);
    } catch (err) {
      this.logger.error(`Failed to fetch robots.txt: ${err.message}`);
      await this.db.failCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        errorMessage: `Failed to fetch robots.txt: ${err.message}`
      });
      this.robotsFailed = true;
      return;
    }

    if (fetchRes.status >= 400 && fetchRes.status !== 404) {
      this.logger.error(`Failed to fetch robots.txt: HTTP ${fetchRes.status}`);
      await this.db.failCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        errorMessage: `Failed to fetch robots.txt: HTTP ${fetchRes.status}`
      });
      this.robotsFailed = true;
      return;
    }

    const content = fetchRes.body || '';
    this.robotsManager = new RobotsManager(item.url, content);

    const declaredSitemaps = this.robotsManager.extractSitemaps();
    this.logger.info(`Found ${declaredSitemaps.length} sitemaps declared in robots.txt`);

    // Prepare discovered sitemap URLs
    const discoveredUrls = [];
    if (declaredSitemaps.length > 0) {
      for (const sm of declaredSitemaps) {
        discoveredUrls.push({
          url: sm,
          resource_type: 'sitemap',
          priority: 8,
          depth: 1
        });
      }
    } else {
      // Fallback: enqueue default sitemap if none declared
      discoveredUrls.push({
        url: `${TARGET_ORIGIN}/sitemap.xml`,
        resource_type: 'sitemap',
        priority: 8,
        depth: 1
      });
    }

    const fingerprint = computePageFingerprint({
      normalizedUrl: item.url,
      bodyTextHash: null
    });

    await this.db.completeCrawlItem({
      sessionId: this.lifecycle.sessionId,
      queueId: item.queue_id,
      leaseToken: this.lifecycle.leaseToken,
      generation: this.lifecycle.generation,
      url: item.url,
      resourceType: 'robots',
      fetchStatus: 'fetched',
      parseStatus: 'parsed',
      httpStatus: fetchRes.status,
      loadTimeMs: fetchRes.loadTimeMs,
      contentFingerprint: fingerprint,
      redirectChain: fetchRes.redirectChain,
      discoveredUrls
    });

    this.logger.info('robots.txt processed successfully');
  }

  /**
   * Process a single sitemap queue item.
   */
  async processSitemapItem(item) {
    this.logger.info(`Processing sitemap '${item.url}'...`);

    // Check robots.txt disallowance on sitemap document
    if (this.robotsManager && !this.robotsManager.isAllowed(item.url)) {
      const issues = RuleEvaluator.evaluateRobotsDisallowed({
        url: item.url,
        resourceType: 'sitemap'
      });
      await this.db.completeCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        url: item.url,
        resourceType: 'sitemap',
        fetchStatus: 'blocked_by_robots',
        parseStatus: 'not_applicable',
        httpStatus: 200,
        issues
      });
      return;
    }

    let fetchRes;
    try {
      fetchRes = await this.fetcher.fetch(item.url);
    } catch (err) {
      const issues = err.code === 'ERR_REDIRECT_CHAIN_LOOP'
        ? [RuleEvaluator.createIssue('ERR_REDIRECT_CHAIN_LOOP', err.message, { redirectChain: err.redirectChain || [] })]
        : RuleEvaluator.evaluateHttpFindings({
            status: 0,
            isTransportFailure: true,
            isExhausted: true,
            resourceType: 'sitemap',
            errorMessage: err.message
          });
      await this.db.completeCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        url: item.url,
        resourceType: 'sitemap',
        fetchStatus: 'fetch_failed',
        parseStatus: 'not_applicable',
        httpStatus: 0,
        redirectChain: err.redirectChain || [],
        issues
      });
      return;
    }

    if (fetchRes.status >= 400) {
      const issues = RuleEvaluator.evaluateHttpFindings({
        status: fetchRes.status,
        resourceType: 'sitemap'
      });
      await this.db.completeCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        url: item.url,
        resourceType: 'sitemap',
        fetchStatus: 'fetch_failed',
        parseStatus: 'not_applicable',
        httpStatus: fetchRes.status,
        redirectChain: fetchRes.redirectChain,
        issues
      });
      return;
    }

    let discoveredUrls = [];
    const issues = [];
    try {
      discoveredUrls = parseSitemapXml(fetchRes.body);
      for (const entry of discoveredUrls) {
        if (entry.resource_type === 'page') {
          this.sitemapUrls.add(entry.url);
        }
      }
      this.logger.info(`Extracted ${discoveredUrls.length} entries from sitemap '${item.url}'`);
    } catch (parseErr) {
      this.logger.warn(`Sitemap parsing failed for '${item.url}': ${parseErr.message}`);
      issues.push(RuleEvaluator.createIssue(
        'ERR_SITEMAP_MALFORMED_XML',
        parseErr.message,
        { url: item.url }
      ));
    }

    const fingerprint = computePageFingerprint({
      normalizedUrl: item.url,
      bodyTextHash: null
    });

    await this.db.completeCrawlItem({
      sessionId: this.lifecycle.sessionId,
      queueId: item.queue_id,
      leaseToken: this.lifecycle.leaseToken,
      generation: this.lifecycle.generation,
      url: item.url,
      resourceType: 'sitemap',
      fetchStatus: 'fetched',
      parseStatus: issues.length > 0 ? 'parse_failed' : 'parsed',
      httpStatus: fetchRes.status,
      loadTimeMs: fetchRes.loadTimeMs,
      contentFingerprint: fingerprint,
      redirectChain: fetchRes.redirectChain,
      discoveredUrls,
      issues
    });
  }

  /**
   * Process a standard HTML page queue item.
   */
  async processPageItem(item) {
    const isInSitemap = this.sitemapUrls.has(item.url);

    // 1. Robots.txt policy gate
    if (this.robotsManager && !this.robotsManager.isAllowed(item.url)) {
      this.logger.info(`URL '${item.url}' blocked by robots.txt`);
      const issues = RuleEvaluator.evaluateRobotsDisallowed({
        url: item.url,
        resourceType: 'page',
        isInSitemap
      });

      await this.db.completeCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        url: item.url,
        resourceType: 'page',
        fetchStatus: 'blocked_by_robots',
        parseStatus: 'not_applicable',
        httpStatus: 200,
        issues
      });
      return;
    }

    // 2. Fetch page
    let fetchRes;
    try {
      fetchRes = await this.fetcher.fetch(item.url);
    } catch (err) {
      if (err.code === 'ERR_REDIRECT_CHAIN_LOOP') {
        const issues = [
          RuleEvaluator.createIssue(
            'ERR_REDIRECT_CHAIN_LOOP',
            err.message || 'Redirect hops > 5 or circular redirect loop detected.',
            { redirectChain: err.redirectChain || [] }
          )
        ];

        await this.db.completeCrawlItem({
          sessionId: this.lifecycle.sessionId,
          queueId: item.queue_id,
          leaseToken: this.lifecycle.leaseToken,
          generation: this.lifecycle.generation,
          url: item.url,
          resourceType: 'page',
          fetchStatus: 'fetch_failed',
          parseStatus: 'not_applicable',
          httpStatus: 0,
          redirectChain: err.redirectChain || [],
          issues
        });
        return;
      }

      const isRetryable = err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET';
      if (isRetryable && item.retry_count < 3) {
        this.logger.warn(`Transient fetch error for '${item.url}' (attempt ${item.retry_count + 1}): ${err.message}. Retrying...`);
        await this.db.retryCrawlItem({
          sessionId: this.lifecycle.sessionId,
          queueId: item.queue_id,
          leaseToken: this.lifecycle.leaseToken,
          generation: this.lifecycle.generation,
          errorMessage: err.message,
          retryDelaySeconds: 10
        });
        return;
      }

      // Exhausted transport failure
      const issues = RuleEvaluator.evaluateHttpFindings({
        status: 0,
        isInSitemap,
        resourceType: 'page',
        isTransportFailure: true,
        isExhausted: true,
        errorMessage: err.message
      });

      await this.db.completeCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        url: item.url,
        resourceType: 'page',
        fetchStatus: 'fetch_failed',
        parseStatus: 'not_applicable',
        httpStatus: 0,
        issues
      });
      return;
    }

    // 3. HTTP status checks
    const status = fetchRes.status;
    const httpIssues = RuleEvaluator.evaluateHttpFindings({
      status,
      isInSitemap,
      resourceType: 'page',
      redirectChain: fetchRes.redirectChain
    });

    // 4. Handle HTTP 206 Partial Content (bypass HTML parsing and fingerprinting)
    if (status === 206) {
      await this.db.completeCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        url: item.url,
        resourceType: 'page',
        fetchStatus: 'fetched',
        parseStatus: 'not_applicable',
        httpStatus: 206,
        loadTimeMs: fetchRes.loadTimeMs,
        redirectChain: fetchRes.redirectChain,
        issues: httpIssues
      });
      return;
    }

    // 5. Handle 4xx / 5xx error responses
    if (status >= 400 && status <= 499) {
      await this.db.completeCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        url: item.url,
        resourceType: 'page',
        fetchStatus: 'fetch_failed',
        parseStatus: 'not_applicable',
        httpStatus: status,
        loadTimeMs: fetchRes.loadTimeMs,
        redirectChain: fetchRes.redirectChain,
        issues: httpIssues
      });
      return;
    }

    if (status >= 500 && status <= 599) {
      if (item.retry_count < 3) {
        this.logger.warn(`Server 5xx error (${status}) for '${item.url}'. Retrying with backoff...`);
        await this.db.retryCrawlItem({
          sessionId: this.lifecycle.sessionId,
          queueId: item.queue_id,
          leaseToken: this.lifecycle.leaseToken,
          generation: this.lifecycle.generation,
          errorMessage: `HTTP ${status}`,
          retryDelaySeconds: 10
        });
        return;
      }

      await this.db.completeCrawlItem({
        sessionId: this.lifecycle.sessionId,
        queueId: item.queue_id,
        leaseToken: this.lifecycle.leaseToken,
        generation: this.lifecycle.generation,
        url: item.url,
        resourceType: 'page',
        fetchStatus: 'fetch_failed',
        parseStatus: 'not_applicable',
        httpStatus: status,
        loadTimeMs: fetchRes.loadTimeMs,
        redirectChain: fetchRes.redirectChain,
        issues: httpIssues
      });
      return;
    }

    // 5. Successful 200 OK HTML parsing
    const parsedHtml = parseHtml(fetchRes.body, fetchRes.finalUrl);

    // Evaluate HTML rules
    const htmlIssues = RuleEvaluator.evaluateHtmlPage(parsedHtml, {
      currentUrl: fetchRes.finalUrl,
      isInSitemap,
      knownBodyHashes: this.knownBodyHashes,
      robotsManager: this.robotsManager
    });

    if (parsedHtml.bodyTextHash) {
      this.knownBodyHashes.add(parsedHtml.bodyTextHash);
    }

    const allIssues = [...httpIssues, ...htmlIssues];

    // Compute fingerprint
    const fingerprint = computePageFingerprint({
      normalizedUrl: fetchRes.finalUrl,
      title: parsedHtml.title,
      metaDescription: parsedHtml.metaDescription,
      canonicalUrl: parsedHtml.canonicalUrl,
      bodyTextHash: parsedHtml.bodyTextHash
    });

    // Enqueue discovered internal outlinks
    const discoveredUrls = [];
    if (item.depth < 4) {
      for (const link of parsedHtml.internalOutlinks) {
        discoveredUrls.push({
          url: link,
          resource_type: 'page',
          depth: item.depth + 1,
          priority: Math.max(0, 10 - (item.depth + 1) * 2)
        });
      }
    }

    // Save internal canonical URL only (never external)
    const storedCanonical = parsedHtml.isCanonicalExternal ? null : parsedHtml.canonicalUrl;

    await this.db.completeCrawlItem({
      sessionId: this.lifecycle.sessionId,
      queueId: item.queue_id,
      leaseToken: this.lifecycle.leaseToken,
      generation: this.lifecycle.generation,
      url: item.url,
      resourceType: 'page',
      fetchStatus: 'fetched',
      parseStatus: 'parsed',
      httpStatus: status,
      loadTimeMs: fetchRes.loadTimeMs,
      contentFingerprint: fingerprint,
      title: parsedHtml.title || null,
      metaDescription: parsedHtml.metaDescription || null,
      h1: parsedHtml.h1 || null,
      canonicalUrl: storedCanonical,
      bodyTextHash: parsedHtml.bodyTextHash,
      outlinks: parsedHtml.rawOutlinks,
      redirectChain: fetchRes.redirectChain,
      discoveredUrls,
      issues: allIssues
    });

    this.logger.info(`Completed page '${item.url}' (depth: ${item.depth}, issues: ${allIssues.length}, enqueued: ${discoveredUrls.length})`);
  }

  /**
   * Run the crawl loop until all items are processed or shutdown is requested.
   */
  async run() {
    this.logger.info(`Starting crawl loop for session '${this.lifecycle.sessionId}'...`);

    while (!this.shutdownRequested) {
      // Reclaim any expired item leases first
      await this.db.reclaimStaleLeases(this.lifecycle.sessionId);

      // Claim a batch of up to 10 items
      const batch = await this.db.claimCrawlBatch(
        this.lifecycle.sessionId,
        this.lifecycle.leaseToken,
        this.lifecycle.generation,
        10
      );

      if (!batch || batch.length === 0) {
        if (this.robotsFailed) {
          this.logger.warn(`Robots.txt barrier failed. Cancelling session '${this.lifecycle.sessionId}'...`);
          await this.db.cancelCrawlSession(this.lifecycle.sessionId);
          this.lifecycle.dispose();
          return { final_status: 'cancelled', total_crawled: 0, remaining_pending: 0 };
        }

        const pendingItems = await this.db.getPendingOrProcessingItems(this.lifecycle.sessionId);
        if (!pendingItems || pendingItems.length === 0) {
          this.logger.info('All queue items completed. Proceeding to finalize session...');
          break;
        }

        // Check if items are waiting for backoff delay (available_at in future)
        this.logger.info(`Session has ${pendingItems.length} items still pending/processing. Waiting for availability...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      this.logger.info(`Claimed batch of ${batch.length} items`);

      for (const item of batch) {
        if (this.shutdownRequested || this.robotsFailed) break;

        if (item.resource_type === 'robots') {
          await this.processRobotsItem(item);
        } else if (item.resource_type === 'sitemap') {
          await this.processSitemapItem(item);
        } else {
          await this.processPageItem(item);
        }
      }

      if (this.robotsFailed) {
        this.logger.warn(`Robots.txt barrier failed. Cancelling session '${this.lifecycle.sessionId}'...`);
        await this.db.cancelCrawlSession(this.lifecycle.sessionId);
        this.lifecycle.dispose();
        return { final_status: 'cancelled', total_crawled: 0, remaining_pending: 0 };
      }
    }

    if (!this.shutdownRequested) {
      return this.lifecycle.finalize();
    } else {
      this.logger.info('Worker shutdown before completion. Active lease will expire naturally.');
      this.lifecycle.dispose();
      return null;
    }
  }
}
