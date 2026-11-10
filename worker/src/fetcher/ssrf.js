import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Checks if an IPv4 address is within a CIDR block.
 */
function ipInCidrV4(ip, cidr) {
  const [range, bits = 32] = cidr.split('/');
  const mask = ~(2 ** (32 - Number(bits)) - 1);
  const ipInt = ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
  const rangeInt = range.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/**
 * List of prohibited IPv4 CIDR blocks.
 */
const PROHIBITED_V4_CIDRS = [
  '0.0.0.0/8',       // Current network
  '10.0.0.0/8',      // Private network
  '100.64.0.0/10',   // Carrier-grade NAT
  '127.0.0.0/8',     // Loopback
  '169.254.0.0/16',  // Link-local
  '172.16.0.0/12',   // Private network
  '192.0.0.0/24',    // IETF Protocol Assignments
  '192.0.2.0/24',    // Documentation / TEST-NET-1
  '192.168.0.0/16',  // Private network
  '198.18.0.0/15',   // Benchmark testing
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24',  // TEST-NET-3
  '224.0.0.0/4',     // Multicast
  '240.0.0.0/4',     // Reserved
  '255.255.255.255/32' // Broadcast
];

/**
 * Checks whether an IP address is private, loopback, link-local, or prohibited.
 * @param {string} ip
 * @returns {boolean} true if prohibited / dangerous
 */
export function isProhibitedIp(ip) {
  const version = net.isIP(ip);
  if (version === 0) return true; // Invalid IP format

  if (version === 4) {
    for (const cidr of PROHIBITED_V4_CIDRS) {
      if (ipInCidrV4(ip, cidr)) return true;
    }
    return false;
  }

  if (version === 6) {
    const lower = ip.toLowerCase();
    // Loopback
    if (lower === '::1' || lower === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
    // Unspecified
    if (lower === '::' || lower === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    if (lower.startsWith('::ffff:')) {
      const v4Part = lower.slice(7);
      if (net.isIPv4(v4Part)) {
        return isProhibitedIp(v4Part);
      }
    }
    // Link-local (fe80::/10) -> starts with fe8, fe9, fea, feb
    if (/^fe[89ab]/i.test(lower)) return true;
    // Unique local (fc00::/7) -> starts with fc or fd
    if (/^f[cd]/i.test(lower)) return true;
    // Multicast (ff00::/8) -> starts with ff
    if (lower.startsWith('ff')) return true;

    return false;
  }

  return true;
}

/**
 * Resolves a hostname and verifies that ALL resolved IPs are non-prohibited.
 * Protects against DNS rebinding and internal network enumeration.
 * @param {string} hostname
 * @param {Function} [lookupFn] Optional resolver function (defaults to dns.lookup)
 * @returns {Promise<string[]>} array of verified safe IP addresses
 */
export async function resolveAndVerifyDns(hostname, lookupFn = dns.lookup) {
  if (net.isIP(hostname)) {
    if (isProhibitedIp(hostname)) {
      throw new Error(`SSRF_PROHIBITED_IP: Direct IP '${hostname}' is prohibited`);
    }
    return [hostname];
  }

  let addresses;
  try {
    addresses = await lookupFn(hostname, { all: true });
  } catch (err) {
    throw new Error(`DNS_RESOLUTION_FAILED: Could not resolve '${hostname}': ${err.message}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new Error(`DNS_RESOLUTION_FAILED: No DNS records found for '${hostname}'`);
  }

  const resolvedIps = [];
  for (const record of addresses) {
    const ip = record.address;
    if (isProhibitedIp(ip)) {
      throw new Error(`SSRF_PROHIBITED_DESTINATION: Hostname '${hostname}' resolved to prohibited IP '${ip}'`);
    }
    resolvedIps.push(ip);
  }

  return resolvedIps;
}

/**
 * Creates a custom DNS lookup function that always resolves to a verified pinned IP.
 * Guarantees that Node network sockets connect strictly to the pre-verified IP,
 * preventing any subsequent unpinned DNS resolution (DNS rebinding / TOCTOU).
 *
 * @param {string} pinnedIp Pre-verified safe IP address
 * @returns {Function} Custom lookup function conforming to dns.lookup signature
 */
export function createPinnedLookup(pinnedIp) {
  if (!pinnedIp || isProhibitedIp(pinnedIp)) {
    throw new Error(`SSRF_PROHIBITED_DESTINATION: Cannot create pinned lookup for invalid or prohibited IP '${pinnedIp}'`);
  }

  const isV6 = net.isIPv6(pinnedIp);
  const family = isV6 ? 6 : 4;

  return function pinnedLookup(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    if (options && options.all) {
      callback(null, [{ address: pinnedIp, family }]);
    } else {
      callback(null, pinnedIp, family);
    }
  };
}
