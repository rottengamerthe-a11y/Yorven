import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSitemapXml } from '../../src/parser/sitemap.js';

test('Sitemap: parses valid urlset sitemap', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://yorven.in/</loc>
    <lastmod>2026-11-01</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://yorven.in/services</loc>
    <priority>0.8</priority>
  </url>
</urlset>`;

  const urls = parseSitemapXml(xml);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].url, 'https://yorven.in/');
  assert.equal(urls[0].resource_type, 'page');
  assert.equal(urls[1].url, 'https://yorven.in/services');
});

test('Sitemap: parses valid sitemapindex', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://yorven.in/sitemap-main.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://yorven.in/sitemap-articles.xml</loc>
  </sitemap>
</sitemapindex>`;

  const sitemaps = parseSitemapXml(xml);
  assert.equal(sitemaps.length, 2);
  assert.equal(sitemaps[0].url, 'https://yorven.in/sitemap-main.xml');
  assert.equal(sitemaps[0].resource_type, 'sitemap');
  assert.equal(sitemaps[1].url, 'https://yorven.in/sitemap-articles.xml');
  assert.equal(sitemaps[1].resource_type, 'sitemap');
});

test('Sitemap: rejects DTD and XML entity expansions', () => {
  const dtdXml = `<?xml version="1.0"?>
<!DOCTYPE foo [<!ELEMENT foo ANY >
<!ENTITY xxe SYSTEM "file:///etc/passwd" >]>
<urlset><url><loc>&xxe;</loc></url></urlset>`;

  assert.throws(
    () => parseSitemapXml(dtdXml),
    /ERR_SITEMAP_MALFORMED_XML: DTD or entity expansions are strictly prohibited/
  );
});

test('Sitemap: rejects payloads exceeding 500 KB limit', () => {
  const padding = '<!-- ' + 'A'.repeat(520 * 1024) + ' -->';
  const largeXml = `<urlset>${padding}<url><loc>https://yorven.in/</loc></url></urlset>`;

  assert.throws(
    () => parseSitemapXml(largeXml),
    /ERR_SITEMAP_MALFORMED_XML: Sitemap exceeds 500 KB limit/
  );
});

test('Sitemap: rejects malformed or empty XML', () => {
  assert.throws(
    () => parseSitemapXml('Not even XML at all'),
    /ERR_SITEMAP_MALFORMED_XML/
  );
  assert.throws(
    () => parseSitemapXml('<someotherroot><data>test</data></someotherroot>'),
    /ERR_SITEMAP_MALFORMED_XML: Missing <urlset> or <sitemapindex> root elements/
  );
});
