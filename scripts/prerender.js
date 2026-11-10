process.env.NODE_ENV = 'production'

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { seoRoutes, getRouteMeta } from '../src/data/seoData.js'
import { insights, validateArticles } from '../src/data/insights.js'

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function injectMetadata(html, meta) {
  // Title
  html = html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(meta.title)}</title>`)

  // Meta description
  if (html.includes('<meta name="description"')) {
    html = html.replace(/<meta name="description" content=".*?"\s*\/?>/s, `<meta name="description" content="${escapeHtml(meta.description)}" />`)
  } else {
    html = html.replace('</head>', `    <meta name="description" content="${escapeHtml(meta.description)}" />\n  </head>`)
  }

  // Canonical link
  if (html.includes('<link rel="canonical"')) {
    html = html.replace(/<link rel="canonical" href=".*?"\s*\/?>/s, `<link rel="canonical" href="${meta.canonical}" />`)
  } else {
    html = html.replace('</head>', `    <link rel="canonical" href="${meta.canonical}" />\n  </head>`)
  }

  // Robots
  if (html.includes('<meta name="robots"')) {
    html = html.replace(/<meta name="robots" content=".*?"\s*\/?>/s, `<meta name="robots" content="${meta.robots || 'index, follow'}" />`)
  } else {
    html = html.replace('</head>', `    <meta name="robots" content="${meta.robots || 'index, follow'}" />\n  </head>`)
  }

  // Strip existing OG, Twitter, and LD+JSON to avoid duplication
  html = html.replace(/<meta property="og:[^"]+" content=".*?"\s*\/?>\n?\s*/g, '')
  html = html.replace(/<meta name="twitter:[^"]+" content=".*?"\s*\/?>\n?\s*/g, '')
  html = html.replace(/<script type="application\/ld\+json">.*?<\/script>\n?\s*/gs, '')
  html = html.replace(/<script id="yorven-page-jsonld" type="application\/ld\+json">.*?<\/script>\n?\s*/gs, '')

  // Open Graph block
  const ogTags = [
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${meta.canonical}" />`,
    `<meta property="og:type" content="${meta.ogType || 'website'}" />`,
    `<meta property="og:image" content="${meta.ogImage}" />`,
    `<meta property="og:site_name" content="Yorven" />`
  ].join('\n    ')

  // Twitter block
  const twitterTags = [
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${meta.ogImage}" />`
  ].join('\n    ')

  // Schema.org JSON-LD
  let jsonLdBlock = ''
  if (meta.schema && meta.schema.length > 0) {
    const schemaContent = JSON.stringify(meta.schema.length === 1 ? meta.schema[0] : meta.schema)
    jsonLdBlock = `\n    <script id="yorven-page-jsonld" type="application/ld+json">${schemaContent}</script>`
  }

  const extraHead = `    ${ogTags}\n    ${twitterTags}${jsonLdBlock}\n  `
  html = html.replace('</head>', `${extraHead}</head>`)

  return html
}

async function runPrerender() {
  const distDir = path.resolve(process.cwd(), 'dist')
  const templatePath = path.join(distDir, 'index.html')
  const serverEntryPath = path.join(distDir, 'server', 'entry-server.js')

  if (!fs.existsSync(templatePath)) {
    console.error(`[Prerender] Error: Template not found at ${templatePath}. Run "vite build" first.`)
    process.exit(1)
  }

  if (!fs.existsSync(serverEntryPath)) {
    console.error(`[Prerender] Error: SSR bundle not found at ${serverEntryPath}.`)
    process.exit(1)
  }

  console.log('[Prerender] Loading SSR bundle...')
  const { render } = await import(pathToFileURL(serverEntryPath).href)
  const template = fs.readFileSync(templatePath, 'utf8')

  console.log('[Prerender] Validating article content schema...')
  validateArticles(insights)

  const routes = Object.keys(seoRoutes)
  console.log(`[Prerender] Prerendering ${routes.length} public routes...`)

  for (const route of routes) {
    const meta = getRouteMeta(route)
    const { html: appHtml } = render(route)

    let pageHtml = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
    pageHtml = injectMetadata(pageHtml, meta)

    let targetFile
    if (route === '/') {
      targetFile = path.join(distDir, 'index.html')
      fs.writeFileSync(targetFile, pageHtml, 'utf8')
    } else {
      const targetDir = path.join(distDir, route.slice(1))
      fs.mkdirSync(targetDir, { recursive: true })
      targetFile = path.join(targetDir, 'index.html')
      fs.writeFileSync(targetFile, pageHtml, 'utf8')

      // Also generate flat route.html (e.g. dist/work.html) for hosting environments using cleanUrls
      const flatFile = path.join(distDir, `${route.slice(1)}.html`)
      fs.mkdirSync(path.dirname(flatFile), { recursive: true })
      fs.writeFileSync(flatFile, pageHtml, 'utf8')
    }
    const sizeKb = (Buffer.byteLength(pageHtml, 'utf8') / 1024).toFixed(1)
    console.log(`  ✓ ${route.padEnd(22)} -> ${path.relative(distDir, targetFile)} (${sizeKb} kB)`)
  }

  // Remove temporary server bundle directory
  const serverDir = path.join(distDir, 'server')
  if (fs.existsSync(serverDir)) {
    fs.rmSync(serverDir, { recursive: true, force: true })
  }

  console.log('[Prerender] Prerendering completed successfully.')
}

runPrerender().catch((err) => {
  console.error('[Prerender] Fatal error:', err)
  process.exit(1)
})
