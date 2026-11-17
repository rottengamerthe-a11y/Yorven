import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FileText,
  Search,
  ExternalLink,
  CheckCircle,
  HelpCircle,
  X,
  RefreshCw,
  AlertCircle,
  Clock,
  History,
  AlertTriangle
} from 'lucide-react';
import { getPagesApi, inspectUrlApi } from '../api/dashboardClient.js';
import '../components/dashboard.css';

/**
 * Formats ISO timestamps into human-readable UTC date and time strings.
 */
function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
  } catch {
    return '—';
  }
}

/**
 * Formats ISO timestamps into simple YYYY-MM-DD date strings.
 */
function formatDateOnly(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toISOString().split('T')[0];
  } catch {
    return '—';
  }
}

/**
 * Renders semantic, user-friendly badge for Google indexing and job lifecycle states.
 */
function renderIndexingStatusBadge(page) {
  if (page.is_pending) {
    return (
      <span className="status-pill pending" title="URL inspection job is queued in public.seo_sync_jobs">
        <Clock size={12} />
        <span>Queued</span>
      </span>
    );
  }

  if (page.is_processing) {
    return (
      <span className="status-pill processing" title="URL inspection job is currently processing">
        <RefreshCw size={12} className="spin" />
        <span>Inspecting...</span>
      </span>
    );
  }

  if (page.inspection_verdict === 'PASS') {
    return (
      <span className="status-pill complete" title="Google Search Console Verdict: PASS (Indexed in Google)">
        <CheckCircle size={12} />
        <span>Indexed</span>
      </span>
    );
  }

  if (page.inspection_verdict === 'NEUTRAL') {
    return (
      <span className="status-pill warning" title="Google Search Console Verdict: NEUTRAL (Excluded / Not Indexed)">
        <HelpCircle size={12} />
        <span>Excluded</span>
      </span>
    );
  }

  if (page.inspection_verdict === 'FAIL') {
    return (
      <span className="status-pill failed" title="Google Search Console Verdict: FAIL (Indexing Issue)">
        <AlertCircle size={12} />
        <span>Not Indexed</span>
      </span>
    );
  }

  if (page.computed_state === 'failed' || page.inspection_error) {
    return (
      <span className="status-pill failed" title={page.inspection_error || 'Inspection failed'}>
        <AlertTriangle size={12} />
        <span>Failed</span>
      </span>
    );
  }

  if (page.is_never_inspected || !page.indexing_status_verified) {
    return (
      <span className="status-pill warning" title="Route has not yet been inspected via Google URL Inspection API">
        <HelpCircle size={12} />
        <span>Never Inspected</span>
      </span>
    );
  }

  return (
    <span className="status-pill uninitialized">
      <span>Unknown</span>
    </span>
  );
}

export function DashboardPages() {
  const { token } = useOutletContext();
  const [pages, setPages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Manual inspection in-flight state by page_id (prevents duplicate clicks)
  const [submittingIds, setSubmittingIds] = useState({});

  // Action feedback banner
  const [feedback, setFeedback] = useState(null);

  // Detail Modal State
  const [selectedPageDetail, setSelectedPageDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('overview'); // 'overview' | 'history' | 'queries'

  const pollingRef = useRef(null);

  const loadPages = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const data = await getPagesApi(token);
      setPages(data.pages || []);
    } catch (err) {
      if (!isSilent) {
        setError(err.message || 'Failed to load monitored pages');
      }
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  // Polite polling loop when any page has an active job in queue
  useEffect(() => {
    const hasActiveJob = pages.some(p => p.is_pending || p.is_processing);

    if (hasActiveJob) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => {
          loadPages(true);
        }, 12000);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [pages, loadPages]);

  // Trigger manual on-demand inspection
  const handleInspectPage = async (pageId, path) => {
    if (submittingIds[pageId]) return;

    setSubmittingIds(prev => ({ ...prev, [pageId]: true }));
    setFeedback(null);

    try {
      const res = await inspectUrlApi(token, pageId);
      setFeedback({
        type: 'success',
        message: `Inspection queued for ${path}. Job ID: ${res.data?.job_id || 'active'}`
      });

      // Optimistic update so user immediately sees pending status
      setPages(prevPages =>
        prevPages.map(p =>
          p.id === pageId
            ? { ...p, is_pending: true, computed_state: 'queued' }
            : p
        )
      );

      // If detail modal is open for this page, update it too
      if (selectedPageDetail && selectedPageDetail.id === pageId) {
        setSelectedPageDetail(prev => ({
          ...prev,
          is_pending: true,
          computed_state: 'queued'
        }));
      }
    } catch (err) {
      if (err.status === 409) {
        setFeedback({
          type: 'warning',
          message: `An inspection job is already active for route ${path}.`
        });
      } else {
        setFeedback({
          type: 'error',
          message: err.message || `Failed to queue inspection for ${path}`
        });
      }
    } finally {
      setSubmittingIds(prev => ({ ...prev, [pageId]: false }));
    }
  };

  const handleOpenDetail = async (pageId) => {
    setIsLoadingDetail(true);
    setDetailError(null);
    setSelectedPageDetail(null);
    setActiveModalTab('overview');

    try {
      const res = await getPagesApi(token, pageId);
      setSelectedPageDetail(res.page || null);
    } catch (err) {
      setDetailError(err.message || 'Failed to load route detail');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const filteredPages = pages.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      (p.path && p.path.toLowerCase().includes(term)) ||
      (p.title && p.title.toLowerCase().includes(term))
    );
  });

  return (
    <div className="pages-view">
      <div className="page-title-row">
        <div>
          <h1 className="page-heading">Monitored Routes</h1>
          <p className="page-subheading">
            Live Google URL Inspection verdicts, crawl coverage, and 30-day performance across Yorven's 9 production routes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <input
              type="text"
              className="form-input"
              style={{ width: '100%', paddingLeft: '34px', fontSize: '13px' }}
              placeholder="Filter by path or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search
              size={15}
              style={{ position: 'absolute', left: '10px', top: '12px', color: '#9cb5af' }}
            />
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadPages(false)}
            title="Refresh monitored routes and inspection statuses"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Action feedback toast/banner */}
      {feedback && (
        <div
          className={`sync-result-box ${
            feedback.type === 'success'
              ? 'result-success'
              : feedback.type === 'warning'
              ? 'result-deferred'
              : 'result-error'
          }`}
          style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {feedback.type === 'success' ? (
              <CheckCircle size={18} className="result-icon success" />
            ) : feedback.type === 'warning' ? (
              <HelpCircle size={18} className="result-icon deferred" />
            ) : (
              <AlertCircle size={18} className="result-icon error" />
            )}
            <span style={{ fontSize: '13px' }}>{feedback.message}</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => setFeedback(null)}
            style={{ padding: '2px' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="sync-result-box result-error" style={{ marginBottom: '24px' }}>
          <AlertCircle size={20} className="result-icon error" />
          <div className="result-text">
            <div className="result-heading">Failed to Load Routes</div>
            <div className="result-paragraph">{error}</div>
            <button type="button" className="btn-secondary" onClick={() => loadPages(false)} style={{ marginTop: '10px' }}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Pages Table */}
      <div className="dashboard-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Route Path</th>
                <th>Page Title</th>
                <th>Google Indexing & Coverage</th>
                <th>Last Crawled (Google)</th>
                <th>Last Inspected</th>
                <th className="table-number">30d Clicks</th>
                <th className="table-number">30d Impressions</th>
                <th className="table-number">30d CTR</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#9cb5af' }}>
                    <div className="dashboard-spinner" style={{ margin: '0 auto 12px' }} />
                    Loading monitored routes from <code>public.seo_monitored_pages_view</code>...
                  </td>
                </tr>
              ) : filteredPages.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#9cb5af' }}>
                    No matching routes found.
                  </td>
                </tr>
              ) : (
                filteredPages.map((page) => {
                  const m30 = page.metrics_30d || {};
                  const isSubmitting = Boolean(submittingIds[page.id]);

                  return (
                    <tr key={page.id}>
                      <td>
                        <span className="table-path">{page.path}</span>
                      </td>
                      <td
                        style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={page.title}
                      >
                        {page.title || '—'}
                      </td>
                      <td>
                        <div>
                          {renderIndexingStatusBadge(page)}
                          {page.coverage_state && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#9cb5af',
                                marginTop: '4px',
                                maxWidth: '200px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={page.coverage_state}
                            >
                              {page.coverage_state}
                            </div>
                          )}
                          {page.inspection_error && !page.is_pending && !page.is_processing && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#ff8080',
                                marginTop: '2px',
                                maxWidth: '200px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={page.inspection_error}
                            >
                              {page.error_code || page.inspection_error}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="table-date" title={page.google_last_crawl_time || 'Not yet reported by Google'}>
                        {page.google_last_crawl_time
                          ? formatDateTime(page.google_last_crawl_time)
                          : page.last_crawled_at
                          ? formatDateOnly(page.last_crawled_at)
                          : 'Not crawled'}
                      </td>
                      <td className="table-date" title={page.last_inspected_at || 'Never inspected'}>
                        {page.last_inspected_at ? formatDateTime(page.last_inspected_at) : 'Never'}
                      </td>
                      <td className="table-number">{m30.clicks !== undefined ? m30.clicks.toLocaleString() : '0'}</td>
                      <td className="table-number">{m30.impressions !== undefined ? m30.impressions.toLocaleString() : '0'}</td>
                      <td className="table-number">
                        {m30.ctr !== undefined && m30.ctr !== null ? `${(Number(m30.ctr) * 100).toFixed(2)}%` : '0.00%'}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            disabled={isSubmitting || page.is_pending || page.is_processing}
                            onClick={() => handleInspectPage(page.id, page.path)}
                            title={
                              page.is_pending
                                ? 'Inspection job is currently queued'
                                : page.is_processing
                                ? 'Inspection is running'
                                : 'Queue live Google URL Inspection'
                            }
                          >
                            {isSubmitting ? (
                              <>
                                <RefreshCw size={11} className="spin" />
                                <span>Queueing...</span>
                              </>
                            ) : page.is_pending ? (
                              <>
                                <Clock size={11} />
                                <span>Queued</span>
                              </>
                            ) : page.is_processing ? (
                              <>
                                <RefreshCw size={11} className="spin" />
                                <span>Inspecting</span>
                              </>
                            ) : (
                              <>
                                <Search size={11} />
                                <span>Inspect</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                            onClick={() => handleOpenDetail(page.id)}
                          >
                            Detail & History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Route Detail & History Modal */}
      {(selectedPageDetail || isLoadingDetail || detailError) && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
          <div className="modal-card" style={{ maxWidth: '780px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <FileText size={20} className="lime" />
                <h2 id="detail-modal-title" className="modal-title">
                  Route Detail: {selectedPageDetail ? selectedPageDetail.path : 'Loading...'}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setSelectedPageDetail(null);
                  setDetailError(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {isLoadingDetail ? (
                <div style={{ textAlign: 'center', padding: '36px' }}>
                  <div className="dashboard-spinner" style={{ margin: '0 auto 12px' }} />
                  <span>Loading route analytics, inspection status, and history...</span>
                </div>
              ) : detailError ? (
                <div className="sync-result-box result-error">
                  <AlertCircle size={20} className="result-icon error" />
                  <div className="result-text">
                    <div className="result-heading">Failed to Load Route Detail</div>
                    <div className="result-paragraph">{detailError}</div>
                  </div>
                </div>
              ) : selectedPageDetail && (
                <>
                  {/* Modal Navigation Sub-tabs */}
                  <div className="modal-tabs">
                    <button
                      type="button"
                      className={`modal-tab-btn ${activeModalTab === 'overview' ? 'active' : ''}`}
                      onClick={() => setActiveModalTab('overview')}
                    >
                      <Search size={14} /> Overview & Technical
                    </button>
                    <button
                      type="button"
                      className={`modal-tab-btn ${activeModalTab === 'history' ? 'active' : ''}`}
                      onClick={() => setActiveModalTab('history')}
                    >
                      <History size={14} /> Inspection History (
                      {Array.isArray(selectedPageDetail.inspection_history)
                        ? selectedPageDetail.inspection_history.length
                        : 0}
                      )
                    </button>
                    <button
                      type="button"
                      className={`modal-tab-btn ${activeModalTab === 'queries' ? 'active' : ''}`}
                      onClick={() => setActiveModalTab('queries')}
                    >
                      <FileText size={14} /> 30d Top Queries (
                      {Array.isArray(selectedPageDetail.top_queries_30d)
                        ? selectedPageDetail.top_queries_30d.length
                        : 0}
                      )
                    </button>
                  </div>

                  {/* TAB 1: OVERVIEW & TECHNICAL */}
                  {activeModalTab === 'overview' && (
                    <>
                      {/* Live Inspection Verdict Header */}
                      <div
                        style={{
                          background: '#051a19',
                          padding: '14px 16px',
                          borderRadius: '2px',
                          border: '1px solid var(--line-dark)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}
                      >
                        <div>
                          <span className="form-label">Google Search Indexing Verdict</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                            {renderIndexingStatusBadge(selectedPageDetail)}
                            {selectedPageDetail.coverage_state && (
                              <span style={{ fontSize: '13px', color: 'var(--cream)' }}>
                                {selectedPageDetail.coverage_state}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-secondary"
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          disabled={
                            submittingIds[selectedPageDetail.id] ||
                            selectedPageDetail.is_pending ||
                            selectedPageDetail.is_processing
                          }
                          onClick={() =>
                            handleInspectPage(selectedPageDetail.id, selectedPageDetail.path)
                          }
                        >
                          {submittingIds[selectedPageDetail.id] ? (
                            <>
                              <RefreshCw size={13} className="spin" />
                              <span>Queueing...</span>
                            </>
                          ) : selectedPageDetail.is_pending ? (
                            <>
                              <Clock size={13} />
                              <span>Job Queued</span>
                            </>
                          ) : selectedPageDetail.is_processing ? (
                            <>
                              <RefreshCw size={13} className="spin" />
                              <span>Inspecting...</span>
                            </>
                          ) : (
                            <>
                              <Search size={13} />
                              <span>Inspect This Route</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Canonical and Description Cards */}
                      <div className="inspection-meta-grid" style={{ marginTop: '12px' }}>
                        <div className="inspection-meta-card">
                          <span className="form-label">Canonical URL</span>
                          <div style={{ wordBreak: 'break-all', fontSize: '12px', marginTop: '4px' }}>
                            <a
                              href={selectedPageDetail.canonical_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--lime)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              {selectedPageDetail.canonical_url} <ExternalLink size={12} />
                            </a>
                          </div>
                        </div>
                        <div className="inspection-meta-card">
                          <span className="form-label">Meta Description</span>
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#9cb5af',
                              marginTop: '4px',
                              fontStyle: selectedPageDetail.meta_description ? 'normal' : 'italic'
                            }}
                          >
                            {selectedPageDetail.meta_description || 'No meta description recorded'}
                          </div>
                        </div>
                      </div>

                      {/* Technical Crawl Details */}
                      <div className="inspection-meta-grid">
                        <div className="inspection-meta-card">
                          <span className="form-label">Google Reported Last Crawl</span>
                          <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--cream)' }}>
                            {formatDateTime(selectedPageDetail.google_last_crawl_time)}
                          </div>
                        </div>
                        <div className="inspection-meta-card">
                          <span className="form-label">Last Inspection Checked</span>
                          <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--cream)' }}>
                            {formatDateTime(selectedPageDetail.last_inspected_at)}
                          </div>
                        </div>
                        <div className="inspection-meta-card">
                          <span className="form-label">Crawled As</span>
                          <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--cream)' }}>
                            {selectedPageDetail.crawled_as || '—'}
                          </div>
                        </div>
                        <div className="inspection-meta-card">
                          <span className="form-label">Robots.txt State</span>
                          <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--cream)' }}>
                            {selectedPageDetail.robots_txt_state || '—'}
                          </div>
                        </div>
                        <div className="inspection-meta-card">
                          <span className="form-label">Page Fetch State</span>
                          <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--cream)' }}>
                            {selectedPageDetail.page_fetch_state || '—'}
                          </div>
                        </div>
                        <div className="inspection-meta-card">
                          <span className="form-label">Indexing State</span>
                          <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--cream)' }}>
                            {selectedPageDetail.indexing_state || '—'}
                          </div>
                        </div>
                      </div>

                      {selectedPageDetail.inspection_error && (
                        <div className="sync-result-box result-error">
                          <AlertTriangle size={18} className="result-icon error" />
                          <div className="result-text">
                            <div className="result-heading">
                              Inspection Error ({selectedPageDetail.error_code || 'ERROR'})
                            </div>
                            <div className="result-paragraph">{selectedPageDetail.inspection_error}</div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* TAB 2: INSPECTION HISTORY */}
                  {activeModalTab === 'history' && (
                    <div>
                      {!selectedPageDetail.inspection_history || selectedPageDetail.inspection_history.length === 0 ? (
                        <div className="chart-empty-state" style={{ height: '140px' }}>
                          <span>No previous inspection history records found for this route.</span>
                        </div>
                      ) : (
                        <div className="table-responsive">
                          <table className="dashboard-table">
                            <thead>
                              <tr>
                                <th>Inspected At</th>
                                <th>Status / Verdict</th>
                                <th>Coverage State</th>
                                <th>Google Crawl Time</th>
                                <th>Robots / Fetch</th>
                                <th>Error / Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedPageDetail.inspection_history.map((record) => {
                                const isSuccess = record.attempt_status === 'success';

                                return (
                                  <tr key={record.id}>
                                    <td className="table-date">{formatDateTime(record.inspected_at)}</td>
                                    <td>
                                      {isSuccess ? (
                                        record.verdict === 'PASS' ? (
                                          <span className="status-pill complete">
                                            <CheckCircle size={11} />
                                            <span>PASS</span>
                                          </span>
                                        ) : record.verdict === 'NEUTRAL' ? (
                                          <span className="status-pill warning">
                                            <HelpCircle size={11} />
                                            <span>NEUTRAL</span>
                                          </span>
                                        ) : (
                                          <span className="status-pill failed">
                                            <AlertCircle size={11} />
                                            <span>FAIL</span>
                                          </span>
                                        )
                                      ) : (
                                        <span className="status-pill failed">
                                          <AlertTriangle size={11} />
                                          <span>FAILED</span>
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ fontSize: '12px' }}>{record.coverage_state || '—'}</td>
                                    <td className="table-date">
                                      {record.google_last_crawl_time
                                        ? formatDateTime(record.google_last_crawl_time)
                                        : '—'}
                                    </td>
                                    <td style={{ fontSize: '11px', color: '#9cb5af' }}>
                                      {record.robots_txt_state && record.page_fetch_state
                                        ? `${record.robots_txt_state} / ${record.page_fetch_state}`
                                        : record.robots_txt_state || record.page_fetch_state || '—'}
                                    </td>
                                    <td style={{ fontSize: '11px', color: record.error_message ? '#ff8080' : '#9cb5af' }}>
                                      {record.error_message || record.error_code || 'None'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: TOP QUERIES */}
                  {activeModalTab === 'queries' && (
                    <div>
                      {!selectedPageDetail.top_queries_30d || selectedPageDetail.top_queries_30d.length === 0 ? (
                        <div className="chart-empty-state" style={{ height: '140px' }}>
                          <span>No search query metrics recorded for this route in the past 30 days.</span>
                        </div>
                      ) : (
                        <div className="table-responsive">
                          <table className="dashboard-table">
                            <thead>
                              <tr>
                                <th>Search Query</th>
                                <th className="table-number">Clicks</th>
                                <th className="table-number">Impressions</th>
                                <th className="table-number">CTR</th>
                                <th className="table-number">Avg Position</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedPageDetail.top_queries_30d.map((q, idx) => (
                                <tr key={`${q.query}-${idx}`}>
                                  <td style={{ fontFamily: 'var(--mono, monospace)', color: 'var(--lime)' }}>
                                    {q.query}
                                  </td>
                                  <td className="table-number">{q.clicks}</td>
                                  <td className="table-number">{q.impressions}</td>
                                  <td className="table-number">{(Number(q.ctr) * 100).toFixed(2)}%</td>
                                  <td className="table-number">{Number(q.position).toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSelectedPageDetail(null);
                  setDetailError(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
