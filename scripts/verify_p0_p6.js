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

function contrastRatio(rgb1, rgb2) {
  const l1 = relLuminance(rgb1[0], rgb1[1], rgb1[2])
  const l2 = relLuminance(rgb2[0], rgb2[1], rgb2[2])
  const top = Math.max(l1, l2)
  const bottom = Math.min(l1, l2)
  return (top + 0.05) / (bottom + 0.05)
}

async function samplePixelsFromBuffer(page, buffer, points) {
  const base64 = buffer.toString('base64')
  return await page.evaluate(async ({ base64, points }) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const samples = points.map(pt => {
          const pixel = ctx.getImageData(Math.round(pt.x), Math.round(pt.y), 1, 1).data
          return { label: pt.label, x: pt.x, y: pt.y, r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] }
        })
        resolve(samples)
      }
      img.src = `data:image/png;base64,${base64}`
    })
  }, { base64, points })
}

export async function runVerification() {
  console.log('Starting P0–P6 Comprehensive Verification Suite...')
  const report = {
    themeLeakTests: [],
    pixelContrastTests: [],
    scrollSweepTests: [],
    lighthouse: null
  }

  const browsers = [
    { type: chromium, name: 'Chromium' },
    { type: firefox, name: 'Firefox' }
  ]

  for (const { type, name: browserName } of browsers) {
    console.log(`\n================ Testing ${browserName} ================`)
    const browser = await type.launch({ headless: true })

    // Viewports: 1440px desktop, 375px mobile
    for (const vp of [{ width: 1440, height: 900, label: '1440' }, { width: 375, height: 812, label: '375' }]) {
      console.log(`Testing ${browserName} at ${vp.label}px...`)
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(1000)

      // Test 1: P0 Theme Leak Test
      console.log(`--- Running P0 Theme Leak Test (${browserName} ${vp.label}px) ---`)
      const scrollPositions = [0, 200, 600, 1200]
      for (const sY of scrollPositions) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), sY)
        await page.waitForTimeout(200)

        const state = await page.evaluate(() => {
          const htmlTheme = document.documentElement.getAttribute('data-theme')
          const bodyTheme = document.body.getAttribute('data-theme')
          const counter = document.querySelector('.reel-counter, .cinematic-hero-badge, [class*="counter"]')
          const counterColor = counter ? window.getComputedStyle(counter).color : null
          const title = document.querySelector('.cinematic-hero-title, .reel-flux-header h2, #work h2')
          const titleColor = title ? window.getComputedStyle(title).color : null
          const nextBtn = document.querySelector('.reel-ghost-btn')
          const nextBtnBg = nextBtn ? window.getComputedStyle(nextBtn).backgroundColor : null
          return { htmlTheme, bodyTheme, counterColor, titleColor, nextBtnBg }
        })

        const themeLeak = state.htmlTheme !== null || state.bodyTheme !== null
        console.log(`  Scroll ${sY}px: html[data-theme]=${state.htmlTheme}, body[data-theme]=${state.bodyTheme}, counter=${state.counterColor}, btnBg=${state.nextBtnBg}`)

        report.themeLeakTests.push({
          browser: browserName,
          viewport: vp.label,
          scrollY: sY,
          htmlTheme: state.htmlTheme,
          bodyTheme: state.bodyTheme,
          counterColor: state.counterColor,
          btnBg: state.nextBtnBg,
          passed: !themeLeak && !state.counterColor?.includes('179, 65, 44') // not #B3412C
        })
      }

      // Scroll deep down to cream section (#problem) and back up to 0 to verify theme restores cleanly
      await page.evaluate(() => {
        const el = document.getElementById('problem')
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
      })
      await page.waitForTimeout(300)
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.waitForTimeout(300)

      const afterScrollState = await page.evaluate(() => ({
        htmlTheme: document.documentElement.getAttribute('data-theme'),
        bodyTheme: document.body.getAttribute('data-theme'),
        counterColor: window.getComputedStyle(document.querySelector('.reel-counter, .cinematic-hero-badge, [class*="counter"]') || document.body).color
      }))
      console.log(`  After scroll down & up: htmlTheme=${afterScrollState.htmlTheme}, counterColor=${afterScrollState.counterColor}`)
      report.themeLeakTests.push({
        browser: browserName,
        viewport: vp.label,
        action: 'scroll_down_and_up',
        passed: afterScrollState.htmlTheme === null && !afterScrollState.counterColor?.includes('179, 65, 44')
      })

      // Test 2: P1 & P2 Nav Pixel Sampling & Contrast
      console.log(`--- Running P1 & P2 Nav Contrast Sampling (${browserName} ${vp.label}px) ---`)
      // Dark Nav over Hero
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.waitForTimeout(300)
      const navEl = await page.$('.nav-wrap .nav')
      if (navEl) {
        const navBox = await navEl.boundingBox()
        const navShotBuffer = await navEl.screenshot()
        const navDarkShotPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_nav_dark_${vp.label}.png`)
        fs.writeFileSync(navDarkShotPath, navShotBuffer)

        // Sample logo and links
        const linkEl = await page.$('.nav-links a:not(.nav-contact-btn)') || await page.$('.logo')
        if (linkEl) {
          const lBox = await linkEl.boundingBox()
          const samples = await samplePixelsFromBuffer(page, navShotBuffer, [
            { label: 'bg', x: 20, y: navBox.height / 2 },
            { label: 'text', x: (lBox.x - navBox.x) + 10, y: (lBox.y - navBox.y) + (lBox.height / 2) }
          ])
          const bgPix = samples.find(s => s.label === 'bg')
          const textPix = samples.find(s => s.label === 'text')
          const ratio = contrastRatio([textPix.r, textPix.g, textPix.b], [bgPix.r, bgPix.g, bgPix.b])
          console.log(`  Dark Nav link pixel contrast: ${ratio.toFixed(2)}:1 (Text: rgb(${textPix.r},${textPix.g},${textPix.b}) on Bg: rgb(${bgPix.r},${bgPix.g},${bgPix.b}))`)
          report.pixelContrastTests.push({
            browser: browserName,
            viewport: vp.label,
            element: 'Dark Nav Link',
            contrast: ratio.toFixed(2),
            passed: ratio >= 4.5
          })
        }
      }

      // Light Nav over Cream section
      await page.evaluate(() => {
        const el = document.getElementById('problem')
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'start' })
          window.scrollBy(0, 80)
        }
      })
      await page.waitForTimeout(350)
      if (navEl) {
        const navBox = await navEl.boundingBox()
        const navLightShot = await navEl.screenshot()
        const navLightShotPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_nav_light_${vp.label}.png`)
        fs.writeFileSync(navLightShotPath, navLightShot)

        const linkEl = await page.$('.nav-links a:not(.nav-contact-btn)') || await page.$('.logo')
        if (linkEl) {
          const lBox = await linkEl.boundingBox()
          const samples = await samplePixelsFromBuffer(page, navLightShot, [
            { label: 'bg', x: 20, y: navBox.height / 2 },
            { label: 'text', x: (lBox.x - navBox.x) + 10, y: (lBox.y - navBox.y) + (lBox.height / 2) }
          ])
          const bgPix = samples.find(s => s.label === 'bg')
          const textPix = samples.find(s => s.label === 'text')
          const ratio = contrastRatio([textPix.r, textPix.g, textPix.b], [bgPix.r, bgPix.g, bgPix.b])
          console.log(`  Light Nav link pixel contrast: ${ratio.toFixed(2)}:1 (Text: rgb(${textPix.r},${textPix.g},${textPix.b}) on Bg: rgb(${bgPix.r},${bgPix.g},${bgPix.b}))`)
          report.pixelContrastTests.push({
            browser: browserName,
            viewport: vp.label,
            element: 'Light Nav Link',
            contrast: ratio.toFixed(2),
            passed: ratio >= 4.5
          })
        }
      }

      // Test 3: P3 Carousel Controls & Progress Dots
      console.log(`--- Running P3 Carousel Controls & Progress Dots (${browserName} ${vp.label}px) ---`)
      await page.evaluate(() => {
        const el = document.getElementById('work')
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
      })
      await page.waitForTimeout(400)

      const dotsContainer = await page.$('.reel-dashes')
      if (dotsContainer) {
        const dotsBuffer = await dotsContainer.screenshot()
        fs.writeFileSync(path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_carousel_dots_${vp.label}.png`), dotsBuffer)
        const dotsBox = await dotsContainer.boundingBox()
        const inactiveDot = await page.$('.reel-dash:not(.active)')
        if (inactiveDot) {
          const inBox = await inactiveDot.boundingBox()
          const samples = await samplePixelsFromBuffer(page, dotsBuffer, [
            { label: 'bg', x: 2, y: 2 },
            { label: 'dot', x: (inBox.x - dotsBox.x) + 4, y: (inBox.y - dotsBox.y) + 2 }
          ])
          const bg = samples.find(s => s.label === 'bg')
          const dot = samples.find(s => s.label === 'dot')
          const ratio = contrastRatio([dot.r, dot.g, dot.b], [bg.r, bg.g, bg.b])
          console.log(`  Inactive dot pixel contrast: ${ratio.toFixed(2)}:1 (rgb(${dot.r},${dot.g},${dot.b}) vs rgb(${bg.r},${bg.g},${bg.b}))`)
          report.pixelContrastTests.push({
            browser: browserName,
            viewport: vp.label,
            element: 'Carousel Inactive Dot',
            contrast: ratio.toFixed(2),
            passed: ratio >= 3.0
          })
        }
      }

      const ghostBtn = await page.$('.reel-ghost-btn')
      if (ghostBtn) {
        const btnBuffer = await ghostBtn.screenshot()
        fs.writeFileSync(path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_carousel_btn_${vp.label}.png`), btnBuffer)
        const btnBox = await ghostBtn.boundingBox()
        const samples = await samplePixelsFromBuffer(page, btnBuffer, [
          { label: 'btnBg', x: 5, y: btnBox.height / 2 },
          { label: 'icon', x: btnBox.width / 2, y: btnBox.height / 2 }
        ])
        const bg = samples.find(s => s.label === 'btnBg')
        const icon = samples.find(s => s.label === 'icon')
        const ratio = contrastRatio([icon.r, icon.g, icon.b], [bg.r, bg.g, bg.b])
        console.log(`  Carousel button chevron contrast: ${ratio.toFixed(2)}:1 (rgb(${icon.r},${icon.g},${icon.b}) vs rgb(${bg.r},${bg.g},${bg.b}))`)
        report.pixelContrastTests.push({
          browser: browserName,
          viewport: vp.label,
          element: 'Carousel Chevron Button',
          contrast: ratio.toFixed(2),
          passed: ratio >= 3.0
        })
      }

      // Test 4: Scroll Sweep Test in 40px steps
      console.log(`--- Running Scroll Sweep in 40px steps (${browserName} ${vp.label}px) ---`)
      const sweepViolations = []
      let lastTheme = null
      let lastSwitchTime = 0
      let rapidReverts = 0

      const maxScroll = await page.evaluate(() => Math.min(document.documentElement.scrollHeight - window.innerHeight, 3500))
      for (let y = 0; y <= maxScroll; y += 40) {
        await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
        await page.waitForTimeout(50)

        const check = await page.evaluate(() => {
          const navWrap = document.querySelector('.nav-wrap')
          const isLight = navWrap ? navWrap.classList.contains('nav-theme-light') : false
          const link = document.querySelector('.nav-links a:not(.nav-contact-btn)') || document.querySelector('.logo')
          const color = link ? window.getComputedStyle(link).color : ''
          return { isLight, color }
        })

        const theme = check.isLight ? 'light' : 'dark'
        const now = Date.now()
        if (lastTheme && theme !== lastTheme) {
          const diff = now - lastSwitchTime
          if (diff < 200) rapidReverts++
          lastSwitchTime = now
        }
        lastTheme = theme

        // Verify contrast
        // Expected text color: light -> #14201C, dark -> #F4F7F6
        if (theme === 'dark' && check.color.includes('20, 32, 28')) {
          sweepViolations.push({ scrollY: y, theme, color: check.color })
        }
        if (theme === 'light' && check.color.includes('244, 247, 246')) {
          sweepViolations.push({ scrollY: y, theme, color: check.color })
        }
      }

      console.log(`  Scroll sweep finished: ${sweepViolations.length} violations, ${rapidReverts} rapid reverts (<200ms)`)
      report.scrollSweepTests.push({
        browser: browserName,
        viewport: vp.label,
        violationsCount: sweepViolations.length,
        rapidReverts,
        passed: sweepViolations.length === 0 && rapidReverts === 0
      })

      // Capture all 4 slides at 1440px & 375px
      console.log(`--- Capturing Carousel 4 Slides (${browserName} ${vp.label}px) ---`)
      await page.evaluate(() => {
        const el = document.getElementById('work')
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
      })
      await page.waitForTimeout(400)

      const dots = await page.$$('.reel-dash')
      for (let i = 0; i < Math.min(dots.length, 4); i++) {
        await dots[i].click()
        await page.waitForTimeout(500)
        const slidePath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_carousel_slide_${i + 1}_${vp.label}.png`)
        await page.screenshot({ path: slidePath })
        console.log(`  Saved slide ${i + 1}: ${slidePath}`)
      }

      await context.close()
    }

    await browser.close()
  }

  // Save report JSON
  const reportPath = path.join(ARTIFACT_DIR, 'verification_report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nVerification report saved: ${reportPath}`)
  return report
}

runVerification().catch(err => {
  console.error('Verification failed with error:', err)
  process.exit(1)
})
