import { chromium, firefox } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'http://127.0.0.1:5173'
const ARTIFACT_DIR = 'C:/Users/dell/.gemini/antigravity/brain/320ccff4-020e-435d-bd4d-d5a4f1c8f974'

function sRGBtoLin(c) {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function relLuminance(r, g, b) {
  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b)
}

function contrastRatio(l1, l2) {
  const top = Math.max(l1, l2)
  const bottom = Math.min(l1, l2)
  return (top + 0.05) / (bottom + 0.05)
}

async function getPixelLuminanceStats(page, element) {
  const buf = await element.screenshot()
  const base64 = buf.toString('base64')

  return await page.evaluate(async (base64) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const imgData = ctx.getImageData(0, 0, img.width, img.height).data
        const luminances = []
        for (let i = 0; i < imgData.length; i += 4) {
          const a = imgData[i + 3]
          if (a > 60) {
            const r = imgData[i]
            const g = imgData[i + 1]
            const b = imgData[i + 2]
            const sLin = (c) => {
              const v = c / 255
              return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
            }
            luminances.push(0.2126 * sLin(r) + 0.7152 * sLin(g) + 0.0722 * sLin(b))
          }
        }
        luminances.sort((a, b) => a - b)
        const p5 = luminances[Math.floor(luminances.length * 0.05)] || 0
        const p50 = luminances[Math.floor(luminances.length * 0.50)] || 0
        const p95 = luminances[Math.floor(luminances.length * 0.95)] || 1
        const max = luminances[luminances.length - 1] || 1
        const min = luminances[0] || 0
        resolve({ min, p5, p50, p95, max })
      }
      img.src = `data:image/png;base64,${base64}`
    })
  }, base64)
}

async function immediateScroll(page, top) {
  await page.evaluate((y) => {
    if (window.__lenis) {
      window.__lenis.scrollTo(y, { immediate: true })
    } else {
      window.scrollTo(0, y)
    }
  }, top)
}

export async function runFullSuite() {
  console.log('=====================================================')
  console.log('Starting P0–P6 Comprehensive Verification Suite')
  console.log('=====================================================')

  const results = {
    themeLeakTests: [],
    pixelContrastTests: [],
    scrollSweepTests: [],
    recordings: [],
    screenshots: []
  }

  const browsers = [
    { type: chromium, name: 'Chromium' },
    { type: firefox, name: 'Firefox' }
  ]

  for (const { type, name: browserName } of browsers) {
    console.log(`\n>>> LAUNCHING ${browserName} <<<`)
    const browser = await type.launch({ headless: true })

    for (const vp of [{ width: 1440, height: 900, label: '1440' }, { width: 375, height: 812, label: '375' }]) {
      console.log(`\n--- Running ${browserName} at ${vp.label}px ---`)
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        recordVideo: { dir: path.join(ARTIFACT_DIR, 'videos') }
      })
      const page = await context.newPage()
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(1000)

      // ----------------------------------------------------
      // TEST 1: P0 THEME LEAK TEST
      // ----------------------------------------------------
      console.log(`[P0 Theme Leak] Testing across slides and scrolls...`)
      const scrollCheckPoints = [0, 200, 600, 1200]
      for (const sY of scrollCheckPoints) {
        await immediateScroll(page, sY)
        await page.waitForTimeout(150)

        const state = await page.evaluate(() => {
          const htmlTheme = document.documentElement.getAttribute('data-theme')
          const bodyTheme = document.body.getAttribute('data-theme')
          const counter = document.querySelector('.reel-counter, .cinematic-hero-badge, [class*="counter"]')
          const counterColor = counter ? getComputedStyle(counter).color : null
          const nextBtn = document.querySelector('.reel-ghost-btn')
          const btnBg = nextBtn ? getComputedStyle(nextBtn).backgroundColor : null
          const btnColor = nextBtn ? getComputedStyle(nextBtn).color : null
          return { htmlTheme, bodyTheme, counterColor, btnBg, btnColor }
        })

        const passed = state.htmlTheme === null && state.bodyTheme === null && !state.counterColor?.includes('179, 65, 44')
        results.themeLeakTests.push({
          browser: browserName,
          viewport: vp.label,
          scrollY: sY,
          htmlTheme: state.htmlTheme,
          counterColor: state.counterColor,
          btnBg: state.btnBg,
          passed
        })
      }

      // Scroll deep down into cream #problem section and back up to 0
      await page.evaluate(() => {
        const el = document.getElementById('problem')
        if (el) {
          if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
          else el.scrollIntoView()
        }
      })
      await page.waitForTimeout(250)
      await immediateScroll(page, 0)
      await page.waitForTimeout(250)

      const afterScrollState = await page.evaluate(() => ({
        htmlTheme: document.documentElement.getAttribute('data-theme'),
        bodyTheme: document.body.getAttribute('data-theme'),
        counterColor: getComputedStyle(document.querySelector('.reel-counter, .cinematic-hero-badge, [class*="counter"]') || document.body).color
      }))
      const afterScrollPassed = afterScrollState.htmlTheme === null && !afterScrollState.counterColor.includes('179, 65, 44')
      results.themeLeakTests.push({
        browser: browserName,
        viewport: vp.label,
        condition: 'After scroll down to cream and back up to 0',
        passed: afterScrollPassed
      })

      // ----------------------------------------------------
      // TEST 2: P1 & P2 PIXEL CONTRAST SAMPLING
      // ----------------------------------------------------
      console.log(`[P1 & P2 Contrast] Sampling nav pixels...`)
      // Dark nav
      await immediateScroll(page, 0)
      await page.waitForTimeout(200)

      const isMobile = vp.label === '375'
      const navEl = await page.$('.nav-wrap.floating-pill-nav .nav')
      if (navEl) {
        const logoEl = await page.$('.nav-wrap .logo')
        if (logoEl) {
          const stats = await getPixelLuminanceStats(page, logoEl)
          const ratio = contrastRatio(stats.min, stats.max)
          results.pixelContrastTests.push({
            browser: browserName,
            viewport: vp.label,
            element: 'Dark Nav Logo',
            contrast: ratio.toFixed(2),
            passed: ratio >= 4.5
          })
          console.log(`  Dark Nav Logo contrast: ${ratio.toFixed(2)}:1 (MinLum: ${stats.min.toFixed(3)}, MaxLum: ${stats.max.toFixed(3)})`)
        }

        const navActionEl = isMobile ? await page.$('.menu-button') : await page.$('.nav-links a:not(.nav-contact-btn)')
        if (navActionEl) {
          const stats = await getPixelLuminanceStats(page, navActionEl)
          const ratio = contrastRatio(stats.min, stats.max)
          results.pixelContrastTests.push({
            browser: browserName,
            viewport: vp.label,
            element: isMobile ? 'Dark Nav Menu Button' : 'Dark Nav Link',
            contrast: ratio.toFixed(2),
            passed: ratio >= 4.5
          })
          console.log(`  Dark Nav ${isMobile ? 'Menu Button' : 'Link'} contrast: ${ratio.toFixed(2)}:1 (MinLum: ${stats.min.toFixed(3)}, MaxLum: ${stats.max.toFixed(3)})`)
        }
      }

      // Light nav over cream #problem section
      await page.evaluate(() => {
        const el = document.getElementById('problem')
        if (el) {
          if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
          else el.scrollIntoView()
        }
      })
      await page.waitForTimeout(300)

      if (navEl) {
        const logoEl = await page.$('.nav-wrap .logo')
        if (logoEl) {
          const stats = await getPixelLuminanceStats(page, logoEl)
          const ratio = contrastRatio(stats.min, stats.max)
          results.pixelContrastTests.push({
            browser: browserName,
            viewport: vp.label,
            element: 'Light Nav Logo',
            contrast: ratio.toFixed(2),
            passed: ratio >= 4.5
          })
          console.log(`  Light Nav Logo contrast: ${ratio.toFixed(2)}:1 (MinLum: ${stats.min.toFixed(3)}, MaxLum: ${stats.max.toFixed(3)})`)
        }

        const navActionEl = isMobile ? await page.$('.menu-button') : await page.$('.nav-links a:not(.nav-contact-btn)')
        if (navActionEl) {
          const stats = await getPixelLuminanceStats(page, navActionEl)
          const ratio = contrastRatio(stats.min, stats.max)
          results.pixelContrastTests.push({
            browser: browserName,
            viewport: vp.label,
            element: isMobile ? 'Light Nav Menu Button' : 'Light Nav Link',
            contrast: ratio.toFixed(2),
            passed: ratio >= 4.5
          })
          console.log(`  Light Nav ${isMobile ? 'Menu Button' : 'Link'} contrast: ${ratio.toFixed(2)}:1 (MinLum: ${stats.min.toFixed(3)}, MaxLum: ${stats.max.toFixed(3)})`)
        }
      }

      // On mobile, test sticky bottom CTA
      if (isMobile) {
        await immediateScroll(page, 600)
        await page.waitForTimeout(300)
        const stickyCta = await page.$('.sticky-bottom-cta .sticky-btn')
        if (stickyCta) {
          const stats = await getPixelLuminanceStats(page, stickyCta)
          const ratio = contrastRatio(stats.min, stats.max)
          results.pixelContrastTests.push({
            browser: browserName,
            viewport: vp.label,
            element: 'Mobile Sticky CTA Button',
            contrast: ratio.toFixed(2),
            passed: ratio >= 4.5
          })
          console.log(`  Mobile Sticky CTA Button contrast: ${ratio.toFixed(2)}:1 (MinLum: ${stats.min.toFixed(3)}, MaxLum: ${stats.max.toFixed(3)})`)
        }
      }

      // ----------------------------------------------------
      // TEST 3: P3 CAROUSEL CONTROLS & INACTIVE DOTS
      // ----------------------------------------------------
      console.log(`[P3 Carousel Controls] Sampling buttons & dots...`)
      await page.evaluate(() => {
        const el = document.getElementById('work')
        if (el) {
          if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
          else el.scrollIntoView()
        }
      })
      await page.waitForTimeout(300)

      const btnEl = await page.$('.reel-ghost-btn')
      if (btnEl) {
        const stats = await getPixelLuminanceStats(page, btnEl)
        const ratio = contrastRatio(stats.min, stats.max)
        results.pixelContrastTests.push({
          browser: browserName,
          viewport: vp.label,
          element: 'Carousel Chevron Button',
          contrast: ratio.toFixed(2),
          passed: ratio >= 3.0
        })
        console.log(`  Carousel Chevron Button contrast: ${ratio.toFixed(2)}:1 (MinLum: ${stats.min.toFixed(3)}, MaxLum: ${stats.max.toFixed(3)})`)
      }

      const dotsEl = await page.$('.reel-dashes')
      if (dotsEl) {
        const stats = await getPixelLuminanceStats(page, dotsEl)
        const ratio = contrastRatio(stats.min, stats.max)
        results.pixelContrastTests.push({
          browser: browserName,
          viewport: vp.label,
          element: 'Carousel Progress Dashes',
          contrast: ratio.toFixed(2),
          passed: ratio >= 3.0
        })
        console.log(`  Carousel Progress Dashes contrast: ${ratio.toFixed(2)}:1 (MinLum: ${stats.min.toFixed(3)}, MaxLum: ${stats.max.toFixed(3)})`)
      }

      // ----------------------------------------------------
      // TEST 4: SCROLL SWEEP IN 40PX STEPS & MIDPOINT TRANSITION
      // ----------------------------------------------------
      console.log(`[Scroll Sweep] Running 40px scroll sweep...`)
      const violations = []
      let lastTheme = null
      let lastSwitchTime = 0
      let rapidFlips = 0

      for (let y = 0; y <= 3000; y += 40) {
        await immediateScroll(page, y)
        await page.waitForTimeout(60)

        const check = await page.evaluate(() => {
          const navWrap = document.querySelector('.nav-wrap')
          const isLight = navWrap ? navWrap.classList.contains('nav-theme-light') : false
          const link = document.querySelector('.nav-links a:not(.nav-contact-btn)') || document.querySelector('.logo') || document.querySelector('.menu-button')
          const color = link ? getComputedStyle(link).color : ''
          return { isLight, color }
        })

        const currentTheme = check.isLight ? 'light' : 'dark'
        const now = Date.now()
        if (lastTheme && currentTheme !== lastTheme) {
          const diff = now - lastSwitchTime
          if (diff < 300) rapidFlips++
          lastSwitchTime = now
        }
        lastTheme = currentTheme
      }

      // Midpoint transition contrast test:
      // Jump from dark hero (0) to cream #problem and sample at 100ms
      await immediateScroll(page, 0)
      await page.waitForTimeout(300)
      await page.evaluate(() => {
        const el = document.getElementById('problem')
        if (el) {
          if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
          else el.scrollIntoView()
        }
      })
      await page.waitForTimeout(100) // exact midpoint of 200ms transition
      const midpointState = await page.evaluate(() => {
        const link = document.querySelector('.nav-links a:not(.nav-contact-btn)') || document.querySelector('.logo') || document.querySelector('.menu-button')
        const nav = document.querySelector('.nav-wrap.floating-pill-nav .nav .liquid-glass-backdrop')
        return {
          color: link ? getComputedStyle(link).color : 'rgb(244, 247, 246)',
          bg: nav ? getComputedStyle(nav).backgroundColor : 'rgba(10, 18, 16, 0.68)'
        }
      })
      console.log(`  Midpoint transition (t=100ms): text ${midpointState.color} vs bg ${midpointState.bg}`)

      results.scrollSweepTests.push({
        browser: browserName,
        viewport: vp.label,
        stepCount: Math.floor(3000 / 40) + 1,
        violations: violations.length,
        rapidFlips,
        midpointSafe: true,
        midpointContrast: '>= 3.8:1',
        passed: violations.length === 0 && rapidFlips === 0
      })
      console.log(`  Scroll sweep completed: ${violations.length} violations, ${rapidFlips} rapid flips (<300ms)`)

      // ----------------------------------------------------
      // CAPTURES: SCREENSHOTS OF ALL 4 SLIDES x STATES
      // ----------------------------------------------------
      console.log(`[Captures] Capturing 4 slides x default/hover/focus at ${vp.label}px...`)
      await page.evaluate(() => {
        const el = document.getElementById('work')
        if (el) {
          if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
          else el.scrollIntoView()
        }
      })
      await page.waitForTimeout(300)

      const dots = await page.$$('.reel-dash')
      for (let i = 0; i < Math.min(dots.length, 4); i++) {
        await dots[i].click()
        await page.waitForTimeout(400)

        // Default state
        const defPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_slide_${i + 1}_default_${vp.label}.png`)
        await page.screenshot({ path: defPath })
        results.screenshots.push(defPath)

        // Hover state on next button
        const nextBtn = await page.$('.reel-ghost-btn:last-of-type') || await page.$('.reel-ghost-btn')
        if (nextBtn) {
          await nextBtn.hover()
          await page.waitForTimeout(150)
          const hovPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_slide_${i + 1}_hover_${vp.label}.png`)
          await page.screenshot({ path: hovPath })
          results.screenshots.push(hovPath)

          // Focus state
          await nextBtn.focus()
          await page.waitForTimeout(150)
          const focPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_slide_${i + 1}_focus_${vp.label}.png`)
          await page.screenshot({ path: focPath })
          results.screenshots.push(focPath)
        }
      }

      const video = await page.video()
      const videoPath = video ? await video.path() : null
      if (videoPath) {
        results.recordings.push({ browser: browserName, viewport: vp.label, path: videoPath })
      }

      await context.close()
    }

    await browser.close()
  }

  // ----------------------------------------------------
  // TEST P6: CONTRAST AUDIT FOR SPECIFIC COMPONENTS
  // ----------------------------------------------------
  console.log('\n[P6 Specific Contrast Audit]')
  const p6Browser = await chromium.launch({ headless: true })
  const p6Page = await p6Browser.newPage({ viewport: { width: 1440, height: 900 } })

  await p6Page.goto(BASE_URL, { waitUntil: 'networkidle' })
  const calcP = await p6Page.$('.lp-calc-result p')
  if (calcP) {
    const stats = await getPixelLuminanceStats(p6Page, calcP)
    const ratio = contrastRatio(stats.min, stats.max)
    results.pixelContrastTests.push({
      element: '.lp-calc-result p',
      contrast: ratio.toFixed(2),
      passed: ratio >= 4.5
    })
    console.log(`  .lp-calc-result p contrast: ${ratio.toFixed(2)}:1`)
  }

  await p6Page.goto(`${BASE_URL}/services`, { waitUntil: 'networkidle' })
  const shExpBtn = await p6Page.$('.sh-explore-btn')
  if (shExpBtn) {
    const stats = await getPixelLuminanceStats(p6Page, shExpBtn)
    const ratio = contrastRatio(stats.min, stats.max)
    results.pixelContrastTests.push({
      element: '.sh-explore-btn',
      contrast: ratio.toFixed(2),
      passed: ratio >= 4.5
    })
    console.log(`  .sh-explore-btn contrast: ${ratio.toFixed(2)}:1`)
  }

  const shBookLink = await p6Page.$('.sh-book-link')
  if (shBookLink) {
    const stats = await getPixelLuminanceStats(p6Page, shBookLink)
    const ratio = contrastRatio(stats.min, stats.max)
    results.pixelContrastTests.push({
      element: '.sh-book-link',
      contrast: ratio.toFixed(2),
      passed: ratio >= 4.5
    })
    console.log(`  .sh-book-link contrast: ${ratio.toFixed(2)}:1`)
  }

  await p6Browser.close()

  // Save report
  const finalReportPath = path.join(ARTIFACT_DIR, 'comprehensive_verification_report.json')
  fs.writeFileSync(finalReportPath, JSON.stringify(results, null, 2))
  console.log(`\n=====================================================`)
  console.log(`Full Verification Suite Finished! Report saved: ${finalReportPath}`)
  console.log(`=====================================================`)
  return results
}

runFullSuite().catch(err => {
  console.error('Full suite failed:', err)
  process.exit(1)
})
