import { chromium } from 'playwright'
import path from 'path'

const ARTIFACT_DIR = 'C:\\Users\\dell\\.gemini\\antigravity\\brain\\320ccff4-020e-435d-bd4d-d5a4f1c8f974'
const URL = 'http://127.0.0.1:5173/glass-lab'

async function capture() {
  console.log('Capturing screenshots of /glass-lab...')
  const browser = await chromium.launch({ headless: true })

  // 1. Chrome / Chromium Engine (Real Refraction Enabled)
  {
    console.log('Capturing Chrome (Real Refraction) at 1440px...')
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.documentElement.setAttribute('data-glass', 'refract'))
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'glass_lab_chrome_refract_1440.png'), fullPage: true })

    // Also capture close-ups of dark card and light card
    const darkCanvas = await page.$('[data-theme="dark"] > div:nth-child(2)')
    if (darkCanvas) {
      await darkCanvas.screenshot({ path: path.join(ARTIFACT_DIR, 'glass_lab_chrome_dark_closeup.png') })
    }
    const lightCanvas = await page.$('.surface-light')
    if (lightCanvas) {
      await lightCanvas.screenshot({ path: path.join(ARTIFACT_DIR, 'glass_lab_chrome_light_closeup.png') })
    }

    console.log('Capturing Chrome (Real Refraction) at 375px...')
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'glass_lab_chrome_refract_375.png'), fullPage: true })

    await context.close()
  }

  // 2. Safari / WebKit & Firefox Engine (Frosted Fallback Mode)
  {
    console.log('Capturing Safari/WebKit & Firefox mode (Frosted Fallback) at 1440px...')
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    })
    const page = await context.newPage()
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.documentElement.setAttribute('data-glass', 'frost'))
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'glass_lab_safari_frost_1440.png'), fullPage: true })

    // Close-ups in frost mode
    const darkCanvas = await page.$('[data-theme="dark"] > div:nth-child(2)')
    if (darkCanvas) {
      await darkCanvas.screenshot({ path: path.join(ARTIFACT_DIR, 'glass_lab_safari_dark_closeup.png') })
    }
    const lightCanvas = await page.$('.surface-light')
    if (lightCanvas) {
      await lightCanvas.screenshot({ path: path.join(ARTIFACT_DIR, 'glass_lab_safari_light_closeup.png') })
    }

    console.log('Capturing Safari/WebKit & Firefox mode at 375px...')
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'glass_lab_safari_frost_375.png'), fullPage: true })

    await context.close()
  }

  // 3. Firefox Engine
  {
    console.log('Capturing Firefox mode at 1440px...')
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
    })
    const page = await context.newPage()
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.documentElement.setAttribute('data-glass', 'frost'))
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'glass_lab_firefox_frost_1440.png'), fullPage: true })
    await context.close()
  }

  // 4. Also capture before/after of the cream Problem section to verify fix
  {
    console.log('Capturing fixed cream problem section at 1440px and 375px...')
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5173/#problem', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const problemSec = await page.$('#problem')
    if (problemSec) {
      await problemSec.screenshot({ path: path.join(ARTIFACT_DIR, 'cream_section_fixed_1440.png') })
    }

    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(400)
    if (problemSec) {
      await problemSec.screenshot({ path: path.join(ARTIFACT_DIR, 'cream_section_fixed_375.png') })
    }
    await context.close()
  }

  await browser.close()
  console.log('Screenshots captured successfully!')
}

capture().catch((e) => {
  console.error('Capture error:', e)
  process.exit(1)
})
