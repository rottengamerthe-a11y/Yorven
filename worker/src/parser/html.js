import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { TARGET_HOSTNAME } from '../config.js';

export function parseHtml(htmlContent, currentUrl = 'https://yorven.in') {
  if (typeof htmlContent !== 'string') {
    htmlContent = '';
  }

  const $ = cheerio.load(htmlContent);

  // 1. Title Extraction
  const titleEls = $('title');
  const titleCount = titleEls.length;
  const rawTitle = titleEls.first().text();
  const title = rawTitle ? rawTitle.trim() : '';

  // 2. Meta Description
  const metaDescEls = $('meta[name="description" i]');
  const metaDescCount = metaDescEls.length;
  const rawMetaDesc = metaDescEls.first().attr('content');
  const metaDescription = rawMetaDesc ? rawMetaDesc.trim() : '';

  // 3. H1 Headings (exclude inside <template> and <svg>)
  const h1Html = htmlContent
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
  const h1Doc = cheerio.load(h1Html);
  const h1Els = h1Doc('h1');
  const h1Count = h1Els.length;
  const h1List = [];
  h1Els.each((_, el) => {
    const text = h1Doc(el).text().trim();
    if (text) h1List.push(text);
  });
  const h1 = h1List[0] || '';

  // 4. Canonical URL
  const canonicalEls = $('link[rel="canonical" i]');
  const canonicalCount = canonicalEls.length;
  const rawCanonical = canonicalEls.first().attr('href')?.trim() || null;
  let canonicalUrl = null;
  let isCanonicalSyntaxValid = true;
  let isCanonicalExternal = false;
  let canonicalRejectionReason = null;

  if (rawCanonical) {
    try {
      const parsedCanon = new URL(rawCanonical, currentUrl);
      if (parsedCanon.protocol !== 'https:') {
        isCanonicalSyntaxValid = false;
        canonicalRejectionReason = `NON_HTTPS_SCHEME: Canonical URL must use HTTPS, got '${parsedCanon.protocol}'`;
      } else if (parsedCanon.username || parsedCanon.password) {
        isCanonicalSyntaxValid = false;
        canonicalRejectionReason = 'USERINFO_DISALLOWED: Canonical URL contains user credentials';
      } else {
        canonicalUrl = parsedCanon.href;
        if (parsedCanon.hostname !== TARGET_HOSTNAME) {
          isCanonicalExternal = true;
        }
      }
    } catch (err) {
      isCanonicalSyntaxValid = false;
      canonicalRejectionReason = `MALFORMED_URI: ${err.message}`;
    }
  }

  // 5. Robots Meta Directives
  const robotsMeta = $('meta[name="robots" i]').attr('content')?.toLowerCase() || '';
  const robotsDirectives = robotsMeta.split(',').map(s => s.trim()).filter(Boolean);
  const isNoIndex = robotsDirectives.includes('noindex') || robotsDirectives.includes('none');
  const isNoFollow = robotsDirectives.includes('nofollow') || robotsDirectives.includes('none');
  const isIndexable = !isNoIndex;

  // 6. Normalized Body Text & Hash
  const bodyClone = cheerio.load(htmlContent);
  bodyClone('script, style, nav, header, footer, svg, noscript, template').remove();
  const rawBodyText = bodyClone('body').text() || '';
  const normalizedBodyText = rawBodyText.replace(/\s+/g, ' ').trim();
  const bodyTextLength = normalizedBodyText.length;
  const bodyTextHash = bodyTextLength > 0
    ? createHash('sha256').update(normalizedBodyText, 'utf8').digest('hex')
    : null;

  // 7. Outlinks Extraction
  const internalOutlinks = new Set();
  const externalOutlinks = new Set();
  const rawOutlinks = [];

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href')?.trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      return;
    }

    try {
      const resolved = new URL(rawHref, currentUrl);
      // Strip fragment
      resolved.hash = '';
      const resolvedHref = resolved.href;

      rawOutlinks.push(resolvedHref);
      if (resolved.hostname === TARGET_HOSTNAME && resolved.protocol === 'https:') {
        internalOutlinks.add(resolvedHref);
      } else {
        externalOutlinks.add(resolvedHref);
      }
    } catch {
      // Ignore invalid URL syntaxes in links
    }
  });

  return {
    title,
    titleCount,
    metaDescription,
    metaDescCount,
    h1,
    h1Count,
    h1List,
    canonicalUrl,
    rawCanonical,
    canonicalCount,
    isCanonicalSyntaxValid,
    isCanonicalExternal,
    canonicalRejectionReason,
    isIndexable,
    isNoIndex,
    isNoFollow,
    normalizedBodyText,
    bodyTextLength,
    bodyTextHash,
    internalOutlinks: Array.from(internalOutlinks),
    externalOutlinks: Array.from(externalOutlinks),
    rawOutlinks
  };
}
