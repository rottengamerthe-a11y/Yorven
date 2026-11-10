/**
 * Authoritative 34-Rule Catalogue for Yorven SEO Monitoring.
 * Note: PostgreSQL database type public.crawl_issue_severity only accepts:
 * 'critical', 'warning', 'info'.
 * Therefore, conceptual 'Error' rules (Rules 9 to 18) are strictly mapped to 'critical'.
 */

export const RULES = Object.freeze({
  // 1. Critical Rules (1 - 8)
  ERR_SITEMAP_DOCUMENT_ERROR: {
    id: 1,
    code: 'ERR_SITEMAP_DOCUMENT_ERROR',
    category: 'critical',
    dbSeverity: 'critical',
    targetResource: 'sitemap_xml',
    description: 'sitemap.xml request returns HTTP 4xx, exhausted 5xx, or transport failure.'
  },
  ERR_SITEMAP_DOCUMENT_ROBOTS_DISALLOWED: {
    id: 2,
    code: 'ERR_SITEMAP_DOCUMENT_ROBOTS_DISALLOWED',
    category: 'critical',
    dbSeverity: 'critical',
    targetResource: 'sitemap_xml',
    description: 'sitemap.xml URL matches Disallow in robots.txt. Fetch aborted.'
  },
  ERR_SITEMAP_MALFORMED_XML: {
    id: 3,
    code: 'ERR_SITEMAP_MALFORMED_XML',
    category: 'critical',
    dbSeverity: 'critical',
    targetResource: 'sitemap_xml',
    description: 'Sitemap XML payload is invalid XML, entity expansion/DTD, or exceeds 500 KB limit.'
  },
  ERR_SITEMAP_LISTED_PAGE_4XX: {
    id: 4,
    code: 'ERR_SITEMAP_LISTED_PAGE_4XX',
    category: 'critical',
    dbSeverity: 'critical',
    targetResource: 'sitemap_page',
    description: 'URL in sitemap.xml returns permanent HTTP 4xx or exhausted 408/425/429.'
  },
  ERR_SITEMAP_LISTED_PAGE_5XX: {
    id: 5,
    code: 'ERR_SITEMAP_LISTED_PAGE_5XX',
    category: 'critical',
    dbSeverity: 'critical',
    targetResource: 'sitemap_page',
    description: 'URL in sitemap.xml returns HTTP 5xx after 4 attempts (exhausted).'
  },
  ERR_SITEMAP_LISTED_PAGE_TRANSPORT: {
    id: 6,
    code: 'ERR_SITEMAP_LISTED_PAGE_TRANSPORT',
    category: 'critical',
    dbSeverity: 'critical',
    targetResource: 'sitemap_page',
    description: 'URL in sitemap.xml fails socket/TLS/DNS transport after 4 attempts.'
  },
  ERR_HTTP_STATUS_5XX: {
    id: 7,
    code: 'ERR_HTTP_STATUS_5XX',
    category: 'critical',
    dbSeverity: 'critical',
    targetResource: 'internal_page',
    description: 'Non-sitemap internal page returns HTTP 5xx after 4 attempts.'
  },
  ERR_TRANSPORT_FAILURE: {
    id: 8,
    code: 'ERR_TRANSPORT_FAILURE',
    category: 'critical',
    dbSeverity: 'critical',
    targetResource: 'internal_page',
    description: 'Non-sitemap internal page fails transport after 4 attempts.'
  },

  // 2. Error Rules (9 - 18) -> mapped to 'critical' in database
  ERR_HTTP_STATUS_4XX: {
    id: 9,
    code: 'ERR_HTTP_STATUS_4XX',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'internal_page',
    description: 'Non-sitemap internal page returns permanent 4xx or exhausted 408/425/429.'
  },
  ERR_HTTP_UNEXPECTED_STATUS: {
    id: 10,
    code: 'ERR_HTTP_UNEXPECTED_STATUS',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'page',
    description: 'Server returns unlisted, ambiguous, or invalid status (e.g. 300, 304, 305, <100, >=600).'
  },
  ERR_SITEMAP_ROBOTS_DISALLOWED: {
    id: 11,
    code: 'ERR_SITEMAP_ROBOTS_DISALLOWED',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'sitemap_page',
    description: 'URL listed in sitemap.xml matches Disallow in robots.txt. Page not fetched.'
  },
  ERR_REDIRECT_CHAIN_LOOP: {
    id: 12,
    code: 'ERR_REDIRECT_CHAIN_LOOP',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'redirect_hop',
    description: 'Redirect hops > 5 or circular redirect loop detected.'
  },
  ERR_TITLE_MISSING: {
    id: 13,
    code: 'ERR_TITLE_MISSING',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'html_document',
    description: 'Document contains 0 <title> tags or tag is whitespace-only.'
  },
  ERR_H1_MISSING: {
    id: 14,
    code: 'ERR_H1_MISSING',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'html_document',
    description: 'Document contains 0 <h1> tags (excluding <template> and <svg>).'
  },
  ERR_CANONICAL_SYNTAX_INVALID: {
    id: 15,
    code: 'ERR_CANONICAL_SYNTAX_INVALID',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'html_document',
    description: '<link rel="canonical"> has malformed URI, non-HTTPS scheme, or user credentials.'
  },
  ERR_CANONICAL_TARGET_BROKEN: {
    id: 16,
    code: 'ERR_CANONICAL_TARGET_BROKEN',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'html_document',
    description: 'Canonical target was crawled and verified broken (4xx, 5xx, transport, bodyless 204).'
  },
  ERR_CANONICAL_TARGET_BLOCKED: {
    id: 17,
    code: 'ERR_CANONICAL_TARGET_BLOCKED',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'html_document',
    description: 'Canonical target matches Disallow in robots.txt.'
  },
  ERR_CANONICAL_PING_PONG_LOOP: {
    id: 18,
    code: 'ERR_CANONICAL_PING_PONG_LOOP',
    category: 'error',
    dbSeverity: 'critical',
    targetResource: 'html_document',
    description: 'Mutual conflict: Page A canonicalizes to Page B, and Page B canonicalizes to Page A.'
  },

  // 3. Warning Rules (19 - 32)
  WARN_CANONICAL_CHAIN: {
    id: 19,
    code: 'WARN_CANONICAL_CHAIN',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: 'Multi-hop canonicalization: Page A points to Page B, while Page B points to Page C.'
  },
  WARN_HTTP_PARTIAL_CONTENT: {
    id: 20,
    code: 'WARN_HTTP_PARTIAL_CONTENT',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'page',
    description: 'Server returned HTTP 206 Partial Content in response to standard GET request.'
  },
  WARN_REDIRECT_302_TEMPORARY: {
    id: 21,
    code: 'WARN_REDIRECT_302_TEMPORARY',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'redirect_hop',
    description: 'Internal redirect uses temporary status HTTP 302 or 307 instead of 301/308.'
  },
  WARN_TITLE_TOO_SHORT: {
    id: 22,
    code: 'WARN_TITLE_TOO_SHORT',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: '<title> text length < 15 characters.'
  },
  WARN_TITLE_TOO_LONG: {
    id: 23,
    code: 'WARN_TITLE_TOO_LONG',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: '<title> text length > 65 characters.'
  },
  WARN_META_DESC_MISSING: {
    id: 24,
    code: 'WARN_META_DESC_MISSING',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: '<meta name="description"> missing or whitespace-only.'
  },
  WARN_META_DESC_TOO_SHORT: {
    id: 25,
    code: 'WARN_META_DESC_TOO_SHORT',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: 'Meta description length < 50 characters.'
  },
  WARN_META_DESC_TOO_LONG: {
    id: 26,
    code: 'WARN_META_DESC_TOO_LONG',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: 'Meta description length > 165 characters.'
  },
  WARN_H1_MULTIPLE: {
    id: 27,
    code: 'WARN_H1_MULTIPLE',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: 'HTML contains > 1 <h1> tags.'
  },
  WARN_CANONICAL_MISSING: {
    id: 28,
    code: 'WARN_CANONICAL_MISSING',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: '<link rel="canonical"> tag is missing.'
  },
  WARN_ROBOTS_DISALLOWED: {
    id: 29,
    code: 'WARN_ROBOTS_DISALLOWED',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'internal_page',
    description: 'Non-sitemap link matches Disallow in robots.txt. Page not fetched.'
  },
  WARN_SITEMAP_NOINDEX: {
    id: 30,
    code: 'WARN_SITEMAP_NOINDEX',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'sitemap_page',
    description: 'URL in sitemap.xml returns 200 OK, but document contains noindex directive.'
  },
  WARN_DUPLICATE_CONTENT_HASH: {
    id: 31,
    code: 'WARN_DUPLICATE_CONTENT_HASH',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: 'SHA-256 of normalized body text matches another crawled page (>= 150 characters).'
  },
  WARN_CANONICAL_MISMATCH: {
    id: 32,
    code: 'WARN_CANONICAL_MISMATCH',
    category: 'warning',
    dbSeverity: 'warning',
    targetResource: 'html_document',
    description: 'Canonical target is healthy HTTP 200, but points to page with distinct content hash.'
  },

  // 4. Info Rules (33 - 34)
  INFO_INDEXABLE_NOT_IN_SITEMAP: {
    id: 33,
    code: 'INFO_INDEXABLE_NOT_IN_SITEMAP',
    category: 'info',
    dbSeverity: 'info',
    targetResource: 'internal_page',
    description: 'Internal page returns 200 OK, is indexable, self-canonical, but missing from sitemap.xml.'
  },
  INFO_CANONICAL_TARGET_UNRESOLVED: {
    id: 34,
    code: 'INFO_CANONICAL_TARGET_UNRESOLVED',
    category: 'info',
    dbSeverity: 'info',
    targetResource: 'html_document',
    description: 'Canonical target was not crawled within session depth (4) or queue cap (100) limits.'
  }
});

export const TOTAL_RULES_COUNT = Object.keys(RULES).length; // Exactly 34
