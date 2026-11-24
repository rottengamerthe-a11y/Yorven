import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const ARTIFACT_DIR = 'C:/Users/dell/.gemini/antigravity/brain/320ccff4-020e-435d-bd4d-d5a4f1c8f974'

async function check() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // Take screenshot of hero
  const heroEl = await page.$('.cinematic-hero-section')
  if (heroEl) {
    await heroEl.screenshot({ path: path.join(ARTIFACT_DIR, 'debug_hero_initial.png') })
  }

  // Fast forward or skip intro if intro button exists
  const skipBtn = await page.$('.cinematic-skip-btn')
  if (skipBtn) {
    await skipBtn.click()
    await page.waitForTimeout(1000)
  }

  // Inspect canvas and title box
  const info = await page.evaluate(() => {
    const canvas = document.querySelector('.cinematic-unified-canvas')
    const titleBox = document.querySelector('.cinematic-title-box')
    const stage = document.querySelector('.cinematic-stage')
    const hero = document.querySelector('.cinematic-hero-section')
    const nav = document.querySelector('.nav')

    const getElInfo = (el) => {
      if (!el) return null
      const cs = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        tag: el.tagName,
        class: el.className,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right },
        overflow: cs.overflow,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        clipPath: cs.clipPath,
        mask: cs.mask,
        webkitMaskImage: cs.webkitMaskImage,
        contain: cs.contain
      }
    }

    // Check ancestors of canvas
    const ancestors = []
    let curr = canvas ? canvas.parentElement : null
    while (curr && curr !== document.body) {
      ancestors.push(getElInfo(curr))
      curr = curr.parentElement
    }

    // Check all fixed or absolute elements that might overlap
    const allEls = Array.from(document.querySelectorAll('*'))
    const overlapping = []
    if (canvas) {
      const cr = canvas.getBoundingClientRect()
      allEls.forEach((el) => {
        if (el === canvas || el.contains(canvas) || canvas.contains(el)) return
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          const overlaps = !(r.right < cr.left || r.left > cr.right || r.bottom < cr.top || r.top > cr.bottom)
          if (overlaps) {
            const cs = window.getComputedStyle(el)
            overlapping.push({
              tag: el.tagName,
              class: el.className,
              id: el.id,
              rect: { top: r.top, left: r.left, width: r.width, height: r.height },
              zIndex: cs.zIndex,
              background: cs.background,
              backdropFilter: cs.backdropFilter,
              filter: cs.filter
            })
          }
        }
      })
    }

    return {
      canvas: getElInfo(canvas),
      titleBox: getElInfo(titleBox),
      stage: getElInfo(stage),
      hero: getElInfo(hero),
      ancestors,
      overlapping
    }
  })

  console.log('DOM Info:', JSON.stringify(info, null, 2))

  // Screenshot title box area
  const titleBoxEl = await page.$('.cinematic-title-box')
  if (titleBoxEl) {
    await titleBoxEl.screenshot({ path: path.join(ARTIFACT_DIR, 'debug_title_box.png') })
  }

  await browser.close()
}

check().catch(console.error)
