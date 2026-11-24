import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'http://127.0.0.1:5173'
const ARTIFACT_DIR = 'C:/Users/dell/.gemini/antigravity/brain/320ccff4-020e-435d-bd4d-d5a4f1c8f974'

async function recordCarousel() {
  const browser = await chromium.launch({ headless: true })
  const carouselCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: path.join(ARTIFACT_DIR, 'videos_temp') }
  })
  const page = await carouselCtx.newPage()
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  // Scroll to carousel
  await page.evaluate(() => {
    const el = document.getElementById('work')
    if (el) {
      if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
      else el.scrollIntoView()
    }
  })
  await page.waitForTimeout(1000)

  // Advance through 4 slides by clicking dots
  const dots = await page.$$('.reel-dash')
  for (let i = 0; i < Math.min(dots.length, 4); i++) {
    console.log(`Clicking dot ${i + 1}...`)
    await dots[i].click({ force: true })
    await page.waitForTimeout(1500)
  }

  const video = await page.video()
  const tempPath = await video.path()
  await carouselCtx.close()

  const finalPath = path.join(ARTIFACT_DIR, 'carousel_advance_1440.webm')
  if (fs.existsSync(tempPath)) {
    fs.copyFileSync(tempPath, finalPath)
    console.log(`Saved: ${finalPath}`)
  }

  await browser.close()
  console.log('Carousel advance video complete!')
}

recordCarousel().catch(console.error)
