/**
 * Centralized Dashboard API Client
 * Yorven SEO Dashboard — Phase 2 Step 2.4
 * Follows Revision 11 Final Architecture strictly.
 *
 * Enforces:
 * - Mandatory CSRF header: X-Requested-With: Yorven-Control
 * - Same-origin credentials for HttpOnly cookies (__Host-yorven-refresh, __Host-yorven-mfa)
 * - In-memory Bearer token dispatch on protected SEO endpoints
 * - Consistent error handling without leaking server internals
 */

const CSRF_HEADER_NAME = 'X-Requested-With';
const CSRF_HEADER_VALUE = 'Yorven-Control';

/**
 * Base fetch wrapper enforcing security headers and credentials.
 */
export async function apiRequest(endpoint, { method = 'GET', body = null, token = null, headers = {} } = {}) {
  const requestHeaders = {
    [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
    ...headers
  };

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json';
    requestHeaders['Accept'] = 'application/json';
  }

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers: requestHeaders,
    credentials: 'same-origin'
  };

  if (body) {
    options.body = typeof body === 'object' && !(body instanceof FormData) ? JSON.stringify(body) : body;
  }

  let res;
  try {
    res = await fetch(endpoint, options);
  } catch (netErr) {
    throw new Error('Network error: unable to reach the server. Please check your connection.');
  }

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    headers: res.headers
  };
}

// ============================================================================
// Authentication API
// ============================================================================

export async function loginApi(email, password) {
  const res = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password }
  });

  if (!res.ok) {
    const errorMsg = res.data?.message || res.data?.error || 'Invalid credentials or login failed';
    const err = new Error(errorMsg);
    err.status = res.status;
    err.code = res.data?.error || 'LOGIN_FAILED';
    throw err;
  }

  return res.data; // { mfaRequired: true, factorId, challengeId }
}

export async function mfaVerifyApi(code) {
  const res = await apiRequest('/api/auth/mfa-verify', {
    method: 'POST',
    body: { code }
  });

  if (!res.ok) {
    const errorMsg = res.data?.message || res.data?.error || 'MFA verification failed';
    const err = new Error(errorMsg);
    err.status = res.status;
    err.code = res.data?.error || 'MFA_FAILED';
    throw err;
  }

  return res.data; // { accessToken, expiresIn }
}

export async function getActiveTokenApi() {
  const res = await apiRequest('/api/auth/token', {
    method: 'GET'
  });

  if (!res.ok) {
    return { ok: false, status: res.status, error: res.data?.error || 'UNAUTHORIZED' };
  }

  return { ok: true, ...res.data }; // { accessToken, expiresIn } OR { status: 'refresh_in_progress' } OR { status: 'refresh_required' }
}

export async function refreshTokenApi() {
  const res = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    body: {}
  });

  if (!res.ok) {
    const err = new Error(res.data?.message || res.data?.error || 'Session refresh failed');
    err.status = res.status;
    err.code = res.data?.error || 'REFRESH_FAILED';
    throw err;
  }

  return res.data; // { accessToken, expiresIn }
}

export async function logoutApi() {
  try {
    await apiRequest('/api/auth/logout', {
      method: 'POST',
      body: {}
    });
  } catch {
    // Best-effort logout
  }
}

// ============================================================================
// SEO Dashboard Endpoints
// ============================================================================

export async function getOverviewApi(token, startDate, endDate) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiRequest(`/api/seo/overview${query}`, {
    method: 'GET',
    token
  });

  if (!res.ok) {
    const err = new Error(res.data?.message || res.data?.error || 'Failed to load SEO overview');
    err.status = res.status;
    throw err;
  }

  return res.data;
}

export async function getPagesApi(token, pageId = null) {
  const query = pageId ? `?id=${encodeURIComponent(pageId)}` : '';
  const res = await apiRequest(`/api/seo/pages${query}`, {
    method: 'GET',
    token
  });

  if (!res.ok) {
    const err = new Error(res.data?.message || res.data?.error || 'Failed to load monitored pages');
    err.status = res.status;
    throw err;
  }

  return res.data;
}

export async function getMetricsApi(token, startDate, endDate, pageId = null) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (pageId) params.set('page_id', pageId);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiRequest(`/api/seo/metrics${query}`, {
    method: 'GET',
    token
  });

  if (!res.ok) {
    const err = new Error(res.data?.message || res.data?.error || 'Failed to load historical metrics');
    err.status = res.status;
    throw err;
  }

  return res.data;
}

export async function triggerSyncApi(token, jobType = 'full_resync') {
  const res = await apiRequest('/api/seo/sync', {
    method: 'POST',
    body: { job_type: jobType },
    token
  });

  if (res.status === 202) {
    return {
      status: 202,
      enqueued: true,
      data: res.data
    };
  }

  if (res.status === 200) {
    return {
      status: 200,
      enqueued: false,
      data: res.data
    };
  }

  const err = new Error(res.data?.message || res.data?.error || `Synchronization failed with HTTP ${res.status}`);
  err.status = res.status;
  err.data = res.data;
  throw err;
}

export async function getStatusApi(token) {
  const res = await apiRequest('/api/seo/status', {
    method: 'GET',
    token
  });

  if (!res.ok) {
    const err = new Error(res.data?.message || res.data?.error || 'Failed to load sync status');
    err.status = res.status;
    throw err;
  }

  return res.data;
}
