/**
 * Serverless Contact Handler: /api/contact
 * Handles studio alert dispatch (Discord Webhook) exclusively on the server side.
 * Server credentials remain strictly private and are never exposed to clients.
 */

import net from 'node:net';
import { validateOrigin, validateCsrf, setSecurityHeaders } from './auth/_utils.js';

// In-memory rate limiting: ip -> array of timestamps (fallback when DB is offline)
export const ipRateLimitMap = new Map();
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_REQUESTS_PER_WINDOW = 5;
export const MAX_MEMORY_ENTRIES = 5000;

/**
 * Prunes expired timestamp entries from the in-memory fallback map.
 */
export function pruneExpiredMemoryEntries(now = Date.now()) {
  for (const [key, timestamps] of ipRateLimitMap.entries()) {
    const active = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (active.length === 0) {
      ipRateLimitMap.delete(key);
    }
  }
}

export function isMemoryRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const existing = ipRateLimitMap.get(ip);
  const timestamps = (existing || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    // Refresh LRU position without growing the array beyond MAX_REQUESTS_PER_WINDOW
    ipRateLimitMap.delete(ip);
    ipRateLimitMap.set(ip, timestamps);
    return true;
  }

  // Not rate limited: add current timestamp (strictly bounded to <= MAX_REQUESTS_PER_WINDOW)
  timestamps.push(now);

  // If map is at maximum capacity and this is a new IP, prune expired entries first
  if (!ipRateLimitMap.has(ip) && ipRateLimitMap.size >= MAX_MEMORY_ENTRIES) {
    pruneExpiredMemoryEntries(now);
  }

  // If still at capacity, evict the oldest (LRU) entry
  if (!ipRateLimitMap.has(ip) && ipRateLimitMap.size >= MAX_MEMORY_ENTRIES) {
    const oldestKey = ipRateLimitMap.keys().next().value;
    if (oldestKey !== undefined) {
      ipRateLimitMap.delete(oldestKey);
    }
  }

  // Refresh LRU order with updated timestamps
  ipRateLimitMap.delete(ip);
  ipRateLimitMap.set(ip, timestamps);
  return false;
}

/**
 * Atomic rate limiting via existing Supabase PostgreSQL infrastructure.
 * Gracefully falls back to memory if database is unconfigured, unreachable, or returns an error.
 * Emits structured, sanitized telemetry on fallback without logging sensitive data.
 */
export async function checkAtomicRateLimit(ip) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[Contact API] Rate limit check failed, falling back to memory:', JSON.stringify({
      event: 'contact_rate_limit_fallback',
      category: 'configuration_error'
    }));
    return null;
  }
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/check_and_increment_rate_limit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Profile': 'auth_util',
        'Accept-Profile': 'auth_util'
      },
      body: JSON.stringify({
        p_ip: ip,
        p_window_ms: RATE_LIMIT_WINDOW_MS,
        p_max_requests: MAX_REQUESTS_PER_WINDOW
      }),
      signal: AbortSignal.timeout(2500)
    });

    if (!res.ok) {
      let code;
      try {
        const errorBody = await res.json();
        if (errorBody && typeof errorBody.code === 'string' && /^[A-Za-z0-9]{1,10}$/.test(errorBody.code)) {
          code = errorBody.code;
        }
      } catch {
        // Body not JSON or unreadable
      }

      console.warn('[Contact API] Rate limit check failed, falling back to memory:', JSON.stringify({
        event: 'contact_rate_limit_fallback',
        category: 'http_error',
        status: res.status,
        ...(code ? { code } : {})
      }));
      return null;
    }

    let isAllowed;
    try {
      isAllowed = await res.json();
    } catch {
      console.warn('[Contact API] Rate limit check failed, falling back to memory:', JSON.stringify({
        event: 'contact_rate_limit_fallback',
        category: 'malformed_response'
      }));
      return null;
    }

    if (typeof isAllowed !== 'boolean') {
      console.warn('[Contact API] Rate limit check failed, falling back to memory:', JSON.stringify({
        event: 'contact_rate_limit_fallback',
        category: 'malformed_response'
      }));
      return null;
    }

    return isAllowed;
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    console.warn('[Contact API] Rate limit check failed, falling back to memory:', JSON.stringify({
      event: 'contact_rate_limit_fallback',
      category: isTimeout ? 'timeout' : 'network_error'
    }));
    return null;
  }
}

/**
 * Extracts and strictly validates the verified client IP using trusted Vercel edge proxy metadata.
 * Priority:
 * 1. x-vercel-forwarded-for (Vercel-managed platform forwarded header)
 * 2. x-real-ip (Single client IP set by Vercel edge)
 * 3. x-forwarded-for (Overwritten and managed by Vercel edge; first IP is client)
 * 4. Socket remote address (local development fallback)
 *
 * Strict validation: Every candidate address is parsed and verified using built-in node:net.isIP().
 * Malformed tokens, non-IP strings, and spoof attempts are rejected.
 * Unresolvable callers deliberately fall back to 'unknown'.
 */
export function getTrustedClientIp(req) {
  const headers = req?.headers || {};

  const parseValidIp = (headerVal) => {
    if (typeof headerVal !== 'string') return null;
    const candidate = headerVal.split(',')[0].trim();
    return net.isIP(candidate) !== 0 ? candidate : null;
  };

  // 1. Vercel platform-specific forwarded header
  const vercelForwarded = parseValidIp(headers['x-vercel-forwarded-for']);
  if (vercelForwarded) return vercelForwarded;

  // 2. Vercel real-ip header
  const realIp = parseValidIp(headers['x-real-ip']);
  if (realIp) return realIp;

  // 3. Standard x-forwarded-for (overwritten and managed by Vercel edge)
  const xForwardedFor = parseValidIp(headers['x-forwarded-for']);
  if (xForwardedFor) return xForwardedFor;

  // 4. Socket remote address (local development fallback)
  const socketIp = req?.socket?.remoteAddress;
  if (typeof socketIp === 'string') {
    const trimmedSocket = socketIp.trim();
    if (net.isIP(trimmedSocket) !== 0) {
      return trimmedSocket;
    }
  }

  return 'unknown';
}

/**
 * Sanitizes user-supplied text for safe interpolation in Discord embeds.
 * Suppresses mention injection and zero-width spaces.
 */
export function sanitizeForDiscord(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/@everyone/gi, '@\u200Beveryone')
    .replace(/@here/gi, '@\u200Bhere');
}

export const MAX_DISCORD_DESC_LENGTH = 4000;

/**
 * Truncates description exclusively for the Discord notification embed to strictly stay
 * within Discord's 4,096 embed description limit, while preserving the full inquiry.
 */
export function formatDiscordDescription(text) {
  if (typeof text !== 'string') return '';
  if (text.length <= MAX_DISCORD_DESC_LENGTH) {
    return text;
  }
  return text.slice(0, MAX_DISCORD_DESC_LENGTH - 20) + '\n... [truncated]';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Origin and CSRF validation
  if (!validateOrigin(req)) {
    return res.status(403).json({ error: 'Invalid or missing origin' });
  }

  if (!validateCsrf(req)) {
    return res.status(403).json({ error: 'Missing required custom header' });
  }

  // 2. Client IP determination via trusted Vercel edge headers
  const clientIp = getTrustedClientIp(req);

  // 3. Rate limiting (Atomic database check with in-memory fallback)
  const dbAllowed = await checkAtomicRateLimit(clientIp);
  if (dbAllowed === false) {
    return res.status(429).json({ error: 'Too many requests. Please wait a few minutes before trying again.' });
  } else if (dbAllowed === null) {
    if (isMemoryRateLimited(clientIp)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes before trying again.' });
    }
  }

  const { name, business, email, type, budget, timeline, description, website } = req.body || {};

  // 4. Honeypot check for automated spam bots
  if (website) {
    return res.status(200).json({ success: true, message: 'Filtered' });
  }

  // 5. Required fields validation
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }

  const cleanName = sanitizeForDiscord(name.trim());
  const cleanEmail = email.trim();
  const cleanDesc = sanitizeForDiscord(description.trim());
  const cleanBusiness = sanitizeForDiscord((business || '').trim());
  const cleanType = (type || 'Custom Software').trim();
  const cleanBudget = (budget || 'Not specified').trim();
  const cleanTimeline = (timeline || 'Not specified').trim();

  // 6. Format and length bounds
  if (!EMAIL_REGEX.test(cleanEmail)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }
  if (cleanName.length > 100) {
    return res.status(400).json({ error: 'Name exceeds maximum length of 100 characters' });
  }
  if (cleanEmail.length > 120) {
    return res.status(400).json({ error: 'Email exceeds maximum length of 120 characters' });
  }
  if (cleanBusiness.length > 100) {
    return res.status(400).json({ error: 'Business name exceeds maximum length of 100 characters' });
  }
  if (cleanDesc.length > 5000) {
    return res.status(400).json({ error: 'Description exceeds maximum length of 5000 characters' });
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!discordUrl) {
    console.warn('[Contact API] DISCORD_WEBHOOK_URL not configured on server.');
    return res.status(500).json({ error: 'Studio alert integration not configured. Please email projects@yorven.in.' });
  }

  try {
    const discordPayload = {
      username: 'Yorven Studio Leads',
      content: '🚨 **New Lead Alert: Call Request Received!**',
      // Strict mention suppression: never ping @everyone, @here, roles, or users
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: `New Project Booking: ${cleanName}`,
          description: formatDiscordDescription(cleanDesc),
          color: 556104, // #087c48
          fields: [
            { name: '👤 Client Name', value: cleanName, inline: true },
            { name: '🏢 Venture / Business', value: cleanBusiness || 'Not specified', inline: true },
            { name: '✉️ Work Email', value: `[${cleanEmail}](mailto:${cleanEmail})`, inline: true },
            { name: '🛠️ Project Focus', value: cleanType, inline: true },
            { name: '💰 Budget Bracket', value: cleanBudget, inline: true },
            { name: '⏱️ Target Timeline', value: cleanTimeline, inline: true }
          ],
          footer: { text: 'Yorven Client Intake • yorven.in' },
          timestamp: new Date().toISOString()
        }
      ]
    };

    const discordRes = await fetch(discordUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload),
      signal: AbortSignal.timeout(5000)
    });

    if (discordRes.ok || discordRes.status === 204) {
      return res.status(200).json({ success: true, message: 'Studio notification recorded' });
    }

    console.error('[Contact API] Discord webhook returned non-OK status:', discordRes.status);
    return res.status(502).json({ error: 'Studio notification delivery failed.' });
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    if (isTimeout) {
      console.error('[Contact API] Discord dispatch timeout error');
      return res.status(504).json({ error: 'Studio notification delivery timed out.' });
    }
    // Safe logging: Never log raw URL, credential tokens, or sensitive error internals
    console.error('[Contact API] Discord dispatch network error');
    return res.status(500).json({ error: 'Network error connecting to studio notification channel.' });
  }
}
