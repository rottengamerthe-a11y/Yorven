import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FileText,
  Search,
  ExternalLink,
  CheckCircle,
  HelpCircle,
  X,
  TrendingUp,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { getPagesApi } from '../api/dashboardClient.js';
import '../components/dashboard.css';

export function DashboardPages() {
  const { token } = useOutletContext();
  const [pages, setPages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Detail Modal State
  const [selectedPageDetail, setSelectedPageDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const loadPages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPagesApi(token);
      setPages(data.pages || []);
    } catch (err) {
      setError(err.message || 'Failed to load monitored pages');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const handleOpenDetail = async (pageId) => {
    setIsLoadingDetail(true);
    setDetailError(null);
    setSelectedPageDetail(null);

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
            Crawl status and 30-day performance summaries across Yorven's 9 production routes.
          </p>
        </div>

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
      </div>

      {error && (
        <div className="sync-result-box result-error" style={{ marginBottom: '24px' }}>
          <AlertCircle size={20} className="result-icon error" />
          <div className="result-text">
            <div className="result-heading">Failed to Load Routes</div>
            <div className="result-paragraph">{error}</div>
            <button type="button" className="btn-secondary" onClick={loadPages} style={{ marginTop: '10px' }}>
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
                <th>Indexing Status</th>
                <th>Last Crawled</th>
                <th className="table-number">30d Clicks</th>
                <th className="table-number">30d Impressions</th>
                <th className="table-number">30d CTR</th>
                <th className="table-number">30d Sessions</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#9cb5af' }}>
                    <div className="dashboard-spinner" style={{ margin: '0 auto 12px' }} />
                    Loading monitored routes from <code>public.seo_pages</code>...
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
                  const isVerified = Boolean(page.indexing_status_verified);

                  return (
                    <tr key={page.id}>
                      <td>
                        <span className="table-path">{page.path}</span>
                      </td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={page.title}>
                        {page.title || '—'}
                      </td>
                      <td>
                        {!isVerified || page.is_indexed === null ? (
                          <span
                            className="status-pill warning"
                            title="Live URL Inspection API integration is scheduled for Phase 2 Step 2.9"
                          >
                            <HelpCircle size={12} />
                            <span>Deferred (Step 2.9)</span>
                          </span>
                        ) : page.is_indexed ? (
                          <span className="status-pill complete">
                            <CheckCircle size={12} />
                            <span>Indexed</span>
                          </span>
                        ) : (
                          <span className="status-pill failed">
                            <span>Not Indexed</span>
                          </span>
                        )}
                      </td>
                      <td className="table-date">
                        {page.last_crawled_at
                          ? String(page.last_crawled_at).slice(0, 10)
                          : 'Pending Inspection'}
                      </td>
                      <td className="table-number">{m30.clicks !== undefined ? m30.clicks.toLocaleString() : '0'}</td>
                      <td className="table-number">{m30.impressions !== undefined ? m30.impressions.toLocaleString() : '0'}</td>
                      <td className="table-number">
                        {m30.ctr !== undefined && m30.ctr !== null ? `${(Number(m30.ctr) * 100).toFixed(2)}%` : '0.00%'}
                      </td>
                      <td className="table-number">{m30.landing_sessions !== undefined ? m30.landing_sessions.toLocaleString() : '0'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={() => handleOpenDetail(page.id)}
                        >
                          Queries & Detail
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Page Detail Modal (Top Queries Drilldown) */}
      {(selectedPageDetail || isLoadingDetail || detailError) && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
          <div className="modal-card" style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <FileText size={20} className="lime" />
                <h2 id="detail-modal-title" className="modal-title">
                  Route Performance: {selectedPageDetail ? selectedPageDetail.path : 'Loading...'}
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

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {isLoadingDetail ? (
                <div style={{ textAlign: 'center', padding: '36px' }}>
                  <div className="dashboard-spinner" style={{ margin: '0 auto 12px' }} />
                  <span>Loading route analytics and queries...</span>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ background: '#051a19', padding: '12px', borderRadius: '2px', border: '1px solid var(--line-dark)' }}>
                      <span className="form-label">Canonical URL</span>
                      <div style={{ wordBreak: 'break-all', fontSize: '12px', marginTop: '4px' }}>
                        <a href={selectedPageDetail.canonical_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--lime)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {selectedPageDetail.canonical_url} <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                    <div style={{ background: '#051a19', padding: '12px', borderRadius: '2px', border: '1px solid var(--line-dark)' }}>
                      <span className="form-label">Meta Description</span>
                      <div style={{ fontSize: '12px', color: '#9cb5af', marginTop: '4px', fontStyle: selectedPageDetail.meta_description ? 'normal' : 'italic' }}>
                        {selectedPageDetail.meta_description || 'No meta description recorded'}
                      </div>
                    </div>
                  </div>

                  {/* 30-day Top Queries Table */}
                  <h3 style={{ fontSize: '14px', fontWeight: '700', margin: '16px 0 8px', color: 'var(--cream)' }}>
                    Top Search Queries (Past 30 Days)
                  </h3>

                  {(!selectedPageDetail.top_queries_30d || selectedPageDetail.top_queries_30d.length === 0) ? (
                    <div className="chart-empty-state" style={{ height: '120px' }}>
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
                              <td style={{ fontFamily: 'var(--mono, monospace)', color: 'var(--lime)' }}>{q.query}</td>
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
