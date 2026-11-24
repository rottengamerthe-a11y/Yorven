import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const ARTIFACT_DIR = 'C:/Users/dell/.gemini/antigravity/brain/320ccff4-020e-435d-bd4d-d5a4f1c8f974'
const BASE_URL = 'http://127.0.0.1:5173'

async function diagnose() {
  const browser = await chromium.launch({ headless: true })
  
  const viewports = [1440, 1920, 375]
  
  for (const w of viewports) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } })
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)

    // Scroll to #work or .reel-flux-section
    await page.evaluate(() => {
      const el = document.querySelector('.reel-flux-section') || document.getElementById('work')
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await page.waitForTimeout(1000)

    // Step 1 & 2: Log bounding boxes and styles
    const info = await page.evaluate(() => {
      const section = document.querySelector('.reel-flux-section')
      const canvasContainer = document.querySelector('.reel-canvas-container')
      const canvas = canvasContainer ? canvasContainer.querySelector('canvas') : null
      const glassElements = Array.from(document.querySelectorAll('.liquid-glass-backdrop, [class*="glass"]'))
      
      const getStyles = (el) => {
        if (!el) return null
        const cs = window.getComputedStyle(el)
        return {
          overflow: cs.overflow,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          clipPath: cs.clipPath,
          mask: cs.mask,
          contain: cs.contain,
          transform: cs.transform,
          width: cs.width,
          height: cs.height,
          rect: el.getBoundingClientRect()
        }
      }

      // Check all ancestors of canvas
      let ancestors = []
      let curr = canvasContainer
      while (curr && curr !== document.body) {
        const cs = window.getComputedStyle(curr)
        if (cs.overflow !== 'visible' || cs.clipPath !== 'none' || cs.mask !== 'none' || cs.contain !== 'none') {
          ancestors.push({
            tag: curr.tagName,
            class: curr.className,
            id: curr.id,
            overflow: cs.overflow,
            clipPath: cs.clipPath,
            mask: cs.mask,
            contain: cs.contain,
            rect: curr.getBoundingClientRect()
          })
        }
        curr = curr.parentElement
      }

      const glassOverlap = glassElements.map(g => {
        const r1 = g.getBoundingClientRect()
        const r2 = canvas ? canvas.getBoundingClientRect() : null
        const overlaps = r2 && !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom)
        return {
          className: g.className,
          rect: r1,
          filter: window.getComputedStyle(g).filter,
          backdropFilter: window.getComputedStyle(g).backdropFilter,
          overlapsCanvas: overlaps
        }
      }).filter(g => g.overlapsCanvas)

      return {
        section: getStyles(section),
        canvasContainer: getStyles(canvasContainer),
        canvas: getStyles(canvas),
        ancestorsWithClipping: ancestors,
        glassOverlap
      }
    })

    console.log(`=== Viewport ${w}px ===`)
    console.log(JSON.stringify(info, null, 2))

    // Capture screenshot of section
    const sectionEl = await page.$('.reel-flux-section')
    if (sectionEl) {
      await sectionEl.screenshot({ path: path.join(ARTIFACT_DIR, `diagnose_section_${w}.png`) })
    }

    // Capture each slide by clicking dots
    const dots = await page.$$('.reel-dash')
    for (let i = 0; i < dots.length; i++) {
      await dots[i].click({ force: true })
      await page.waitForTimeout(600)
      if (sectionEl) {
        await sectionEl.screenshot({ path: path.join(ARTIFACT_DIR, `diagnose_slide_${i + 1}_${w}.png`) })
      }
    }

    await page.close()
  }

  await browser.close()
  console.log('Diagnosis capture complete.')
}

diagnose().catch(console.error)
