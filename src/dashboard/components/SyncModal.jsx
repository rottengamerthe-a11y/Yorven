import React, { useState } from 'react';
import { RefreshCw, CheckCircle, Clock, AlertTriangle, X } from 'lucide-react';
import { triggerSyncApi } from '../api/dashboardClient.js';

export function SyncModal({ isOpen, onClose, token, onSyncTriggered }) {
  const [jobType, setJobType] = useState('full_resync');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      const res = await triggerSyncApi(token, jobType);
      setSyncResult(res);
      if (onSyncTriggered) onSyncTriggered(res);
    } catch (err) {
      setSyncError(err.message || 'Synchronization request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setSyncResult(null);
    setSyncError(null);
    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sync-modal-title">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <RefreshCw size={20} className={isSubmitting ? 'spin' : ''} />
            <h2 id="sync-modal-title" className="modal-title">Trigger SEO Synchronization</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">
              Initiate on-demand data synchronization. Workloads are queued in PostgreSQL (<code>public.seo_sync_jobs</code>)
              and claimed atomically via <code>auth_util.claim_sync_job</code> in FIFO order.
            </p>

            <div className="form-group">
              <label htmlFor="sync-job-type" className="form-label">Job Workload Type</label>
              <select
                id="sync-job-type"
                className="form-select"
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                disabled={isSubmitting}
              >
                <option value="full_resync">Full Resync (Google Search Console + GA4)</option>
                <option value="gsc_daily">GSC Only (Search Analytics)</option>
                <option value="ga4_daily">GA4 Only (Landing Page Engagement)</option>
              </select>
            </div>

            <div className="sync-notice-box">
              <span className="notice-icon"><Clock size={16} /></span>
              <div className="notice-content">
                <strong>Execution Profile Notice:</strong> Manual sync executes with a strict 6,500 ms processing
                cutoff to guarantee safe completion on serverless workers. If a previous job is already pending,
                it will be claimed first per FIFO queue rules. If the queue is busy, the request returns <code>202 Accepted</code>
                for deferred background worker execution.
              </div>
            </div>

            {/* Success (HTTP 200) */}
            {syncResult && syncResult.status === 200 && (
              <div className="sync-result-box result-success">
                <CheckCircle size={20} className="result-icon success" />
                <div className="result-text">
                  <div className="result-heading">Synchronization Executed Successfully</div>
                  <div className="result-details">
                    <span><strong>Executed Job:</strong> {syncResult.data.executed_job_type}</span>
                    <span><strong>Duration:</strong> {syncResult.data.duration_ms} ms</span>
                    <span><strong>GSC Rows:</strong> {syncResult.data.gsc_rows}</span>
                    <span><strong>GA4 Rows:</strong> {syncResult.data.ga4_rows}</span>
                    <span><strong>Status:</strong> {syncResult.data.gsc_truncation_status}</span>
                  </div>
                  {syncResult.data.note && (
                    <div className="result-note">{syncResult.data.note}</div>
                  )}
                </div>
              </div>
            )}

            {/* Enqueued (HTTP 202) */}
            {syncResult && syncResult.status === 202 && (
              <div className="sync-result-box result-deferred">
                <Clock size={20} className="result-icon deferred" />
                <div className="result-text">
                  <div className="result-heading">Job Enqueued (202 Accepted)</div>
                  <p className="result-paragraph">
                    The requested job (ID: <code>{syncResult.data.enqueued_job_id}</code>) has been successfully
                    registered in <code>public.seo_sync_jobs</code>. Execution is deferred to the scheduled background
                    worker.
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {syncError && (
              <div className="sync-result-box result-error">
                <AlertTriangle size={20} className="result-icon error" />
                <div className="result-text">
                  <div className="result-heading">Synchronization Failed</div>
                  <div className="result-paragraph">{syncError}</div>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Close
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={15} className="spin" />
                  <span>Executing...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={15} />
                  <span>Start Sync</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
