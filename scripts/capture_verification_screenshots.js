import { chromium, firefox } from 'playwright'
import path from 'path'

const BASE_URL = 'http://127.0.0.1:5173'
const ARTIFACT_DIR = 'C:/Users/dell/.gemini/antigravity/brain/320ccff4-020e-435d-bd4d-d5a4f1c8f974'

async function captureBrowser(browserType, browserName) {
  console.log(`\n================ Launching ${browserName} ================`)
  const browser = await browserType.launch({ headless: true })

  // 1. Desktop Viewport (1440x900)
  {
    console.log(`Capturing ${browserName} at 1440px...`)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1000)

    // Sections list
    const sections = [
      { id: 'hero', name: 'hero' },
      { id: 'work', name: 'work' },
      { id: 'problem', name: 'problem_cream' },
      { id: 'services', name: 'services' },
      { id: 'how', name: 'how_cream' },
      { id: 'results', name: 'results' },
      { id: 'faq', name: 'faq' }
    ]

    for (const sec of sections) {
      await page.evaluate((targetId) => {
        const el = document.getElementById(targetId) || document.querySelector(`.${targetId}`)
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
      }, sec.id)
      await page.waitForTimeout(400)

      const filePath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_home_${sec.name}_1440.png`)
      await page.screenshot({ path: filePath })
      console.log(`Saved: ${filePath}`)
    }

    // Nav Closeups at 1440px:
    // A. Dark backdrop (Hero / top)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.waitForTimeout(400)
    const navEl = await page.$('.nav-wrap.floating-pill-nav .nav')
    if (navEl) {
      const darkNavPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_nav_dark_closeup_1440.png`)
      await navEl.screenshot({ path: darkNavPath })
      console.log(`Saved: ${darkNavPath}`)
    }

    // B. Cream backdrop (#problem)
    await page.evaluate(() => {
      const el = document.getElementById('problem')
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
      window.scrollBy(0, 100) // Ensure nav is fully over cream section
    })
    await page.waitForTimeout(400)
    if (navEl) {
      const creamNavPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_nav_cream_closeup_1440.png`)
      await navEl.screenshot({ path: creamNavPath })
      console.log(`Saved: ${creamNavPath}`)
    }

    // C. Image backdrop (scroll over carousel / project poster)
    await page.evaluate(() => {
      const el = document.getElementById('work')
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
      window.scrollBy(0, 220) // Position nav right over carousel posters
    })
    await page.waitForTimeout(400)
    if (navEl) {
      const imgNavPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_nav_image_closeup_1440.png`)
      await navEl.screenshot({ path: imgNavPath })
      console.log(`Saved: ${imgNavPath}`)
    }

    await context.close()
  }

  // 2. Mobile Viewport (375x812)
  {
    console.log(`Capturing ${browserName} at 375px...`)
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1000)

    // Hero at 375px
    const mobileHeroPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_home_hero_375.png`)
    await page.screenshot({ path: mobileHeroPath })
    console.log(`Saved: ${mobileHeroPath}`)

    // Cream section at 375px
    await page.evaluate(() => {
      const el = document.getElementById('problem')
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
    })
    await page.waitForTimeout(400)
    const mobileCreamPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_home_problem_cream_375.png`)
    await page.screenshot({ path: mobileCreamPath })
    console.log(`Saved: ${mobileCreamPath}`)

    // Nav closeup over cream at 375px
    const navElMobile = await page.$('.nav-wrap.floating-pill-nav .nav')
    if (navElMobile) {
      const mobileNavPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_nav_cream_closeup_375.png`)
      await navElMobile.screenshot({ path: mobileNavPath })
      console.log(`Saved: ${mobileNavPath}`)
    }

    // Mobile Sticky Bottom CTA
    await page.evaluate(() => {
      window.scrollTo({ top: 900, behavior: 'instant' })
    })
    await page.waitForTimeout(600)
    const mobileCtaPath = path.join(ARTIFACT_DIR, `${browserName.toLowerCase()}_home_sticky_cta_375.png`)
    await page.screenshot({ path: mobileCtaPath })
    console.log(`Saved: ${mobileCtaPath}`)

    await context.close()
  }

  await browser.close()
}

async function main() {
  console.log('Capturing visual verification suite across Chrome and Firefox...')
  try {
    await captureBrowser(chromium, 'Chrome')
  } catch (err) {
    console.error('Error running Chrome captures:', err)
  }

  try {
    await captureBrowser(firefox, 'Firefox')
  } catch (err) {
    console.error('Error running Firefox captures:', err)
  }

  console.log('\nAll verification screenshots captured successfully!')
}

main().catch(console.error)
