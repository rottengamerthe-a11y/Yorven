import 'dotenv/config';

export const TARGET_ORIGIN = 'https://yorven.in';
export const TARGET_HOSTNAME = 'yorven.in';
export const MAX_QUEUE_DEPTH = 4;
export const MAX_QUEUE_PAGES = 100;
export const MAX_BODY_BYTES = 500 * 1024; // 500 KB limit
export const HTTP_TIMEOUT_MS = 10000;     // 10s timeout
export const MAX_REDIRECT_HOPS = 5;

export function loadConfig(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const workerId = env.WORKER_ID?.trim();

  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!workerId) missing.push('WORKER_ID');

  if (missing.length > 0) {
    throw new Error(`Missing required worker environment variable(s): ${missing.join(', ')}`);
  }

  // Validate URL format
  try {
    const parsed = new URL(supabaseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Invalid protocol for SUPABASE_URL: ${parsed.protocol}`);
    }
  } catch (err) {
    throw new Error(`Invalid SUPABASE_URL format: ${err.message}`);
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    workerId,
    targetOrigin: TARGET_ORIGIN,
    targetHostname: TARGET_HOSTNAME,
    maxBodyBytes: MAX_BODY_BYTES,
    httpTimeoutMs: HTTP_TIMEOUT_MS,
    maxRedirectHops: MAX_REDIRECT_HOPS
  };
}

export function redact(text, sensitiveValues = []) {
  if (typeof text !== 'string') {
    text = String(text ?? '');
  }
  let sanitized = text;
  for (const val of sensitiveValues) {
    if (val && typeof val === 'string' && val.length > 5) {
      sanitized = sanitized.replaceAll(val, '[REDACTED]');
    }
  }
  // Generic JWT token pattern redaction: eyJ...
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]');
  return sanitized;
}

export function createLogger(sensitiveValues = []) {
  const sanitize = (args) => args.map(arg => {
    if (typeof arg === 'string') return redact(arg, sensitiveValues);
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.parse(redact(JSON.stringify(arg), sensitiveValues));
      } catch {
        return arg;
      }
    }
    return arg;
  });

  return {
    info: (...args) => console.log(...sanitize(args)),
    warn: (...args) => console.warn(...sanitize(args)),
    error: (...args) => console.error(...sanitize(args)),
    debug: (...args) => {
      if (process.env.DEBUG) console.debug(...sanitize(args));
    }
  };
}
