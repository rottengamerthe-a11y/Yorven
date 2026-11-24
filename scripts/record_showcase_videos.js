import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'http://127.0.0.1:5173'
const ARTIFACT_DIR = 'C:/Users/dell/.gemini/antigravity/brain/320ccff4-020e-435d-bd4d-d5a4f1c8f974'

async function record() {
  const browser = await chromium.launch({ headless: true })

  // 1. Slow scroll of home page
  console.log('Recording slow scroll home...')
  const scrollCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: path.join(ARTIFACT_DIR, 'videos_temp') }
  })
  const scrollPage = await scrollCtx.newPage()
  await scrollPage.goto(BASE_URL, { waitUntil: 'networkidle' })
  await scrollPage.waitForTimeout(1000)

  // Smooth scroll through sections
  const sections = ['#hero', '#work', '#problem', '#services', '#how', '#results', '#faq', '.footer']
  for (const s of sections) {
    await scrollPage.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (el) {
        if (window.__lenis) window.__lenis.scrollTo(el, { duration: 1.5 })
        else el.scrollIntoView({ behavior: 'smooth' })
      }
    }, s)
    await scrollPage.waitForTimeout(2200)
  }

  // Scroll back to top
  await scrollPage.evaluate(() => {
    if (window.__lenis) window.__lenis.scrollTo(0, { duration: 1.5 })
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  })
  await scrollPage.waitForTimeout(2000)

  const scrollVideo = await scrollPage.video()
  const tempScrollPath = await scrollVideo.path()
  await scrollCtx.close()
  const finalScrollPath = path.join(ARTIFACT_DIR, 'slow_scroll_home_1440.webm')
  if (fs.existsSync(tempScrollPath)) {
    fs.copyFileSync(tempScrollPath, finalScrollPath)
    console.log(`Saved: ${finalScrollPath}`)
  }

  // 2. Carousel auto-advancing / clicking across 4 slides
  console.log('Recording carousel advance...')
  const carouselCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: path.join(ARTIFACT_DIR, 'videos_temp') }
  })
  const carouselPage = await carouselCtx.newPage()
  await carouselPage.goto(BASE_URL, { waitUntil: 'networkidle' })
  await carouselPage.waitForTimeout(800)

  // Scroll to carousel
  await carouselPage.evaluate(() => {
    const el = document.getElementById('work')
    if (el) {
      if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
      else el.scrollIntoView()
    }
  })
  await carouselPage.waitForTimeout(1000)

  // Advance through 4 slides
  const nextBtn = await carouselPage.$('.reel-ghost-btn:last-of-type') || await carouselPage.$('.reel-ghost-btn')
  for (let i = 0; i < 4; i++) {
    console.log(`Advancing to slide ${i + 1}...`)
    if (nextBtn) {
      await nextBtn.hover()
      await carouselPage.waitForTimeout(400)
      await nextBtn.click()
      await carouselPage.waitForTimeout(1600)
    }
  }

  const carouselVideo = await carouselPage.video()
  const tempCarouselPath = await carouselVideo.path()
  await carouselCtx.close()
  const finalCarouselPath = path.join(ARTIFACT_DIR, 'carousel_advance_1440.webm')
  if (fs.existsSync(tempCarouselPath)) {
    fs.copyFileSync(tempCarouselPath, finalCarouselPath)
    console.log(`Saved: ${finalCarouselPath}`)
  }

  await browser.close()
  console.log('Both showcase recordings complete!')
}

record().catch(console.error)
