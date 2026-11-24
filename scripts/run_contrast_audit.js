import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const BASE_URL = 'http://127.0.0.1:5173'

const ROUTES = [
  '/',
  '/services',
  '/services/websites',
  '/services/digital-products',
  '/services/systems',
  '/work',
  '/work/aurix',
  '/work/racers-vault',
  '/work/payper-ai',
  '/work/modern-classes',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/cookies',
  '/insights',
  '/glass-lab'
]

const VIEWPORTS = [
  { name: '1440px', width: 1440, height: 900 },
  { name: '375px', width: 375, height: 812 }
]

function parseRgb(colorStr) {
  if (!colorStr) return null
  const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (!m) return null
  return {
    r: parseInt(m[1], 10),
    g: parseInt(m[2], 10),
    b: parseInt(m[3], 10),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1.0
  }
}

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  )
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function getContrast(fg, bg) {
  const l1 = getLuminance(fg.r, fg.g, fg.b)
  const l2 = getLuminance(bg.r, bg.g, bg.b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

async function runAudit() {
  console.log(`Starting expanded contrast audit on ${BASE_URL}...`)
  const browser = await chromium.launch({ headless: true })
  const report = []
  const navReport = []
  let totalViolations = 0

  for (const vp of VIEWPORTS) {
    console.log(`\n================ Viewport: ${vp.name} ================`)
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })

    for (const route of ROUTES) {
      const page = await context.newPage()
      const url = `${BASE_URL}${route}`
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
        await page.waitForTimeout(500) // Wait for render and fonts

        // 1. Run Axe Core color-contrast rule
        const axeResults = await new AxeBuilder({ page })
          .withRules(['color-contrast'])
          .analyze()

        // 2. Compute in-depth text contrast across visible elements
        const domAnalysis = await page.evaluate(() => {
          function parseRgb(colorStr) {
            const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
            if (!m) return null
            return {
              r: parseInt(m[1], 10),
              g: parseInt(m[2], 10),
              b: parseInt(m[3], 10),
              a: m[4] !== undefined ? parseFloat(m[4]) : 1.0
            }
          }
          function getLuminance(r, g, b) {
            const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
              c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
            )
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
          }
          function getEffectiveBg(el) {
            let cur = el
            while (cur && cur !== document.documentElement) {
              const bg = window.getComputedStyle(cur).backgroundColor
              const parsed = parseRgb(bg)
              if (parsed && parsed.a > 0.4) {
                return parsed
              }
              cur = cur.parentElement
            }
            return { r: 10, g: 18, b: 16, a: 1 } // default base dark
          }

          const elements = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span, a, button, label, li, strong, small'))
          let lowest = 999
          let lowestItem = null
          const failures = []

          for (const el of elements) {
            if (!el.innerText || !el.innerText.trim()) continue
            const rect = el.getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0) continue

            const style = window.getComputedStyle(el)
            if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.1) continue

            const fg = parseRgb(style.color)
            const bg = getEffectiveBg(el)
            if (!fg || !bg) continue

            // Composite fg alpha over bg
            const blendedFg = {
              r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
              g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
              b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a))
            }

            const l1 = getLuminance(blendedFg.r, blendedFg.g, blendedFg.b)
            const l2 = getLuminance(bg.r, bg.g, bg.b)
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)

            const fontSize = parseFloat(style.fontSize) || 16
            const isBold = parseInt(style.fontWeight, 10) >= 700 || style.fontWeight === 'bold'
            const isLarge = fontSize >= 24 || (fontSize >= 18.66 && isBold)
            const targetMin = isLarge ? 3.0 : 4.5

            if (ratio < lowest) {
              lowest = ratio
              lowestItem = {
                tag: el.tagName.toLowerCase(),
                text: el.innerText.trim().substring(0, 35),
                ratio: Number(ratio.toFixed(2)),
                fg: style.color,
                fontSize
              }
            }

            if (ratio < targetMin - 0.05) {
              failures.push({
                tag: el.tagName.toLowerCase(),
                text: el.innerText.trim().substring(0, 40),
                ratio: Number(ratio.toFixed(2)),
                required: targetMin,
                fg: style.color
              })
            }
          }

          return { lowest, lowestItem, failures }
        })

        const axeColorViolations = axeResults.violations.filter((v) => v.id === 'color-contrast')
        const pass = axeColorViolations.length === 0 && domAnalysis.failures.length === 0

        if (!pass) totalViolations += (axeColorViolations.length + domAnalysis.failures.length)

        report.push({
          route,
          viewport: vp.name,
          lowestRatio: domAnalysis.lowestItem ? `${domAnalysis.lowestItem.ratio}:1` : 'N/A',
          lowestElement: domAnalysis.lowestItem ? `<${domAnalysis.lowestItem.tag}> "${domAnalysis.lowestItem.text}"` : 'N/A',
          status: pass ? 'PASS' : 'FAIL',
          violations: [...axeColorViolations.map((v) => v.help), ...domAnalysis.failures.map((f) => `<${f.tag}> "${f.text}" (${f.ratio}:1 < ${f.required}:1)`)]
        })

        // 3. Multi-Scroll Position Nav Audit (5 distinct scroll states per route)
        // Positions: 1: top, 2: dark section, 3: cream section (or 40% height), 4: over image/card, 5: footer/bottom
        const scrollPositions = await page.evaluate(() => {
          const docH = document.body.scrollHeight
          const winH = window.innerHeight

          const creamEl = document.querySelector('.lp-light, [data-theme="light"], [data-theme="cream"], .surface-light')
          const creamY = creamEl ? Math.max(0, creamEl.getBoundingClientRect().top + window.scrollY + 80) : Math.round(docH * 0.4)

          const imgEl = document.querySelector('img, [class*="poster"], [class*="card"]')
          const imgY = imgEl ? Math.max(0, imgEl.getBoundingClientRect().top + window.scrollY + 80) : Math.round(docH * 0.65)

          const darkEl = document.querySelector('#work, #services, #features, #results, .section')
          const darkY = darkEl ? Math.max(0, darkEl.getBoundingClientRect().top + window.scrollY + 80) : Math.round(docH * 0.2)

          const footerEl = document.querySelector('.footer, footer')
          const footerY = footerEl ? Math.max(0, footerEl.getBoundingClientRect().top + window.scrollY + 80) : Math.max(0, docH - winH)

          return [
            { name: '1. Top / Hero', y: 0 },
            { name: '2. Dark Section', y: darkY },
            { name: '3. Cream Section', y: creamY },
            { name: '4. Over Image / Card', y: imgY },
            { name: '5. Bottom / Footer', y: footerY }
          ]
        })

        for (const sp of scrollPositions) {
          await page.evaluate((targetY) => {
            window.scrollTo({ top: targetY, behavior: 'instant' })
          }, sp.y)
          await page.waitForTimeout(450) // Wait 200ms for nav transition + settle

          const navContrast = await page.evaluate((posName) => {
            function parseRgb(colorStr) {
              const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
              if (!m) return null
              return {
                r: parseInt(m[1], 10),
                g: parseInt(m[2], 10),
                b: parseInt(m[3], 10),
                a: m[4] !== undefined ? parseFloat(m[4]) : 1.0
              }
            }
            function getLuminance(r, g, b) {
              const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
                c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
              )
              return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
            }
            function getContrast(fg, bg) {
              const l1 = getLuminance(fg.r, fg.g, fg.b)
              const l2 = getLuminance(bg.r, bg.g, bg.b)
              const lighter = Math.max(l1, l2)
              const darker = Math.min(l1, l2)
              return (lighter + 0.05) / (darker + 0.05)
            }

            const navWrap = document.querySelector('.nav-wrap.floating-pill-nav')
            if (!navWrap) return { posName, status: 'SKIPPED', minRatio: 999 }

            const navBackdrop = navWrap.querySelector('.liquid-glass-backdrop') || navWrap.querySelector('.nav')
            const navBgStyle = window.getComputedStyle(navBackdrop).backgroundColor
            const parsedNavBg = parseRgb(navBgStyle) || { r: 10, g: 18, b: 16, a: 0.68 }

            // Find surface directly beneath nav center point
            const elements = document.elementsFromPoint(window.innerWidth / 2, 48) || []
            const surfaceEl = elements.find(el => !el.closest('.nav-wrap'))
            let surfaceBg = { r: 10, g: 18, b: 16, a: 1 }
            if (surfaceEl) {
              let cur = surfaceEl
              while (cur && cur !== document.documentElement) {
                const sbg = parseRgb(window.getComputedStyle(cur).backgroundColor)
                if (sbg && sbg.a > 0.4) {
                  surfaceBg = sbg
                  break
                }
                cur = cur.parentElement
              }
            }

            // Effective composite background of the nav pill over the surface
            const effectiveBg = {
              r: Math.round(parsedNavBg.r * parsedNavBg.a + surfaceBg.r * (1 - parsedNavBg.a)),
              g: Math.round(parsedNavBg.g * parsedNavBg.a + surfaceBg.g * (1 - parsedNavBg.a)),
              b: Math.round(parsedNavBg.b * parsedNavBg.a + surfaceBg.b * (1 - parsedNavBg.a))
            }

            const isMobile = window.innerWidth < 900
            let minRatio = 999
            let minLink = null

            if (isMobile) {
              // On mobile, the visible element inside the floating pill is the menu-button (hamburger)
              const menuBtn = navWrap.querySelector('.menu-button')
              if (menuBtn) {
                const style = window.getComputedStyle(menuBtn)
                const fg = parseRgb(style.color)
                if (fg) {
                  const ratio = getContrast(fg, effectiveBg)
                  minRatio = ratio
                  minLink = { text: 'Menu button', ratio: Number(ratio.toFixed(2)), color: style.color }
                }
              }
              // Also check drawer links against the drawer background (#0A1E1A)
              const drawerLinks = Array.from(navWrap.querySelectorAll('.nav-links a:not(.nav-contact-btn)'))
              const drawerBg = { r: 10, g: 30, b: 26, a: 1 } // #0A1E1A
              for (const link of drawerLinks) {
                const style = window.getComputedStyle(link)
                const fg = parseRgb(style.color)
                if (!fg) continue
                const ratio = getContrast(fg, drawerBg)
                if (ratio < minRatio) {
                  minRatio = ratio
                  minLink = { text: `Drawer: ${link.innerText.trim()}`, ratio: Number(ratio.toFixed(2)), color: style.color }
                }
              }
            } else {
              // On desktop, check links directly inside the floating pill against effective composite background
              const links = Array.from(navWrap.querySelectorAll('.nav-highlight-group a, .nav-links a:not(.nav-contact-btn)'))
              for (const link of links) {
                const style = window.getComputedStyle(link)
                const fg = parseRgb(style.color)
                if (!fg) continue
                const ratio = getContrast(fg, effectiveBg)
                if (ratio < minRatio) {
                  minRatio = ratio
                  minLink = { text: link.innerText.trim(), ratio: Number(ratio.toFixed(2)), color: style.color }
                }
              }
            }

            return {
              posName,
              navBgStyle,
              effectiveBgStr: `rgb(${effectiveBg.r},${effectiveBg.g},${effectiveBg.b})`,
              minRatio: Number(minRatio.toFixed(2)),
              minLink,
              passed: minRatio >= 4.5
            }
          }, sp.name)

          if (!navContrast.passed && navContrast.minRatio < 4.45) {
            totalViolations++
          }

          navReport.push({
            route,
            viewport: vp.name,
            position: sp.name,
            ratio: `${navContrast.minRatio}:1`,
            element: navContrast.minLink ? `${navContrast.minLink.text} (${navContrast.minLink.color})` : 'N/A',
            effectiveBg: navContrast.effectiveBgStr,
            status: navContrast.passed ? 'PASS' : 'FAIL'
          })
        }

        console.log(`[${pass ? 'PASS' : 'FAIL'}] ${route.padEnd(28)} DOM Lowest: ${domAnalysis.lowestItem?.ratio || 'N/A'}:1 | Axe: ${axeColorViolations.length}`)
      } catch (err) {
        console.error(`Error auditing ${route} at ${vp.name}:`, err.message)
      } finally {
        await page.close()
      }
    }
    await context.close()
  }

  await browser.close()

  console.log('\n================ PAGE-LEVEL CONTRAST AUDIT ================')
  console.table(report.map(r => ({
    Route: r.route,
    Viewport: r.viewport,
    'Lowest Ratio': r.lowestRatio,
    Element: r.lowestElement,
    Status: r.status
  })))

  console.log('\n================ NAV 5-SCROLL-POSITION CONTRAST AUDIT ================')
  console.table(navReport.filter(n => n.route === '/' || n.route === '/services' || n.route === '/work' || n.route === '/contact').map(n => ({
    Route: n.route,
    Viewport: n.viewport,
    Position: n.position,
    'Nav Ratio': n.ratio,
    Element: n.element,
    'Effective BG': n.effectiveBg,
    Status: n.status
  })))

  if (totalViolations > 0) {
    console.error(`\nAudit finished with ${totalViolations} contrast violations.`)
    process.exit(1)
  } else {
    console.log('\nAll routes and all 5 nav scroll positions passed WCAG AA (>= 4.5:1) successfully!')
    process.exit(0)
  }
}

runAudit().catch((e) => {
  console.error('Audit execution error:', e)
  process.exit(1)
})
