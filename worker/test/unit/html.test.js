import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml } from '../../src/parser/html.js';

test('HTML: extracts title, meta description, and H1 correctly', () => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>   Yorven — Premium Design & Systems   </title>
  <meta name="description" content="  We build modern web experiences and software systems.  ">
  <link rel="canonical" href="https://yorven.in/services">
</head>
<body>
  <header><nav><a href="/home">Home</a></nav></header>
  <h1>   Engineering & Design Architecture   </h1>
  <p>Our main service offering body paragraph.</p>
  <footer>Copyright 2026</footer>
</body>
</html>`;

  const parsed = parseHtml(html, 'https://yorven.in/services');
  assert.equal(parsed.title, 'Yorven — Premium Design & Systems');
  assert.equal(parsed.titleCount, 1);
  assert.equal(parsed.metaDescription, 'We build modern web experiences and software systems.');
  assert.equal(parsed.metaDescCount, 1);
  assert.equal(parsed.h1, 'Engineering & Design Architecture');
  assert.equal(parsed.h1Count, 1);
  assert.equal(parsed.canonicalUrl, 'https://yorven.in/services');
  assert.equal(parsed.isCanonicalSyntaxValid, true);
  assert.equal(parsed.isCanonicalExternal, false);
});

test('HTML: ignores H1 headings inside <template> and <svg>', () => {
  const html = `<html><body>
  <template><h1>Template Heading</h1></template>
  <svg><g><h1>SVG Heading</h1></g></svg>
  <h1>Actual Body H1</h1>
</body></html>`;

  const parsed = parseHtml(html, 'https://yorven.in/');
  assert.equal(parsed.h1Count, 1);
  assert.equal(parsed.h1, 'Actual Body H1');
});

test('HTML: detects invalid canonical syntax (non-HTTPS, userinfo, malformed)', () => {
  // Non-HTTPS
  const parsed1 = parseHtml('<link rel="canonical" href="http://yorven.in/test">', 'https://yorven.in/');
  assert.equal(parsed1.isCanonicalSyntaxValid, false);
  assert.ok(parsed1.canonicalRejectionReason.includes('NON_HTTPS_SCHEME'));

  // Userinfo
  const parsed2 = parseHtml('<link rel="canonical" href="https://user:pass@yorven.in/test">', 'https://yorven.in/');
  assert.equal(parsed2.isCanonicalSyntaxValid, false);
  assert.ok(parsed2.canonicalRejectionReason.includes('USERINFO_DISALLOWED'));
});

test('HTML: classifies external canonical URL accurately', () => {
  const html = '<link rel="canonical" href="https://medium.com/@yorven/deep-dive">';
  const parsed = parseHtml(html, 'https://yorven.in/insights/deep-dive');

  assert.equal(parsed.isCanonicalSyntaxValid, true);
  assert.equal(parsed.isCanonicalExternal, true);
  assert.equal(parsed.canonicalUrl, 'https://medium.com/@yorven/deep-dive');
});

test('HTML: parses robots meta directives (noindex, nofollow, none)', () => {
  const parsed1 = parseHtml('<meta name="robots" content="noindex, follow">');
  assert.equal(parsed1.isIndexable, false);
  assert.equal(parsed1.isNoIndex, true);
  assert.equal(parsed1.isNoFollow, false);

  const parsed2 = parseHtml('<meta name="robots" content="none">');
  assert.equal(parsed2.isIndexable, false);
  assert.equal(parsed2.isNoIndex, true);
  assert.equal(parsed2.isNoFollow, true);

  const parsed3 = parseHtml('<meta name="robots" content="index, follow">');
  assert.equal(parsed3.isIndexable, true);
  assert.equal(parsed3.isNoIndex, false);
});

test('HTML: normalizes body text excluding chrome (nav, header, footer, script, style)', () => {
  const html = `<html>
<head><style>.test { color: red; }</style></head>
<body>
  <header>Header content</header>
  <nav>Navigation links</nav>
  <main>
    <p>This is the real content that matters for SEO duplicate detection.</p>
  </main>
  <script>console.log("script content");</script>
  <footer>Footer copyright notice</footer>
</body></html>`;

  const parsed = parseHtml(html, 'https://yorven.in/');
  assert.ok(!parsed.normalizedBodyText.includes('Header content'));
  assert.ok(!parsed.normalizedBodyText.includes('Navigation links'));
  assert.ok(!parsed.normalizedBodyText.includes('Footer copyright notice'));
  assert.ok(!parsed.normalizedBodyText.includes('script content'));
  assert.ok(parsed.normalizedBodyText.includes('This is the real content that matters for SEO duplicate detection.'));
  assert.ok(parsed.bodyTextHash !== null);
});

test('HTML: extracts outlinks and separates internal vs external', () => {
  const html = `<html><body>
  <a href="/services">Services</a>
  <a href="https://yorven.in/insights#intro">Insights with Fragment</a>
  <a href="https://twitter.com/yorven">Twitter</a>
  <a href="https://github.com/yorven">GitHub</a>
  <a href="#section">Internal Anchor Only</a>
  <a href="mailto:info@yorven.in">Mailto Link</a>
</body></html>`;

  const parsed = parseHtml(html, 'https://yorven.in/');
  assert.ok(parsed.internalOutlinks.includes('https://yorven.in/services'));
  assert.ok(parsed.internalOutlinks.includes('https://yorven.in/insights'));
  assert.ok(parsed.externalOutlinks.includes('https://twitter.com/yorven'));
  assert.ok(parsed.externalOutlinks.includes('https://github.com/yorven'));
  assert.equal(parsed.internalOutlinks.length, 2);
  assert.equal(parsed.externalOutlinks.length, 2);
});
