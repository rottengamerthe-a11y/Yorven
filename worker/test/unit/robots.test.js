import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotsManager } from '../../src/parser/robots.js';

test('Robots: correctly evaluates allowed and disallowed paths', () => {
  const robotsTxt = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Disallow: /secret.html

User-agent: YorvenSEO-AuditBot/1.0
Disallow: /admin/
Disallow: /crawler-blocked/
`;

  const manager = new RobotsManager('https://yorven.in/robots.txt', robotsTxt);

  // Allowed paths
  assert.equal(manager.isAllowed('https://yorven.in/'), true);
  assert.equal(manager.isAllowed('https://yorven.in/services'), true);
  assert.equal(manager.isAllowed('https://yorven.in/insights/article-1'), true);

  // Disallowed paths
  assert.equal(manager.isAllowed('https://yorven.in/admin/dashboard'), false);
  assert.equal(manager.isAllowed('https://yorven.in/crawler-blocked/test'), false);
});

test('Robots: extracts sitemap declarations', () => {
  const robotsTxt = `
User-agent: *
Disallow: /admin

Sitemap: https://yorven.in/sitemap.xml
Sitemap: https://yorven.in/sitemap-services.xml
`;

  const manager = new RobotsManager('https://yorven.in/robots.txt', robotsTxt);
  const sitemaps = manager.extractSitemaps();

  assert.equal(sitemaps.length, 2);
  assert.ok(sitemaps.includes('https://yorven.in/sitemap.xml'));
  assert.ok(sitemaps.includes('https://yorven.in/sitemap-services.xml'));
});

test('Robots: returns empty array when no sitemaps declared', () => {
  const robotsTxt = `
User-agent: *
Disallow: /admin
`;

  const manager = new RobotsManager('https://yorven.in/robots.txt', robotsTxt);
  const sitemaps = manager.extractSitemaps();

  assert.equal(sitemaps.length, 0);
});
