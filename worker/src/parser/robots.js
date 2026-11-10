import robotsParser from 'robots-parser';

export class RobotsManager {
  /**
   * @param {string} robotsUrl
   * @param {string} robotsContent
   */
  constructor(robotsUrl = 'https://yorven.in/robots.txt', robotsContent = '') {
    this.robotsUrl = robotsUrl;
    this.parser = robotsParser(robotsUrl, robotsContent || '');
    this.content = robotsContent;
  }

  /**
   * Check if a URL is allowed by robots.txt policy.
   * @param {string} url
   * @param {string} [userAgent='YorvenSEO-AuditBot/1.0']
   * @returns {boolean} true if allowed, false if disallowed
   */
  isAllowed(url, userAgent = 'YorvenSEO-AuditBot/1.0') {
    if (!this.parser) return true;
    const allowed = this.parser.isAllowed(url, userAgent);
    // If undefined (no rule matched), default to allowed
    return allowed !== false;
  }

  /**
   * Extract sitemap URLs declared in robots.txt.
   * @returns {string[]}
   */
  extractSitemaps() {
    const sitemaps = new Set();
    if (this.parser && typeof this.parser.getSitemaps === 'function') {
      const fromParser = this.parser.getSitemaps();
      if (Array.isArray(fromParser)) {
        for (const s of fromParser) sitemaps.add(s.trim());
      }
    }

    // Direct regex fallback for Sitemap: <url>
    const lines = this.content.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*Sitemap:\s*(\S+)/i);
      if (match && match[1]) {
        sitemaps.add(match[1].trim());
      }
    }

    return Array.from(sitemaps);
  }
}
