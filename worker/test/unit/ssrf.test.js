import test from 'node:test';
import assert from 'node:assert/strict';
import { isProhibitedIp, resolveAndVerifyDns, createPinnedLookup } from '../../src/fetcher/ssrf.js';

test('SSRF: rejects private and dangerous IPv4 ranges', () => {
  // Loopback
  assert.equal(isProhibitedIp('127.0.0.1'), true);
  assert.equal(isProhibitedIp('127.255.255.255'), true);

  // Private 10.0.0.0/8
  assert.equal(isProhibitedIp('10.0.0.1'), true);
  assert.equal(isProhibitedIp('10.254.0.1'), true);

  // Private 172.16.0.0/12
  assert.equal(isProhibitedIp('172.16.0.1'), true);
  assert.equal(isProhibitedIp('172.31.255.254'), true);
  // 172.32.0.1 is public
  assert.equal(isProhibitedIp('172.32.0.1'), false);

  // Private 192.168.0.0/16
  assert.equal(isProhibitedIp('192.168.0.1'), true);
  assert.equal(isProhibitedIp('192.168.254.254'), true);

  // Cloud metadata / Link-local 169.254.0.0/16
  assert.equal(isProhibitedIp('169.254.169.254'), true);

  // Current network / Broadcast
  assert.equal(isProhibitedIp('0.0.0.0'), true);
  assert.equal(isProhibitedIp('255.255.255.255'), true);

  // Carrier-grade NAT 100.64.0.0/10
  assert.equal(isProhibitedIp('100.64.0.1'), true);
  assert.equal(isProhibitedIp('100.127.255.254'), true);
});

test('SSRF: rejects private and dangerous IPv6 ranges', () => {
  // Loopback
  assert.equal(isProhibitedIp('::1'), true);
  assert.equal(isProhibitedIp('::'), true);

  // Link-local
  assert.equal(isProhibitedIp('fe80::1'), true);
  assert.equal(isProhibitedIp('fea0::1234'), true);

  // Unique local (private)
  assert.equal(isProhibitedIp('fc00::1'), true);
  assert.equal(isProhibitedIp('fd00::1'), true);

  // IPv4-mapped IPv6
  assert.equal(isProhibitedIp('::ffff:127.0.0.1'), true);
  assert.equal(isProhibitedIp('::ffff:192.168.1.1'), true);
  assert.equal(isProhibitedIp('::ffff:8.8.8.8'), false);
});

test('SSRF: accepts legitimate public IP addresses', () => {
  assert.equal(isProhibitedIp('8.8.8.8'), false);
  assert.equal(isProhibitedIp('1.1.1.1'), false);
  assert.equal(isProhibitedIp('93.184.216.34'), false);
  assert.equal(isProhibitedIp('2607:f8b0:4005:805::200e'), false); // Google public IPv6
});

test('SSRF: resolveAndVerifyDns rejects direct prohibited IPs', async () => {
  await assert.rejects(
    () => resolveAndVerifyDns('127.0.0.1'),
    /SSRF_PROHIBITED_IP/
  );
  await assert.rejects(
    () => resolveAndVerifyDns('10.0.0.1'),
    /SSRF_PROHIBITED_IP/
  );
  await assert.rejects(
    () => resolveAndVerifyDns('169.254.169.254'),
    /SSRF_PROHIBITED_IP/
  );
});

test('SSRF: resolveAndVerifyDns rejects localhost resolution', async () => {
  await assert.rejects(
    () => resolveAndVerifyDns('localhost'),
    /SSRF_PROHIBITED_DESTINATION/
  );
});

test('SSRF: createPinnedLookup returns pinned IP and refuses prohibited IPs', () => {
  // Prohibited IP rejected upfront
  assert.throws(
    () => createPinnedLookup('127.0.0.1'),
    /SSRF_PROHIBITED_DESTINATION/
  );
  assert.throws(
    () => createPinnedLookup('10.0.0.1'),
    /SSRF_PROHIBITED_DESTINATION/
  );

  // Safe public IP produces pinned lookup
  const safeIp = '93.184.216.34';
  const lookup = createPinnedLookup(safeIp);

  // Single address lookup
  lookup('any-host.com', (err, address, family) => {
    assert.equal(err, null);
    assert.equal(address, safeIp);
    assert.equal(family, 4);
  });

  // All records lookup
  lookup('any-host.com', { all: true }, (err, addresses) => {
    assert.equal(err, null);
    assert.deepEqual(addresses, [{ address: safeIp, family: 4 }]);
  });
});

test('SSRF: resolveAndVerifyDns rejects if any multi-record A/AAAA IP is private', async () => {
  const mockLookupFn = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '192.168.1.1', family: 4 } // Dangerous mixed private IP
  ];

  await assert.rejects(
    () => resolveAndVerifyDns('yorven.in', mockLookupFn),
    /SSRF_PROHIBITED_DESTINATION.*192\.168\.1\.1/
  );
});
