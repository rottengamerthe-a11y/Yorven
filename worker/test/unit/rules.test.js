import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, TOTAL_RULES_COUNT } from '../../src/rules/catalogue.js';
import { RuleEvaluator } from '../../src/rules/evaluator.js';

test('Rules Catalogue: exactly 34 rules with valid DB severities', () => {
  assert.equal(TOTAL_RULES_COUNT, 34);
  const ruleEntries = Object.values(RULES);
  assert.equal(ruleEntries.length, 34);

  const allowedDbSeverities = new Set(['critical', 'warning', 'info']);

  let criticalCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const rule of ruleEntries) {
    assert.ok(allowedDbSeverities.has(rule.dbSeverity), `Rule ${rule.code} has invalid DB severity ${rule.dbSeverity}`);
    assert.ok(rule.code.length > 0);
    assert.ok(rule.description.length > 0);
    assert.ok(rule.targetResource.length > 0);

    if (rule.category === 'critical') criticalCount++;
    if (rule.category === 'error') errorCount++;
    if (rule.category === 'warning') warningCount++;
    if (rule.category === 'info') infoCount++;

    // Assert mapping: all 'critical' and 'error' map to dbSeverity 'critical'
    if (rule.category === 'critical' || rule.category === 'error') {
      assert.equal(rule.dbSeverity, 'critical', `Rule ${rule.code} must map to 'critical' in DB`);
    } else if (rule.category === 'warning') {
      assert.equal(rule.dbSeverity, 'warning', `Rule ${rule.code} must map to 'warning' in DB`);
    } else if (rule.category === 'info') {
      assert.equal(rule.dbSeverity, 'info', `Rule ${rule.code} must map to 'info' in DB`);
    }
  }

  assert.equal(criticalCount, 8, 'Must have exactly 8 Critical rules (1-8)');
  assert.equal(errorCount, 10, 'Must have exactly 10 Error rules (9-18)');
  assert.equal(warningCount, 14, 'Must have exactly 14 Warning rules (19-32)');
  assert.equal(infoCount, 2, 'Must have exactly 2 Info rules (33-34)');
});

test('Rule Evaluation: evaluates sitemap document findings (Rules 1, 2, 3)', () => {
  // Rule 1: ERR_SITEMAP_DOCUMENT_ERROR
  const res1 = RuleEvaluator.evaluateHttpFindings({
    status: 404,
    resourceType: 'sitemap'
  });
  assert.equal(res1[0].rule_code, 'ERR_SITEMAP_DOCUMENT_ERROR');
  assert.equal(res1[0].severity, 'critical');

  // Rule 2: ERR_SITEMAP_DOCUMENT_ROBOTS_DISALLOWED
  const res2 = RuleEvaluator.evaluateRobotsDisallowed({
    url: 'https://yorven.in/sitemap.xml',
    resourceType: 'sitemap'
  });
  assert.equal(res2[0].rule_code, 'ERR_SITEMAP_DOCUMENT_ROBOTS_DISALLOWED');
  assert.equal(res2[0].severity, 'critical');

  // Rule 3: ERR_SITEMAP_MALFORMED_XML
  const issue3 = RuleEvaluator.createIssue('ERR_SITEMAP_MALFORMED_XML', 'Malformed XML test');
  assert.equal(issue3.rule_code, 'ERR_SITEMAP_MALFORMED_XML');
  assert.equal(issue3.severity, 'critical');
});

test('Rule Evaluation: distinguishes sitemap-listed page vs internal page HTTP errors (Rules 4, 5, 6, 7, 8, 9)', () => {
  // Rule 4 vs Rule 9 (4xx)
  const resSitemap4xx = RuleEvaluator.evaluateHttpFindings({ status: 404, isInSitemap: true, resourceType: 'page' });
  assert.equal(resSitemap4xx[0].rule_code, 'ERR_SITEMAP_LISTED_PAGE_4XX');
  assert.equal(resSitemap4xx[0].severity, 'critical');

  const resInternal4xx = RuleEvaluator.evaluateHttpFindings({ status: 404, isInSitemap: false, resourceType: 'page' });
  assert.equal(resInternal4xx[0].rule_code, 'ERR_HTTP_STATUS_4XX');
  assert.equal(resInternal4xx[0].severity, 'critical'); // mapped to critical

  // Rule 5 vs Rule 7 (5xx exhausted)
  const resSitemap5xx = RuleEvaluator.evaluateHttpFindings({ status: 503, isInSitemap: true, resourceType: 'page' });
  assert.equal(resSitemap5xx[0].rule_code, 'ERR_SITEMAP_LISTED_PAGE_5XX');
  assert.equal(resSitemap5xx[0].severity, 'critical');

  const resInternal5xx = RuleEvaluator.evaluateHttpFindings({ status: 503, isInSitemap: false, resourceType: 'page' });
  assert.equal(resInternal5xx[0].rule_code, 'ERR_HTTP_STATUS_5XX');
  assert.equal(resInternal5xx[0].severity, 'critical');

  // Rule 6 vs Rule 8 (transport failure)
  const resSitemapTrans = RuleEvaluator.evaluateHttpFindings({ status: 0, isInSitemap: true, resourceType: 'page', isTransportFailure: true });
  assert.equal(resSitemapTrans[0].rule_code, 'ERR_SITEMAP_LISTED_PAGE_TRANSPORT');
  assert.equal(resSitemapTrans[0].severity, 'critical');

  const resInternalTrans = RuleEvaluator.evaluateHttpFindings({ status: 0, isInSitemap: false, resourceType: 'page', isTransportFailure: true });
  assert.equal(resInternalTrans[0].rule_code, 'ERR_TRANSPORT_FAILURE');
  assert.equal(resInternalTrans[0].severity, 'critical');
});

test('Rule Evaluation: evaluates unexpected status codes (Rule 10)', () => {
  const res1 = RuleEvaluator.evaluateHttpFindings({ status: 300, resourceType: 'page' });
  assert.equal(res1[0].rule_code, 'ERR_HTTP_UNEXPECTED_STATUS');
  assert.equal(res1[0].severity, 'critical');

  const res2 = RuleEvaluator.evaluateHttpFindings({ status: 601, resourceType: 'page' });
  assert.equal(res2[0].rule_code, 'ERR_HTTP_UNEXPECTED_STATUS');
});

test('Rule Evaluation: evaluates robots disallowance on pages (Rules 11, 29)', () => {
  const resSitemap = RuleEvaluator.evaluateRobotsDisallowed({ url: 'https://yorven.in/page', isInSitemap: true });
  assert.equal(resSitemap[0].rule_code, 'ERR_SITEMAP_ROBOTS_DISALLOWED');
  assert.equal(resSitemap[0].severity, 'critical');

  const resInternal = RuleEvaluator.evaluateRobotsDisallowed({ url: 'https://yorven.in/page', isInSitemap: false });
  assert.equal(resInternal[0].rule_code, 'WARN_ROBOTS_DISALLOWED');
  assert.equal(resInternal[0].severity, 'warning');
});

test('Rule Evaluation: evaluates redirect loops and temporary 302 redirects (Rules 12, 21)', () => {
  // Temporary 302
  const res = RuleEvaluator.evaluateHttpFindings({
    status: 200,
    redirectChain: [{ from: 'https://yorven.in/a', to: 'https://yorven.in/b', status: 302 }]
  });
  assert.equal(res[0].rule_code, 'WARN_REDIRECT_302_TEMPORARY');
  assert.equal(res[0].severity, 'warning');

  // Loop issue
  const loopIssue = RuleEvaluator.createIssue('ERR_REDIRECT_CHAIN_LOOP', 'Loop detected');
  assert.equal(loopIssue.rule_code, 'ERR_REDIRECT_CHAIN_LOOP');
  assert.equal(loopIssue.severity, 'critical');
});

test('Rule Evaluation: evaluates on-page HTML rules (Rules 13, 14, 15, 20, 22-28, 30-34)', () => {
  // 1. Missing title, missing meta desc, missing H1, missing canonical (Rules 13, 14, 24, 28)
  const emptyHtml = {
    title: '',
    metaDescription: '',
    h1Count: 0,
    rawCanonical: null,
    isIndexable: true,
    isNoIndex: false
  };
  const issues1 = RuleEvaluator.evaluateHtmlPage(emptyHtml, { currentUrl: 'https://yorven.in/test' });
  const codes1 = issues1.map(i => i.rule_code);
  assert.ok(codes1.includes('ERR_TITLE_MISSING'));
  assert.ok(codes1.includes('ERR_H1_MISSING'));
  assert.ok(codes1.includes('WARN_META_DESC_MISSING'));
  assert.ok(codes1.includes('WARN_CANONICAL_MISSING'));

  // 2. Title too short & too long (Rules 22, 23)
  const shortTitle = { title: 'Short', metaDescription: 'Valid meta description with length over fifty characters for testing.', h1Count: 1, rawCanonical: 'https://yorven.in/test' };
  const issuesShort = RuleEvaluator.evaluateHtmlPage(shortTitle, { currentUrl: 'https://yorven.in/test' });
  assert.ok(issuesShort.map(i => i.rule_code).includes('WARN_TITLE_TOO_SHORT'));

  const longTitle = { title: 'A'.repeat(70), metaDescription: 'Valid meta description with length over fifty characters for testing.', h1Count: 1, rawCanonical: 'https://yorven.in/test' };
  const issuesLong = RuleEvaluator.evaluateHtmlPage(longTitle, { currentUrl: 'https://yorven.in/test' });
  assert.ok(issuesLong.map(i => i.rule_code).includes('WARN_TITLE_TOO_LONG'));

  // 3. Meta desc too short & too long (Rules 25, 26)
  const shortMeta = { title: 'Valid Title Between 15 and 65 chars', metaDescription: 'Too short', h1Count: 1, rawCanonical: 'https://yorven.in/test' };
  const issuesShortMeta = RuleEvaluator.evaluateHtmlPage(shortMeta, { currentUrl: 'https://yorven.in/test' });
  assert.ok(issuesShortMeta.map(i => i.rule_code).includes('WARN_META_DESC_TOO_SHORT'));

  const longMeta = { title: 'Valid Title Between 15 and 65 chars', metaDescription: 'A'.repeat(170), h1Count: 1, rawCanonical: 'https://yorven.in/test' };
  const issuesLongMeta = RuleEvaluator.evaluateHtmlPage(longMeta, { currentUrl: 'https://yorven.in/test' });
  assert.ok(issuesLongMeta.map(i => i.rule_code).includes('WARN_META_DESC_TOO_LONG'));

  // 4. Multiple H1 (Rule 27)
  const multiH1 = { title: 'Valid Title Between 15 and 65 chars', metaDescription: 'A'.repeat(60), h1Count: 2, rawCanonical: 'https://yorven.in/test' };
  const issuesMultiH1 = RuleEvaluator.evaluateHtmlPage(multiH1, { currentUrl: 'https://yorven.in/test' });
  assert.ok(issuesMultiH1.map(i => i.rule_code).includes('WARN_H1_MULTIPLE'));

  // 5. Invalid canonical syntax (Rule 15)
  const invalidCanon = { title: 'Valid Title Between 15 and 65 chars', metaDescription: 'A'.repeat(60), h1Count: 1, rawCanonical: 'http://yorven.in', isCanonicalSyntaxValid: false, canonicalRejectionReason: 'NON_HTTPS' };
  const issuesCanon = RuleEvaluator.evaluateHtmlPage(invalidCanon, { currentUrl: 'https://yorven.in/test' });
  assert.ok(issuesCanon.map(i => i.rule_code).includes('ERR_CANONICAL_SYNTAX_INVALID'));

  // 6. Sitemap Noindex contradiction (Rule 30)
  const noindexSitemap = { title: 'Valid Title Between 15 and 65 chars', metaDescription: 'A'.repeat(60), h1Count: 1, rawCanonical: 'https://yorven.in/test', isNoIndex: true };
  const issuesNoindex = RuleEvaluator.evaluateHtmlPage(noindexSitemap, { currentUrl: 'https://yorven.in/test', isInSitemap: true });
  assert.ok(issuesNoindex.map(i => i.rule_code).includes('WARN_SITEMAP_NOINDEX'));

  // 7. Duplicate content hash (Rule 31)
  const knownHashes = new Set(['abc123hash']);
  const dupContent = { title: 'Valid Title Between 15 and 65 chars', metaDescription: 'A'.repeat(60), h1Count: 1, rawCanonical: 'https://yorven.in/test', bodyTextLength: 200, bodyTextHash: 'abc123hash' };
  const issuesDup = RuleEvaluator.evaluateHtmlPage(dupContent, { currentUrl: 'https://yorven.in/test', knownBodyHashes: knownHashes });
  assert.ok(issuesDup.map(i => i.rule_code).includes('WARN_DUPLICATE_CONTENT_HASH'));

  // 8. Indexable not in sitemap (Rule 33)
  const healthyInternal = { title: 'Valid Title Between 15 and 65 chars', metaDescription: 'A'.repeat(60), h1Count: 1, rawCanonical: 'https://yorven.in/test', canonicalUrl: 'https://yorven.in/test', isIndexable: true };
  const issuesNotInSitemap = RuleEvaluator.evaluateHtmlPage(healthyInternal, { currentUrl: 'https://yorven.in/test', isInSitemap: false });
  assert.ok(issuesNotInSitemap.map(i => i.rule_code).includes('INFO_INDEXABLE_NOT_IN_SITEMAP'));

  // 9. Canonical targets (Rules 16, 17, 18, 19, 32, 34)
  assert.equal(RuleEvaluator.createIssue('ERR_CANONICAL_TARGET_BROKEN').rule_code, 'ERR_CANONICAL_TARGET_BROKEN');
  assert.equal(RuleEvaluator.createIssue('ERR_CANONICAL_TARGET_BLOCKED').rule_code, 'ERR_CANONICAL_TARGET_BLOCKED');
  assert.equal(RuleEvaluator.createIssue('ERR_CANONICAL_PING_PONG_LOOP').rule_code, 'ERR_CANONICAL_PING_PONG_LOOP');
  assert.equal(RuleEvaluator.createIssue('WARN_CANONICAL_CHAIN').rule_code, 'WARN_CANONICAL_CHAIN');
  assert.equal(RuleEvaluator.createIssue('WARN_CANONICAL_MISMATCH').rule_code, 'WARN_CANONICAL_MISMATCH');
  assert.equal(RuleEvaluator.createIssue('INFO_CANONICAL_TARGET_UNRESOLVED').rule_code, 'INFO_CANONICAL_TARGET_UNRESOLVED');
});

test('Rule Evaluation: HTTP 206 Partial Content emits WARN_HTTP_PARTIAL_CONTENT and bypasses HTML evaluation', () => {
  const issues = RuleEvaluator.evaluateHttpFindings({
    status: 206,
    resourceType: 'page',
    isInSitemap: false
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule_code, 'WARN_HTTP_PARTIAL_CONTENT');
  assert.equal(issues[0].severity, 'warning');
  assert.equal(issues[0].target_resource, 'page');
  assert.ok(issues[0].message.includes('206'));
  assert.deepEqual(issues[0].context_data, { status: 206 });
});

test('Rule Evaluation: ERR_REDIRECT_CHAIN_LOOP creates critical issue with target redirect_hop', () => {
  const chain = [
    { from: 'https://yorven.in/a', to: 'https://yorven.in/b', status: 301 },
    { from: 'https://yorven.in/b', to: 'https://yorven.in/a', status: 302 }
  ];
  const issue = RuleEvaluator.createIssue(
    'ERR_REDIRECT_CHAIN_LOOP',
    'Circular redirect loop detected',
    { redirectChain: chain }
  );

  assert.equal(issue.rule_code, 'ERR_REDIRECT_CHAIN_LOOP');
  assert.equal(issue.severity, 'critical');
  assert.equal(issue.target_resource, 'redirect_hop');
  assert.equal(issue.message, 'Circular redirect loop detected');
  assert.deepEqual(issue.context_data.redirectChain, chain);
});

test('Rule Evaluation: Rule 17 ERR_CANONICAL_TARGET_BLOCKED evaluation logic', async () => {
  const { RobotsManager } = await import('../../src/parser/robots.js');
  const robotsTxt = `
User-agent: *
Disallow: /private/
Disallow: /admin/
Allow: /admin/public
Disallow: /*?secret=
`;
  const robotsManager = new RobotsManager('https://yorven.in/robots.txt', robotsTxt);

  // 1. Allowed internal canonical target does NOT trigger Rule 17
  const allowedDoc = {
    title: 'Valid Title Over 15 Chars',
    h1Count: 1,
    rawCanonical: 'https://yorven.in/blog/post-1',
    canonicalUrl: 'https://yorven.in/blog/post-1',
    isCanonicalSyntaxValid: true,
    isCanonicalExternal: false,
    isIndexable: true
  };
  const issuesAllowed = RuleEvaluator.evaluateHtmlPage(allowedDoc, {
    currentUrl: 'https://yorven.in/blog/post-1',
    robotsManager
  });
  assert.ok(!issuesAllowed.some(i => i.rule_code === 'ERR_CANONICAL_TARGET_BLOCKED'));

  // 2. Disallowed internal canonical target DOES trigger Rule 17
  const blockedDoc = {
    title: 'Valid Title Over 15 Chars',
    h1Count: 1,
    rawCanonical: 'https://yorven.in/private/account',
    canonicalUrl: 'https://yorven.in/private/account',
    isCanonicalSyntaxValid: true,
    isCanonicalExternal: false,
    isIndexable: true
  };
  const issuesBlocked = RuleEvaluator.evaluateHtmlPage(blockedDoc, {
    currentUrl: 'https://yorven.in/public-page',
    robotsManager
  });
  const rule17 = issuesBlocked.find(i => i.rule_code === 'ERR_CANONICAL_TARGET_BLOCKED');
  assert.ok(rule17, 'ERR_CANONICAL_TARGET_BLOCKED must be emitted');
  assert.equal(rule17.severity, 'critical');
  assert.equal(rule17.target_resource, 'html_document');
  assert.ok(rule17.message.includes('/private/account'));
  assert.equal(rule17.context_data.canonicalUrl, 'https://yorven.in/private/account');

  // 3. External canonical URL does NOT trigger Rule 17 (even if path looks disallowed locally)
  const externalDoc = {
    title: 'Valid Title Over 15 Chars',
    h1Count: 1,
    rawCanonical: 'https://external.com/private/account',
    canonicalUrl: 'https://external.com/private/account',
    isCanonicalSyntaxValid: true,
    isCanonicalExternal: true,
    isIndexable: true
  };
  const issuesExternal = RuleEvaluator.evaluateHtmlPage(externalDoc, {
    currentUrl: 'https://yorven.in/public-page',
    robotsManager
  });
  assert.ok(!issuesExternal.some(i => i.rule_code === 'ERR_CANONICAL_TARGET_BLOCKED'));

  // 4. Invalid canonical URL does NOT trigger Rule 17 (triggers ERR_CANONICAL_SYNTAX_INVALID)
  const invalidDoc = {
    title: 'Valid Title Over 15 Chars',
    h1Count: 1,
    rawCanonical: 'http://yorven.in/private/account',
    canonicalUrl: null,
    isCanonicalSyntaxValid: false,
    isCanonicalExternal: false,
    canonicalRejectionReason: 'NON_HTTPS_SCHEME',
    isIndexable: true
  };
  const issuesInvalid = RuleEvaluator.evaluateHtmlPage(invalidDoc, {
    currentUrl: 'https://yorven.in/public-page',
    robotsManager
  });
  assert.ok(!issuesInvalid.some(i => i.rule_code === 'ERR_CANONICAL_TARGET_BLOCKED'));
  assert.ok(issuesInvalid.some(i => i.rule_code === 'ERR_CANONICAL_SYNTAX_INVALID'));

  // 5. Missing canonical URL does NOT trigger Rule 17 (triggers WARN_CANONICAL_MISSING)
  const missingDoc = {
    title: 'Valid Title Over 15 Chars',
    h1Count: 1,
    rawCanonical: null,
    canonicalUrl: null,
    isCanonicalSyntaxValid: true,
    isCanonicalExternal: false,
    isIndexable: true
  };
  const issuesMissing = RuleEvaluator.evaluateHtmlPage(missingDoc, {
    currentUrl: 'https://yorven.in/public-page',
    robotsManager
  });
  assert.ok(!issuesMissing.some(i => i.rule_code === 'ERR_CANONICAL_TARGET_BLOCKED'));
  assert.ok(issuesMissing.some(i => i.rule_code === 'WARN_CANONICAL_MISSING'));

  // 6. Path-specific robots rules: /admin/ is blocked, but /admin/public is allowed
  const adminAllowedDoc = {
    title: 'Valid Title Over 15 Chars',
    h1Count: 1,
    rawCanonical: 'https://yorven.in/admin/public',
    canonicalUrl: 'https://yorven.in/admin/public',
    isCanonicalSyntaxValid: true,
    isCanonicalExternal: false,
    isIndexable: true
  };
  const issuesAdminAllowed = RuleEvaluator.evaluateHtmlPage(adminAllowedDoc, {
    currentUrl: 'https://yorven.in/public-page',
    robotsManager
  });
  assert.ok(!issuesAdminAllowed.some(i => i.rule_code === 'ERR_CANONICAL_TARGET_BLOCKED'));

  const adminBlockedDoc = {
    title: 'Valid Title Over 15 Chars',
    h1Count: 1,
    rawCanonical: 'https://yorven.in/admin/dashboard',
    canonicalUrl: 'https://yorven.in/admin/dashboard',
    isCanonicalSyntaxValid: true,
    isCanonicalExternal: false,
    isIndexable: true
  };
  const issuesAdminBlocked = RuleEvaluator.evaluateHtmlPage(adminBlockedDoc, {
    currentUrl: 'https://yorven.in/public-page',
    robotsManager
  });
  assert.ok(issuesAdminBlocked.some(i => i.rule_code === 'ERR_CANONICAL_TARGET_BLOCKED'));
});
