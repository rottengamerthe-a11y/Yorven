import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const ARTIFACT_DIR = 'C:/Users/dell/.gemini/antigravity/brain/320ccff4-020e-435d-bd4d-d5a4f1c8f974'
const BASE_URL = 'http://127.0.0.1:5173'

async function runVerification() {
  const browser = await chromium.launch({ headless: true })
  const viewports = [1440, 1920, 375]
  const report = []

  for (const width of viewports) {
    console.log(`\n========================================`)
    console.log(`Starting Verification for Viewport: ${width}px`)
    console.log(`========================================`)
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    // Scroll carousel into view
    await page.evaluate(() => {
      const el = document.querySelector('.reel-flux-section') || document.getElementById('work')
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await page.waitForTimeout(500)

    const sectionEl = await page.$('.reel-flux-section')

    // 1. Settled State Screenshots for all 4 slides
    const dots = await page.$$('.reel-dash')
    for (let s = 0; s < 4; s++) {
      if (dots[s]) {
        await dots[s].click({ force: true })
        // Wait for spring settle (damping 5.0 settles in ~800ms)
        await page.waitForTimeout(1200)

        const shotName = `settled_w${width}_slide${s + 1}.png`
        const shotPath = path.join(ARTIFACT_DIR, shotName)
        await sectionEl.screenshot({ path: shotPath })
        console.log(`[PASS] Saved settled screenshot: ${shotName}`)
        report.push({ type: 'settled', width, slide: s + 1, file: shotName, path: shotPath })
      }
    }

    // 2. Mid-Transition Screenshots (5 frames per transition between slides)
    // Transitions: 1->2, 2->3, 3->4, 4->1
    for (let t = 0; t < 4; t++) {
      const fromIdx = t
      const toIdx = (t + 1) % 4

      // First click fromIdx and let it settle
      if (dots[fromIdx]) {
        await dots[fromIdx].click({ force: true })
        await page.waitForTimeout(1200)
      }

      // Now click next button or toIdx dot and capture 5 rapid consecutive frames across the spring motion
      if (dots[toIdx]) {
        await dots[toIdx].click({ force: true })
        for (let frame = 1; frame <= 5; frame++) {
          await page.waitForTimeout(80) // 80ms increments capture 5 distinct stages of wave & slide motion
          const shotName = `transition_w${width}_from${fromIdx + 1}_to${toIdx + 1}_frame${frame}.png`
          const shotPath = path.join(ARTIFACT_DIR, shotName)
          await sectionEl.screenshot({ path: shotPath })
          console.log(`[PASS] Saved transition screenshot: ${shotName}`)
          report.push({ type: 'transition', width, from: fromIdx + 1, to: toIdx + 1, frame, file: shotName, path: shotPath })
        }
      }
      // Wait for complete settle before next transition
      await page.waitForTimeout(800)
    }

    await page.close()
  }

  await browser.close()

  // Save report json
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'hero_edges_verification_manifest.json'), JSON.stringify(report, null, 2))
  console.log(`\nVerification capture completed successfully. Total images: ${report.length}`)
}

runVerification().catch(console.error)
