import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import net from 'node:net';
import { TARGET_ORIGIN, TARGET_HOSTNAME, MAX_BODY_BYTES, HTTP_TIMEOUT_MS, MAX_REDIRECT_HOPS } from '../config.js';
import { resolveAndVerifyDns, createPinnedLookup, isProhibitedIp } from './ssrf.js';

export class SafeHttpFetcher {
  /**
   * @param {object} [options]
   * @param {boolean} [options.allowLocalTest=false] Flag exclusively for local test harness
   * @param {Function} [options.dnsLookupFn] Optional DNS lookup function for test dependency injection
   */
  constructor(options = {}) {
    this.allowLocalTest = options.allowLocalTest ?? (process.env.NODE_ENV === 'test' && process.env.ALLOW_LOCAL_TEST_IPS === 'true');
    this.dnsLookupFn = options.dnsLookupFn;
  }

  /**
   * Validates that a target URL is strictly https://yorven.in (or permitted local test origin in test mode).
   */
  validateTargetUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error('INVALID_URL: URL must be a non-empty string');
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (err) {
      throw new Error(`INVALID_URL_SYNTAX: ${err.message}`);
    }

    if (this.allowLocalTest && parsed.hostname === '127.0.0.1') {
      return parsed;
    }

    if (parsed.protocol !== 'https:') {
      throw new Error(`DISALLOWED_SCHEME: Only HTTPS is permitted, got '${parsed.protocol}'`);
    }

    if (parsed.hostname !== TARGET_HOSTNAME) {
      throw new Error(`EXTERNAL_HOST_DISALLOWED: Only '${TARGET_HOSTNAME}' is allowed, got '${parsed.hostname}'`);
    }

    if (parsed.username || parsed.password) {
      throw new Error('USERINFO_DISALLOWED: User credentials in URL are prohibited');
    }

    return parsed;
  }

  /**
   * Executes a single HTTP/HTTPS request using a pinned socket connector.
   * Ensures that TLS SNI and Host headers match the hostname, while socket
   * connection is strictly locked to the pre-verified IP, preventing DNS rebinding.
   *
   * @private
   */
  _executeRequest({ parsedUrl, pinnedIp, verifiedIps }) {
    return new Promise((resolve, reject) => {
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;
      const port = parsedUrl.port || (isHttps ? 443 : 80);

      let settled = false;
      let timeoutId = null;

      const finishReject = (err) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        reject(err);
      };

      const finishResolve = (val) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve(val);
      };

      const reqOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'GET',
        headers: {
          'User-Agent': 'YorvenSEO-AuditBot/1.0 (+https://yorven.in/robots.txt)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8,text/plain;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Host': parsedUrl.host
        }
      };

      if (!this.allowLocalTest && pinnedIp) {
        reqOptions.lookup = createPinnedLookup(pinnedIp);
      }

      if (isHttps) {
        reqOptions.servername = parsedUrl.hostname; // TLS SNI
        reqOptions.rejectUnauthorized = true;
      }

      const req = transport.request(reqOptions, (res) => {
        // Double-check socket remote address on response
        const socketRemote = res.socket?.remoteAddress;
        if (socketRemote && !this.allowLocalTest) {
          if (isProhibitedIp(socketRemote)) {
            const ssrfErr = new Error(`SSRF_PROHIBITED_DESTINATION: Response socket remote address '${socketRemote}' is prohibited`);
            ssrfErr.code = 'ERR_SSRF_PROHIBITED';
            res.socket?.destroy(ssrfErr);
            finishReject(ssrfErr);
            return;
          }
          if (pinnedIp && socketRemote !== pinnedIp && !verifiedIps.includes(socketRemote)) {
            const unpinnedErr = new Error(`SSRF_UNPINNED_IP: Response socket remote address '${socketRemote}' does not match pinned IP '${pinnedIp}'`);
            unpinnedErr.code = 'ERR_SSRF_UNPINNED';
            res.socket?.destroy(unpinnedErr);
            finishReject(unpinnedErr);
            return;
          }
        }

        const status = res.statusCode;
        const headers = new Headers(res.headers);
        const isRedirect = [301, 302, 307, 308].includes(status);

        if (isRedirect) {
          res.resume(); // Drain redirect response body
          finishResolve({
            isRedirect: true,
            status,
            headers,
            location: res.headers.location
          });
          return;
        }

        // Handle body streaming with byte limit and optional decompression
        let rawBytesRead = 0;
        let decompressedBytesRead = 0;
        let bodyText = '';
        const decoder = new TextDecoder('utf-8');

        // Track raw network bytes
        res.on('data', (chunk) => {
          rawBytesRead += chunk.length;
          if (rawBytesRead > MAX_BODY_BYTES) {
            const sizeErr = new Error(`PAYLOAD_TOO_LARGE: Response body exceeded limit of ${MAX_BODY_BYTES} bytes`);
            sizeErr.code = 'PAYLOAD_TOO_LARGE';
            res.destroy(sizeErr);
            req.destroy(sizeErr);
            finishReject(sizeErr);
          }
        });

        // Setup decompression stream if compressed
        let stream = res;
        const encoding = (res.headers['content-encoding'] || '').trim().toLowerCase();
        let decompressor = null;
        if (encoding === 'gzip') {
          decompressor = zlib.createGunzip();
        } else if (encoding === 'deflate') {
          decompressor = zlib.createInflate();
        } else if (encoding === 'br') {
          decompressor = zlib.createBrotliDecompress();
        }

        if (decompressor) {
          decompressor.on('error', (err) => {
            finishReject(err);
          });
          stream = res.pipe(decompressor);
        }

        stream.on('data', (chunk) => {
          decompressedBytesRead += chunk.length;
          if (decompressedBytesRead > MAX_BODY_BYTES) {
            const sizeErr = new Error(`PAYLOAD_TOO_LARGE: Response body exceeded limit of ${MAX_BODY_BYTES} bytes`);
            sizeErr.code = 'PAYLOAD_TOO_LARGE';
            if (decompressor) decompressor.destroy(sizeErr);
            res.destroy(sizeErr);
            req.destroy(sizeErr);
            finishReject(sizeErr);
            return;
          }
          bodyText += decoder.decode(chunk, { stream: true });
        });

        stream.on('end', () => {
          bodyText += decoder.decode(); // flush
          finishResolve({
            isRedirect: false,
            status,
            body: bodyText,
            headers
          });
        });

        stream.on('error', (err) => {
          finishReject(err);
        });
      });

      // Socket-level remote address verification before and during TLS
      req.on('socket', (socket) => {
        const verifySocketAddress = () => {
          const remoteAddress = socket.remoteAddress;
          if (remoteAddress && !this.allowLocalTest) {
            if (isProhibitedIp(remoteAddress)) {
              const ssrfErr = new Error(`SSRF_PROHIBITED_DESTINATION: Connected socket remote address '${remoteAddress}' is prohibited`);
              ssrfErr.code = 'ERR_SSRF_PROHIBITED';
              socket.destroy(ssrfErr);
              req.destroy(ssrfErr);
              finishReject(ssrfErr);
              return;
            }
            if (pinnedIp && remoteAddress !== pinnedIp && !verifiedIps.includes(remoteAddress)) {
              const unpinnedErr = new Error(`SSRF_UNPINNED_IP: Connected socket remote address '${remoteAddress}' does not match pinned IP '${pinnedIp}'`);
              unpinnedErr.code = 'ERR_SSRF_UNPINNED';
              socket.destroy(unpinnedErr);
              req.destroy(unpinnedErr);
              finishReject(unpinnedErr);
              return;
            }
          }
        };

        socket.on('connect', verifySocketAddress);
        if (socket.encrypted) {
          socket.on('secureConnect', verifySocketAddress);
        }
      });

      timeoutId = setTimeout(() => {
        const timeoutErr = new Error('HTTP_REQUEST_TIMEOUT');
        timeoutErr.code = 'ETIMEDOUT';
        req.destroy(timeoutErr);
        finishReject(timeoutErr);
      }, HTTP_TIMEOUT_MS);

      req.on('error', (err) => {
        finishReject(err);
      });

      req.end();
    });
  }

  /**
   * Performs safe fetch with manual redirect handling, SSRF verification,
   * DNS pinning, and byte size limiting.
   *
   * @param {string} initialUrl
   * @returns {Promise<{status: number, body: string, headers: Headers, loadTimeMs: number, redirectChain: Array<{from: string, to: string, status: number}>, finalUrl: string}>}
   */
  async fetch(initialUrl) {
    let currentUrl = initialUrl;
    const redirectChain = [];
    const visitedUrls = new Set([initialUrl]);

    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      const parsedUrl = this.validateTargetUrl(currentUrl);

      // Perform SSRF verification on hostname and obtain verified IP
      let pinnedIp = null;
      let verifiedIps = [];
      if (!this.allowLocalTest) {
        verifiedIps = await resolveAndVerifyDns(parsedUrl.hostname, this.dnsLookupFn);
        pinnedIp = verifiedIps[0];
      } else {
        pinnedIp = parsedUrl.hostname;
      }

      const startTime = Date.now();
      let res;
      try {
        res = await this._executeRequest({ parsedUrl, pinnedIp, verifiedIps });
      } catch (err) {
        throw err;
      }

      if (res.isRedirect) {
        const status = res.status;
        const location = res.location;
        if (!location) {
          throw new Error(`REDIRECT_LOCATION_MISSING: HTTP ${status} redirect did not provide Location header`);
        }

        // Resolve redirect URL against current URL
        let nextUrl;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch (err) {
          throw new Error(`INVALID_REDIRECT_LOCATION: Malformed redirect location '${location}'`);
        }

        redirectChain.push({ from: currentUrl, to: nextUrl, status });

        // Loop detection
        if (visitedUrls.has(nextUrl)) {
          const loopErr = new Error('ERR_REDIRECT_CHAIN_LOOP: Circular redirect loop detected');
          loopErr.code = 'ERR_REDIRECT_CHAIN_LOOP';
          loopErr.redirectChain = redirectChain;
          throw loopErr;
        }

        if (hop === MAX_REDIRECT_HOPS) {
          const maxHopErr = new Error(`ERR_REDIRECT_CHAIN_LOOP: Redirect hops exceeded maximum (${MAX_REDIRECT_HOPS})`);
          maxHopErr.code = 'ERR_REDIRECT_CHAIN_LOOP';
          maxHopErr.redirectChain = redirectChain;
          throw maxHopErr;
        }

        visitedUrls.add(nextUrl);
        currentUrl = nextUrl;
        continue;
      }

      const loadTimeMs = Date.now() - startTime;

      return {
        status: res.status,
        body: res.body,
        headers: res.headers,
        loadTimeMs,
        redirectChain,
        finalUrl: currentUrl
      };
    }

    const loopErr = new Error(`ERR_REDIRECT_CHAIN_LOOP: Redirect hops exceeded maximum (${MAX_REDIRECT_HOPS})`);
    loopErr.code = 'ERR_REDIRECT_CHAIN_LOOP';
    loopErr.redirectChain = redirectChain;
    throw loopErr;
  }
}
