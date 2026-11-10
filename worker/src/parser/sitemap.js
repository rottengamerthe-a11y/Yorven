import { XMLParser } from 'fast-xml-parser';
import { MAX_BODY_BYTES } from '../config.js';

export function parseSitemapXml(xmlContent) {
  if (typeof xmlContent !== 'string') {
    throw new Error('ERR_SITEMAP_MALFORMED_XML: XML content must be a string');
  }

  // Size limit check
  const byteLength = Buffer.byteLength(xmlContent, 'utf8');
  if (byteLength > MAX_BODY_BYTES) {
    throw new Error(`ERR_SITEMAP_MALFORMED_XML: Sitemap exceeds 500 KB limit (${byteLength} bytes)`);
  }

  // Security check: Reject DTD / XML Entity expansions
  if (/<!DOCTYPE/i.test(xmlContent) || /<!ENTITY/i.test(xmlContent)) {
    throw new Error('ERR_SITEMAP_MALFORMED_XML: DTD or entity expansions are strictly prohibited');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    allowBooleanAttributes: false,
    trimValues: true
  });

  let parsed;
  try {
    parsed = parser.parse(xmlContent);
  } catch (err) {
    throw new Error(`ERR_SITEMAP_MALFORMED_XML: Invalid XML syntax: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ERR_SITEMAP_MALFORMED_XML: Parsed XML is empty or invalid');
  }

  const discovered = [];

  // Case 1: Standard URL set (<urlset><url><loc>)
  if (parsed.urlset && parsed.urlset.url) {
    const urls = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
    for (const u of urls) {
      if (u && u.loc && typeof u.loc === 'string') {
        const cleanLoc = u.loc.trim();
        if (cleanLoc) {
          discovered.push({
            url: cleanLoc,
            resource_type: 'page',
            priority: 5,
            depth: 1
          });
        }
      }
    }
    return discovered;
  }

  // Case 2: Sitemap Index (<sitemapindex><sitemap><loc>)
  if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
    const sitemaps = Array.isArray(parsed.sitemapindex.sitemap) ? parsed.sitemapindex.sitemap : [parsed.sitemapindex.sitemap];
    for (const s of sitemaps) {
      if (s && s.loc && typeof s.loc === 'string') {
        const cleanLoc = s.loc.trim();
        if (cleanLoc) {
          discovered.push({
            url: cleanLoc,
            resource_type: 'sitemap',
            priority: 8,
            depth: 1
          });
        }
      }
    }
    return discovered;
  }

  // If neither tag found, document is not a valid sitemap
  throw new Error('ERR_SITEMAP_MALFORMED_XML: Missing <urlset> or <sitemapindex> root elements');
}
