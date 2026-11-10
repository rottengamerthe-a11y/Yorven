import { RULES } from './catalogue.js';

export class RuleEvaluator {
  /**
   * Builds an issue object conforming to the database schema.
   * @param {keyof typeof RULES} ruleKey
   * @param {string} message
   * @param {object} [contextData={}]
   */
  static createIssue(ruleKey, message, contextData = {}) {
    const rule = RULES[ruleKey];
    if (!rule) {
      throw new Error(`UNKNOWN_RULE_CODE: Rule '${ruleKey}' is not in the authoritative catalogue`);
    }

    return {
      rule_code: rule.code,
      severity: rule.dbSeverity, // 'critical' | 'warning' | 'info'
      target_resource: rule.targetResource,
      message: message || rule.description,
      context_data: contextData
    };
  }

  /**
   * Evaluate HTTP and network findings for a fetched resource.
   */
  static evaluateHttpFindings({
    status,
    isInSitemap = false,
    resourceType = 'page',
    redirectChain = [],
    isTransportFailure = false,
    isExhausted = false,
    errorMessage = ''
  }) {
    const issues = [];

    // Redirect analysis
    for (const hop of redirectChain) {
      if ([302, 307].includes(hop.status)) {
        issues.push(this.createIssue(
          'WARN_REDIRECT_302_TEMPORARY',
          `Temporary redirect HTTP ${hop.status} from '${hop.from}' to '${hop.to}'. Use permanent 301/308.`,
          { from: hop.from, to: hop.to, status: hop.status }
        ));
      }
    }

    // Transport failures
    if (isTransportFailure) {
      if (resourceType === 'sitemap') {
        issues.push(this.createIssue(
          'ERR_SITEMAP_DOCUMENT_ERROR',
          `Sitemap transport failure: ${errorMessage}`,
          { error: errorMessage }
        ));
      } else if (isInSitemap) {
        issues.push(this.createIssue(
          'ERR_SITEMAP_LISTED_PAGE_TRANSPORT',
          `Sitemap-listed page failed transport after exhausted retries: ${errorMessage}`,
          { error: errorMessage }
        ));
      } else {
        issues.push(this.createIssue(
          'ERR_TRANSPORT_FAILURE',
          `Internal page failed transport after exhausted retries: ${errorMessage}`,
          { error: errorMessage }
        ));
      }
      return issues;
    }

    // HTTP 206 Partial Content
    if (status === 206) {
      issues.push(this.createIssue(
        'WARN_HTTP_PARTIAL_CONTENT',
        'Server returned HTTP 206 Partial Content. HTML parsing rejected.',
        { status: 206 }
      ));
      return issues;
    }

    // HTTP 4xx errors
    if (status >= 400 && status <= 499) {
      if (resourceType === 'sitemap') {
        issues.push(this.createIssue(
          'ERR_SITEMAP_DOCUMENT_ERROR',
          `Sitemap request returned HTTP ${status}`,
          { status }
        ));
      } else if (isInSitemap) {
        issues.push(this.createIssue(
          'ERR_SITEMAP_LISTED_PAGE_4XX',
          `Sitemap-listed page returned permanent HTTP ${status}`,
          { status }
        ));
      } else {
        issues.push(this.createIssue(
          'ERR_HTTP_STATUS_4XX',
          `Internal page returned permanent HTTP ${status}`,
          { status }
        ));
      }
      return issues;
    }

    // HTTP 5xx errors (exhausted)
    if (status >= 500 && status <= 599) {
      if (resourceType === 'sitemap') {
        issues.push(this.createIssue(
          'ERR_SITEMAP_DOCUMENT_ERROR',
          `Sitemap request returned HTTP ${status} (exhausted retries)`,
          { status }
        ));
      } else if (isInSitemap) {
        issues.push(this.createIssue(
          'ERR_SITEMAP_LISTED_PAGE_5XX',
          `Sitemap-listed page returned HTTP ${status} after exhausted retries`,
          { status }
        ));
      } else {
        issues.push(this.createIssue(
          'ERR_HTTP_STATUS_5XX',
          `Internal page returned HTTP ${status} after exhausted retries`,
          { status }
        ));
      }
      return issues;
    }

    // Unlisted or unexpected status codes (<100, 300, 304, 305, >=600)
    if (status < 200 || (status >= 300 && status < 400 && ![301, 302, 307, 308].includes(status)) || status >= 600) {
      issues.push(this.createIssue(
        'ERR_HTTP_UNEXPECTED_STATUS',
        `Server returned unlisted or ambiguous HTTP status ${status}`,
        { status }
      ));
    }

    return issues;
  }

  /**
   * Evaluate robots.txt disallowance.
   */
  static evaluateRobotsDisallowed({ url, resourceType = 'page', isInSitemap = false }) {
    if (resourceType === 'sitemap') {
      return [this.createIssue(
        'ERR_SITEMAP_DOCUMENT_ROBOTS_DISALLOWED',
        `Sitemap URL '${url}' matches Disallow in robots.txt. Fetch aborted.`,
        { url }
      )];
    }
    if (isInSitemap) {
      return [this.createIssue(
        'ERR_SITEMAP_ROBOTS_DISALLOWED',
        `Sitemap-listed page '${url}' matches Disallow in robots.txt. Page not fetched.`,
        { url }
      )];
    }
    return [this.createIssue(
      'WARN_ROBOTS_DISALLOWED',
      `Internal page '${url}' matches Disallow in robots.txt. Page not fetched.`,
      { url }
    )];
  }

  /**
   * Evaluate on-page HTML elements for successful HTTP 200 HTML responses.
   */
  static evaluateHtmlPage(parsedHtml, { currentUrl, isInSitemap = false, knownBodyHashes = new Set(), robotsManager = null }) {
    const issues = [];

    // Title rules
    if (!parsedHtml.title || parsedHtml.title.length === 0) {
      issues.push(this.createIssue('ERR_TITLE_MISSING', 'Page is missing a <title> tag or title is empty'));
    } else {
      if (parsedHtml.title.length < 15) {
        issues.push(this.createIssue(
          'WARN_TITLE_TOO_SHORT',
          `Title text is too short (${parsedHtml.title.length} chars, minimum 15 chars recommended)`,
          { length: parsedHtml.title.length, title: parsedHtml.title }
        ));
      } else if (parsedHtml.title.length > 65) {
        issues.push(this.createIssue(
          'WARN_TITLE_TOO_LONG',
          `Title text is too long (${parsedHtml.title.length} chars, maximum 65 chars recommended)`,
          { length: parsedHtml.title.length, title: parsedHtml.title }
        ));
      }
    }

    // Meta Description rules
    if (!parsedHtml.metaDescription || parsedHtml.metaDescription.length === 0) {
      issues.push(this.createIssue('WARN_META_DESC_MISSING', 'Page is missing a <meta name="description"> tag'));
    } else {
      if (parsedHtml.metaDescription.length < 50) {
        issues.push(this.createIssue(
          'WARN_META_DESC_TOO_SHORT',
          `Meta description is too short (${parsedHtml.metaDescription.length} chars, minimum 50 chars recommended)`,
          { length: parsedHtml.metaDescription.length }
        ));
      } else if (parsedHtml.metaDescription.length > 165) {
        issues.push(this.createIssue(
          'WARN_META_DESC_TOO_LONG',
          `Meta description is too long (${parsedHtml.metaDescription.length} chars, maximum 165 chars recommended)`,
          { length: parsedHtml.metaDescription.length }
        ));
      }
    }

    // H1 Headings rules
    if (parsedHtml.h1Count === 0) {
      issues.push(this.createIssue('ERR_H1_MISSING', 'Document contains 0 <h1> heading tags'));
    } else if (parsedHtml.h1Count > 1) {
      issues.push(this.createIssue(
        'WARN_H1_MULTIPLE',
        `Document contains ${parsedHtml.h1Count} <h1> heading tags (exactly 1 recommended)`,
        { count: parsedHtml.h1Count }
      ));
    }

    // Canonical Tag rules
    if (!parsedHtml.rawCanonical) {
      issues.push(this.createIssue('WARN_CANONICAL_MISSING', 'Document is missing a <link rel="canonical"> tag'));
    } else if (!parsedHtml.isCanonicalSyntaxValid) {
      issues.push(this.createIssue(
        'ERR_CANONICAL_SYNTAX_INVALID',
        `Canonical URL syntax is invalid: ${parsedHtml.canonicalRejectionReason}`,
        { rawCanonical: parsedHtml.rawCanonical, reason: parsedHtml.canonicalRejectionReason }
      ));
    } else if (parsedHtml.canonicalUrl && !parsedHtml.isCanonicalExternal && robotsManager) {
      // Rule 17: Canonical target matches Disallow in robots.txt
      if (!robotsManager.isAllowed(parsedHtml.canonicalUrl)) {
        issues.push(this.createIssue(
          'ERR_CANONICAL_TARGET_BLOCKED',
          `Canonical target '${parsedHtml.canonicalUrl}' matches Disallow in robots.txt.`,
          { canonicalUrl: parsedHtml.canonicalUrl }
        ));
      }
    }

    // Sitemap Noindex contradiction
    if (isInSitemap && parsedHtml.isNoIndex) {
      issues.push(this.createIssue(
        'WARN_SITEMAP_NOINDEX',
        'URL is listed in sitemap.xml, but page specifies robots "noindex"',
        { url: currentUrl }
      ));
    }

    // Duplicate Content Hash (>= 150 chars body text)
    if (parsedHtml.bodyTextHash && parsedHtml.bodyTextLength >= 150) {
      if (knownBodyHashes.has(parsedHtml.bodyTextHash)) {
        issues.push(this.createIssue(
          'WARN_DUPLICATE_CONTENT_HASH',
          `Page body text hash matches another crawled page (${parsedHtml.bodyTextLength} characters)`,
          { hash: parsedHtml.bodyTextHash, length: parsedHtml.bodyTextLength }
        ));
      }
    }

    // Indexable not in sitemap
    if (!isInSitemap && parsedHtml.isIndexable) {
      const isSelfCanonical = !parsedHtml.canonicalUrl || parsedHtml.canonicalUrl === currentUrl;
      if (isSelfCanonical) {
        issues.push(this.createIssue(
          'INFO_INDEXABLE_NOT_IN_SITEMAP',
          'Page is healthy, indexable, and self-canonical, but missing from sitemap.xml',
          { url: currentUrl }
        ));
      }
    }

    return issues;
  }
}
