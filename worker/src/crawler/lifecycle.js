import { createLogger } from '../config.js';

export class SessionLifecycleManager {
  /**
   * @param {import('../db/adapter.js').DatabaseAdapter} dbAdapter
   * @param {object} [options]
   * @param {number} [options.leaseDurationSeconds=60]
   * @param {import('../config.js').createLogger} [options.logger]
   */
  constructor(dbAdapter, options = {}) {
    this.db = dbAdapter;
    this.leaseDurationSeconds = options.leaseDurationSeconds || 60;
    this.logger = options.logger || createLogger();

    this.sessionId = null;
    this.leaseToken = null;
    this.generation = null;
    this.leaseExpiresAt = null;
    this.heartbeatTimer = null;
    this.isRenewing = false;
  }

  /**
   * Acquire lease on session, or recover if running with expired lease.
   * @param {string} sessionId
   */
  async acquireOrRecover(sessionId) {
    this.sessionId = sessionId;

    this.logger.info(`Acquiring session lease for session '${sessionId}'...`);
    let leaseRes = await this.db.acquireSessionLease(sessionId, this.leaseDurationSeconds);

    if (!leaseRes.acquired) {
      if (leaseRes.rejection_reason === 'EXPIRED_LEASE_REQUIRES_RECOVERY') {
        this.logger.warn(`Session '${sessionId}' lease expired. Attempting crash recovery...`);
        const recoverRes = await this.db.recoverCrashedSession(sessionId, this.leaseDurationSeconds);
        if (!recoverRes.recovered) {
          throw new Error(`CRASH_RECOVERY_FAILED: ${recoverRes.rejection_reason}`);
        }
        this.leaseToken = recoverRes.lease_token;
        this.generation = recoverRes.generation;
        this.logger.info(`Crash recovery succeeded. Generation: ${this.generation}, reclaimed items: ${recoverRes.reclaimed_queue_items}`);
      } else {
        throw new Error(`LEASE_ACQUISITION_FAILED: ${leaseRes.rejection_reason}`);
      }
    } else {
      this.leaseToken = leaseRes.lease_token;
      this.generation = leaseRes.generation;
      this.leaseExpiresAt = leaseRes.lease_expires_at;
      this.logger.info(`Lease acquired successfully. Token: ${this.leaseToken}, Generation: ${this.generation}`);
    }

    this._startHeartbeat();
    return {
      sessionId: this.sessionId,
      leaseToken: this.leaseToken,
      generation: this.generation
    };
  }

  /**
   * Start background lease renewal timer (every half of lease duration).
   */
  _startHeartbeat() {
    this._stopHeartbeat();
    const intervalMs = Math.max(5000, Math.floor((this.leaseDurationSeconds * 1000) / 2));

    this.heartbeatTimer = setInterval(async () => {
      if (this.isRenewing || !this.sessionId || !this.leaseToken) return;
      this.isRenewing = true;
      try {
        const renewRes = await this.db.acquireSessionLease(
          this.sessionId,
          this.leaseDurationSeconds,
          this.leaseToken,
          this.generation
        );

        if (renewRes.acquired) {
          this.leaseToken = renewRes.lease_token;
          this.leaseExpiresAt = renewRes.lease_expires_at;
          this.logger.debug(`Session lease renewed successfully until ${this.leaseExpiresAt}`);
        } else {
          this.logger.error(`Session lease renewal failed: ${renewRes.rejection_reason}`);
        }
      } catch (err) {
        this.logger.error(`Error in lease renewal heartbeat: ${err.message}`);
      } finally {
        this.isRenewing = false;
      }
    }, intervalMs);

    // Unref heartbeat timer so it does not block node process exit
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Stop background lease renewal timer.
   */
  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Finalize the session when processing is completed.
   */
  async finalize() {
    this._stopHeartbeat();
    if (!this.sessionId) return null;

    this.logger.info(`Finalizing crawl session '${this.sessionId}'...`);
    const finalRes = await this.db.finalizeCrawlSession(this.sessionId, this.leaseToken);
    this.logger.info(`Session finalized. Status: ${finalRes.final_status}, Total crawled: ${finalRes.total_crawled}`);
    return finalRes;
  }

  /**
   * Release resources on interruption / shutdown.
   */
  dispose() {
    this._stopHeartbeat();
  }
}
