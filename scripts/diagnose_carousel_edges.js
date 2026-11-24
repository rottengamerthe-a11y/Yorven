import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const ARTIFACT_DIR = 'C:/Users/dell/.gemini/antigravity/brain/320ccff4-020e-435d-bd4d-d5a4f1c8f974'
const BASE_URL = 'http://127.0.0.1:5173'

async function run() {
  const browser = await chromium.launch({ headless: true })
  
  for (const width of [1440, 1920, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)

    // Stop autoplay so slides stay settled or we can control exact progress
    await page.evaluate(() => {
      // Find canvas container
      const container = document.querySelector('.reel-canvas-container')
      if (container) {
        // Expose debug hook if needed
      }
      const el = document.querySelector('.reel-flux-section')
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await page.waitForTimeout(500)

    // Check each of the 4 slides
    const dots = await page.$$('.reel-dash')
    for (let slideIdx = 0; slideIdx < dots.length; slideIdx++) {
      await dots[slideIdx].click({ force: true })
      // Wait for spring settle (SETTLE_DAMPING is 5.0, settles in ~0.6-0.8s)
      await page.waitForTimeout(1000)

      const sectionEl = await page.$('.reel-flux-section')
      const shotPath = path.join(ARTIFACT_DIR, `edge_diag_w${width}_slide${slideIdx + 1}.png`)
      await sectionEl.screenshot({ path: shotPath })
      console.log(`Saved settled: ${shotPath}`)
    }

    await page.close()
  }

  await browser.close()
  console.log('Capture finished.')
}

run().catch(console.error)
