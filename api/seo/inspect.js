/**
 * POST /api/seo/inspect
 * On-demand Single URL Inspection queue endpoint for Yorven SEO Dashboard.
 * Requires Owner AAL2 JWT, Origin validation, and CSRF header.
 * Enqueues a 'url_inspection_single' job in public.seo_sync_jobs (status = 'pending').
 * Follows Frozen Architecture (Revision 11 Final) strictly.
 */

import { getDatabaseAdapter } from '../auth/_utils.js';
import { authorizeOwnerRequest, setSeoSecurityHeaders } from './_auth.js';
import { createSyncJob, loadMonitoredPages } from './_sync_service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORBIDDEN_URL_FIELDS = ['url', 'inspection_url', 'inspectionUrl', 'site_url', 'siteUrl'];

export default async function handler(req, res) {
  setSeoSecurityHeaders(res);

  // 1. Strict POST-only enforcement
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST is permitted on /api/seo/inspect'
    });
  }

  // 2. Owner-only authorization (Origin, CSRF, JWT, AAL2, DB owner role)
  const authResult = await authorizeOwnerRequest(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({
      error: authResult.error,
      message: authResult.message
    });
  }

  // 3. Parse and validate JSON request body
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Request body must be valid JSON'
      });
    }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Request body must be a JSON object'
    });
  }

  // 4. Reject client-supplied arbitrary URL fields
  for (const field of FORBIDDEN_URL_FIELDS) {
    if (field in body) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: "Arbitrary URL fields are not permitted. Provide only 'page_id'."
      });
    }
  }

  // 5. Validate page_id UUID format
  const pageId = body.page_id;
  if (!pageId || typeof pageId !== 'string' || !UUID_REGEX.test(pageId)) {
    return res.status(400).json({
      error: 'INVALID_PAGE_ID',
      message: "Missing or invalid 'page_id' (must be a valid UUID)"
    });
  }

  const db = getDatabaseAdapter();

  try {
    // 6. Verify page exists and is an eligible monitored route in database registry
    const { pages } = await loadMonitoredPages(db);
    const page = pages.find((p) => p.id === pageId);
    if (!page) {
      return res.status(404).json({
        error: 'PAGE_NOT_FOUND',
        message: `No monitored route found with ID ${pageId}`
      });
    }

    // 7. Enqueue single URL inspection job (status = 'pending')
    const jobId = await createSyncJob(db, 'url_inspection_single', 3, { page_id: page.id });

    // 8. Return HTTP 202 Accepted
    return res.status(202).json({
      success: true,
      job_id: jobId,
      job_type: 'url_inspection_single',
      status: 'pending',
      message: 'URL inspection job has been queued successfully'
    });
  } catch (err) {
    // 9. Handle database active conflict index (uq_seo_sync_jobs_active_inspection_single)
    if (
      err?.status === 409 ||
      err?.data?.code === '23505' ||
      err?.message?.includes('409') ||
      err?.message?.includes('duplicate key') ||
      err?.message?.includes('unique constraint') ||
      err?.message?.includes('uq_seo_sync_jobs_active_inspection_single')
    ) {
      return res.status(409).json({
        error: 'CONFLICT_ACTIVE_JOB',
        message: `An inspection job is already active for route ID ${pageId}`
      });
    }

    // 10. Sanitized internal error (never leak credentials or database details)
    console.error('[Inspect Endpoint Error]', err?.message || err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to enqueue inspection job'
    });
  }
}
