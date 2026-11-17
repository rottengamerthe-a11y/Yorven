import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { work, modernClasses, allProjects, services } from '../../src/data/site.js';
import { seoRoutes } from '../../src/data/seoData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('Internal Linking & Case Study Route Verification', () => {
  const expected4CaseStudySlugs = [
    'payper-ai',
    'racers-vault',
    'aurix',
    'modern-classes'
  ];

  test('Payper AI canonical project slug is payper-ai in site data and SEO data', () => {
    // 1. In work array
    const payperProject = work.find((p) => p.slug === 'payper-ai');
    assert.ok(payperProject, 'work array must contain project with slug "payper-ai"');
    assert.equal(payperProject.slug, 'payper-ai');

    // 2. In allProjects array
    const inAll = allProjects.find((p) => p.slug === 'payper-ai');
    assert.ok(inAll, 'allProjects array must contain "payper-ai"');

    // 3. In digital-products service caseStudySlugs
    const digitalProductsSvc = services.find((s) => s.slug === 'digital-products');
    assert.ok(digitalProductsSvc.caseStudySlugs.includes('payper-ai'), 'digital-products must reference payper-ai');
    assert.ok(!digitalProductsSvc.caseStudySlugs.includes('proofpay-ai'), 'digital-products must NOT reference proofpay-ai');

    // 4. In seoRoutes SSOT
    assert.ok(seoRoutes['/work/payper-ai'], 'seoRoutes must define metadata for /work/payper-ai');
    assert.equal(seoRoutes['/work/payper-ai'].canonical, 'https://yorven.in/work/payper-ai');
    assert.strictEqual(seoRoutes['/work/proofpay-ai'], undefined, 'seoRoutes must not contain obsolete proofpay-ai');
  });

  test('vercel.json specifies permanent 308 redirect from /work/proofpay-ai to /work/payper-ai', () => {
    const vercelConfigPath = path.join(rootDir, 'vercel.json');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

    assert.ok(Array.isArray(vercelConfig.redirects), 'vercel.json must have a redirects array');
    const redirectRule = vercelConfig.redirects.find(
      (r) => r.source === '/work/proofpay-ai' && r.destination === '/work/payper-ai'
    );
    assert.ok(redirectRule, 'vercel.json must redirect /work/proofpay-ai to /work/payper-ai');
    assert.strictEqual(redirectRule.permanent, true, 'Redirect must be permanent (308)');
  });

  test('All four case studies are present in allProjects and will render in Work directory', () => {
    assert.equal(allProjects.length, 4, 'allProjects must contain exactly 4 projects');

    const slugs = allProjects.map((p) => p.slug);
    for (const expectedSlug of expected4CaseStudySlugs) {
      assert.ok(slugs.includes(expectedSlug), `allProjects must include slug "${expectedSlug}"`);
    }

    // Verify Modern Classes is in allProjects
    const mcProject = allProjects.find((p) => p.slug === 'modern-classes');
    assert.ok(mcProject, 'Modern Classes must be present in allProjects');
    assert.equal(mcProject.slug, 'modern-classes');

    // Verify main.jsx uses allProjects in Work()
    const mainJsxPath = path.join(rootDir, 'src/main.jsx');
    const mainJsx = fs.readFileSync(mainJsxPath, 'utf8');

    const workFnMatch = mainJsx.match(/function Work\(\)\s*\{[\s\S]*?allProjects\.map[\s\S]*?\}/);
    assert.ok(workFnMatch, 'Work() component in src/main.jsx must map over allProjects');
  });

  test('Case-study next-project navigation cycles cleanly through all 4 projects without duplicates', () => {
    for (let i = 0; i < allProjects.length; i++) {
      const current = allProjects[i];
      const nextIndex = (i + 1) % allProjects.length;
      const nextItem = allProjects[nextIndex];

      assert.notEqual(current.slug, nextItem.slug, 'Next project must not be the current project');
      assert.ok(expected4CaseStudySlugs.includes(nextItem.slug), `Next slug "${nextItem.slug}" must be valid`);
    }

    // Verify sequence: payper-ai -> racers-vault -> aurix -> modern-classes -> payper-ai
    assert.equal(allProjects[0].slug, 'payper-ai');
    assert.equal(allProjects[1].slug, 'racers-vault');
    assert.equal(allProjects[2].slug, 'aurix');
    assert.equal(allProjects[3].slug, 'modern-classes');
  });

  test('Case-study back links point to /work with anchor-backed Link elements', () => {
    const mainJsxPath = path.join(rootDir, 'src/main.jsx');
    const mainJsx = fs.readFileSync(mainJsxPath, 'utf8');

    // 1. ModernClassesCaseStudy back link
    const mcBackMatch = mainJsx.includes('<Link to="/work" className="cs-back-link">');
    assert.ok(mcBackMatch, 'ModernClassesCaseStudy must link back to /work with Link to="/work"');

    // 2. CaseStudy editorial header back link
    const csBackMatches = [...mainJsx.matchAll(/<Link to="\/work" className="cs-back-link">/g)];
    assert.equal(csBackMatches.length, 2, 'Both ModernClassesCaseStudy and CaseStudy must have Link to="/work" as cs-back-link');

    // 3. Neither case study should use anchor hashes (#proof or #featured-products) as back links
    assert.ok(!mainJsx.includes('href="/#proof"'), 'Must not have href="/#proof" back link');
    assert.ok(!mainJsx.includes('href="/#featured-products"'), 'Must not have href="/#featured-products" back link');
  });

  test('Homepage includes crawlable links to /services and /work in body sections', () => {
    const landingJsxPath = path.join(rootDir, 'src/landing/Landing.jsx');
    const landingJsx = fs.readFileSync(landingJsxPath, 'utf8');

    // 1. Link to /work in portfolio section
    assert.ok(
      landingJsx.includes('<Link to="/work"'),
      'Landing.jsx portfolio section must include a crawlable Link to="/work"'
    );

    // 2. Link to /services in services section
    assert.ok(
      landingJsx.includes('<Link to="/services"'),
      'Landing.jsx services section must include a crawlable Link to="/services"'
    );
  });

  test('No internal links or router targets point to the obsolete proofpay-ai slug', () => {
    const siteJsPath = path.join(rootDir, 'src/data/site.js');
    const mainJsxPath = path.join(rootDir, 'src/main.jsx');
    const landingJsxPath = path.join(rootDir, 'src/landing/Landing.jsx');

    const siteJs = fs.readFileSync(siteJsPath, 'utf8');
    const mainJsx = fs.readFileSync(mainJsxPath, 'utf8');
    const landingJsx = fs.readFileSync(landingJsxPath, 'utf8');

    // site.js: no proofpay-ai in slug definitions or arrays
    assert.ok(!siteJs.includes("'proofpay-ai'"), "site.js must not contain 'proofpay-ai'");
    assert.ok(!siteJs.includes('"proofpay-ai"'), 'site.js must not contain "proofpay-ai"');

    // landing.jsx: no Link to proofpay-ai
    assert.ok(!landingJsx.includes('/work/proofpay-ai'), 'Landing.jsx must not link to /work/proofpay-ai');

    // main.jsx: no Link to proofpay-ai (only the Navigate redirect is allowed)
    const linkToProofpay = mainJsx.match(/to=\{?['"`]\/work\/proofpay-ai['"`]\}?/g);
    assert.strictEqual(linkToProofpay, null, 'main.jsx must not have any Link to /work/proofpay-ai');

    // Verify Navigate redirect is present in main.jsx routes
    assert.ok(
      mainJsx.includes('<Route path="/work/proofpay-ai" element={<Navigate to="/work/payper-ai" replace />} />'),
      'main.jsx must define a client-side redirect route from /work/proofpay-ai to /work/payper-ai'
    );
  });
});
