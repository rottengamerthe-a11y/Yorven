import { randomUUID } from 'node:crypto';

export class DatabaseAdapter {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} client
   * @param {string} workerId
   */
  constructor(client, workerId) {
    if (!client) throw new Error('DatabaseAdapter requires a SupabaseClient');
    if (!workerId || typeof workerId !== 'string') {
      throw new Error('DatabaseAdapter requires a non-empty workerId');
    }
    this.client = client;
    this.workerId = workerId;
  }

  /**
   * Helper to execute RPC and unwrap single-row results or handle errors.
   */
  async _callRpc(fnName, params = {}, expectSingleRow = true) {
    const { data, error } = await this.client.rpc(fnName, params);
    if (error) {
      const err = new Error(`Database RPC '${fnName}' failed: ${error.message}`);
      err.code = error.code;
      err.details = error.details;
      err.hint = error.hint;
      throw err;
    }
    if (expectSingleRow) {
      if (Array.isArray(data)) {
        return data[0] ?? null;
      }
      return data ?? null;
    }
    return Array.isArray(data) ? data : (data ? [data] : []);
  }

  /**
   * Start a new crawl session.
   * @param {string} seedUrl
   * @param {number} [maxDepth=4]
   * @param {number} [maxPages=100]
   * @returns {Promise<{session_id: string, status: string, seed_url: string, created_at: string}>}
   */
  async startCrawlSession(seedUrl = 'https://yorven.in', maxDepth = 4, maxPages = 100) {
    return this._callRpc('start_crawl_session', {
      p_seed_url: seedUrl,
      p_max_depth: maxDepth,
      p_max_pages: maxPages
    });
  }

  /**
   * Acquire or renew session worker lease.
   * @param {string} sessionId
   * @param {number} [durationSeconds=60]
   * @param {string|null} [currentLeaseToken=null]
   * @param {number|null} [expectedGeneration=null]
   * @returns {Promise<{acquired: boolean, lease_token: string|null, generation: number|null, lease_expires_at: string|null, rejection_reason: string|null}>}
   */
  async acquireSessionLease(sessionId, durationSeconds = 60, currentLeaseToken = null, expectedGeneration = null) {
    return this._callRpc('acquire_session_lease', {
      p_session_id: sessionId,
      p_worker_id: this.workerId,
      p_lease_duration_seconds: durationSeconds,
      p_current_lease_token: currentLeaseToken,
      p_expected_generation: expectedGeneration
    });
  }

  /**
   * Recover an expired/crashed running session.
   * @param {string} sessionId
   * @param {number} [durationSeconds=60]
   * @returns {Promise<{recovered: boolean, lease_token: string|null, generation: number|null, crash_count: number|null, reclaimed_queue_items: number, rejection_reason: string|null}>}
   */
  async recoverCrashedSession(sessionId, durationSeconds = 60) {
    return this._callRpc('recover_crashed_session', {
      p_session_id: sessionId,
      p_worker_id: this.workerId,
      p_lease_duration_seconds: durationSeconds
    });
  }

  /**
   * Atomically claim a batch of crawl items.
   * @param {string} sessionId
   * @param {string} leaseToken
   * @param {number} generation
   * @param {number} [batchSize=10]
   * @param {number} [itemLeaseSeconds=60]
   * @returns {Promise<Array<{queue_id: string, url: string, resource_type: string, depth: number, priority: number, retry_count: number, lease_token: string, lease_expires_at: string}>>}
   */
  async claimCrawlBatch(sessionId, leaseToken, generation, batchSize = 10, itemLeaseSeconds = 60) {
    return this._callRpc('claim_crawl_batch', {
      p_session_id: sessionId,
      p_worker_id: this.workerId,
      p_lease_token: leaseToken,
      p_generation: generation,
      p_batch_size: batchSize,
      p_item_lease_seconds: itemLeaseSeconds
    }, false);
  }

  /**
   * Complete a crawl item, upsert page record, enqueue discovered URLs, log issues.
   * @param {object} params
   * @returns {Promise<{success: boolean, page_id: string|null, discovered_urls_enqueued: number, issues_logged: number, rejection_reason: string|null}>}
   */
  async completeCrawlItem({
    sessionId,
    queueId,
    leaseToken,
    generation,
    operationId = randomUUID(),
    url,
    resourceType = 'page',
    fetchStatus = 'fetched',
    parseStatus = 'parsed',
    httpStatus = 200,
    loadTimeMs = 0,
    contentFingerprint = null,
    title = null,
    metaDescription = null,
    h1 = null,
    canonicalUrl = null,
    bodyTextHash = null,
    outlinks = [],
    redirectChain = [],
    discoveredUrls = [],
    issues = []
  }) {
    return this._callRpc('complete_crawl_item', {
      p_session_id: sessionId,
      p_queue_id: queueId,
      p_worker_id: this.workerId,
      p_lease_token: leaseToken,
      p_generation: generation,
      p_operation_id: operationId,
      p_url: url,
      p_resource_type: resourceType,
      p_fetch_status: fetchStatus,
      p_parse_status: parseStatus,
      p_http_status: httpStatus,
      p_load_time_ms: loadTimeMs,
      p_content_fingerprint: contentFingerprint,
      p_title: title,
      p_meta_description: metaDescription,
      p_h1: h1,
      p_canonical_url: canonicalUrl,
      p_body_text_hash: bodyTextHash,
      p_outlinks: outlinks,
      p_redirect_chain: redirectChain,
      p_discovered_urls: discoveredUrls,
      p_issues: issues
    });
  }

  /**
   * Retry a crawl item with backoff.
   * @param {object} params
   * @returns {Promise<{success: boolean, new_retry_count: number, rejection_reason: string|null}>}
   */
  async retryCrawlItem({
    sessionId,
    queueId,
    leaseToken,
    generation,
    operationId = randomUUID(),
    errorMessage,
    retryDelaySeconds = 10
  }) {
    return this._callRpc('retry_crawl_item', {
      p_session_id: sessionId,
      p_queue_id: queueId,
      p_worker_id: this.workerId,
      p_lease_token: leaseToken,
      p_generation: generation,
      p_operation_id: operationId,
      p_error_message: errorMessage,
      p_retry_delay_seconds: retryDelaySeconds
    });
  }

  /**
   * Mark a crawl item as terminally failed.
   * @param {object} params
   * @returns {Promise<{success: boolean, rejection_reason: string|null}>}
   */
  async failCrawlItem({
    sessionId,
    queueId,
    leaseToken,
    generation,
    operationId = randomUUID(),
    errorMessage,
    httpStatus = null
  }) {
    return this._callRpc('fail_crawl_item', {
      p_session_id: sessionId,
      p_queue_id: queueId,
      p_worker_id: this.workerId,
      p_lease_token: leaseToken,
      p_generation: generation,
      p_operation_id: operationId,
      p_error_message: errorMessage,
      p_http_status: httpStatus
    });
  }

  /**
   * Reclaim stale queue leases.
   * @param {string} sessionId
   * @returns {Promise<{reclaimed_queue_items: number, failed_queue_items: number, session_lease_expired: boolean}>}
   */
  async reclaimStaleLeases(sessionId) {
    return this._callRpc('reclaim_stale_leases', {
      p_session_id: sessionId
    });
  }

  /**
   * Cancel a crawl session.
   * @param {string} sessionId
   * @returns {Promise<{cancelled: boolean, rejection_reason: string|null}>}
   */
  async cancelCrawlSession(sessionId) {
    return this._callRpc('cancel_crawl_session', {
      p_session_id: sessionId
    });
  }

  /**
   * Query pending or processing queue items for a session.
   * @param {string} sessionId
   * @returns {Promise<Array<{queue_id: string, status: string, resource_type: string, retry_count: number, updated_at: string}>>}
   */
  async getPendingOrProcessingItems(sessionId) {
    const { data, error } = await this.client
      .schema('public')
      .from('seo_crawl_queue')
      .select('queue_id, status, resource_type, retry_count, updated_at')
      .eq('session_id', sessionId)
      .in('status', ['pending', 'processing']);
    if (error) {
      throw new Error(`Failed to query queue items: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Finalize a completed crawl session.
   * @param {string} sessionId
   * @param {string|null} [leaseToken=null]
   * @returns {Promise<{final_status: string, total_crawled: number, remaining_pending: number}>}
   */
  async finalizeCrawlSession(sessionId, leaseToken = null) {
    return this._callRpc('finalize_crawl_session', {
      p_session_id: sessionId,
      p_worker_id: this.workerId,
      p_lease_token: leaseToken
    });
  }

  /**
   * Cleanup crawl sessions older than retention interval.
   * @param {string} [olderThanInterval='30 days']
   * @returns {Promise<{deleted_sessions: number}>}
   */
  async cleanupCrawlHistory(olderThanInterval = '30 days') {
    return this._callRpc('cleanup_crawl_history', {
      p_older_than_interval: olderThanInterval
    });
  }

  /**
   * Validate a crawl URL using database normalization logic.
   * @param {string} rawUrl
   * @returns {Promise<{is_valid: boolean, normalized_url: string|null, rejection_reason: string|null}>}
   */
  async validateCrawlUrl(rawUrl) {
    return this._callRpc('validate_crawl_url', {
      p_raw_url: rawUrl
    });
  }

  /**
   * Compute page fingerprint using database SHA-256 algorithm.
   * @param {object} params
   * @returns {Promise<string>}
   */
  async computePageFingerprint({
    normalizedUrl,
    title = '',
    metaDescription = '',
    canonicalUrl = '',
    bodyTextHash = ''
  }) {
    const res = await this._callRpc('compute_page_fingerprint', {
      p_normalized_url: normalizedUrl,
      p_title: title,
      p_meta_description: metaDescription,
      p_canonical_url: canonicalUrl,
      p_body_text_hash: bodyTextHash
    }, false);
    return typeof res === 'string' ? res : (res?.[0] ?? String(res));
  }
}
