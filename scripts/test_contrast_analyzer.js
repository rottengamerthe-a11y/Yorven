import { chromium } from 'playwright'

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

async function analyzeElementContrast(page, selector, label) {
  const el = await page.$(selector)
  if (!el) {
    console.log(`Element not found: ${selector}`)
    return null
  }
  const buf = await el.screenshot()
  const base64 = buf.toString('base64')

  const analysis = await page.evaluate(async (base64) => {
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
          if (a > 50) { // non-transparent
            const r = imgData[i]
            const g = imgData[i + 1]
            const b = imgData[i + 2]
            // Calculate luminance inline
            const sRGBtoLin = (c) => {
              const v = c / 255
              return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
            }
            const lum = 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b)
            luminances.push(lum)
          }
        }
        luminances.sort((a, b) => a - b)
        // Background and Foreground
        const minLum = luminances[Math.floor(luminances.length * 0.05)]
        const maxLum = luminances[Math.floor(luminances.length * 0.95)]
        resolve({ minLum, maxLum, count: luminances.length })
      }
      img.src = `data:image/png;base64,${base64}`
    })
  }, base64)

  const ratio = contrastRatio(analysis.minLum, analysis.maxLum)
  console.log(`[${label}] MinLum: ${analysis.minLum.toFixed(3)}, MaxLum: ${analysis.maxLum.toFixed(3)} => Contrast: ${ratio.toFixed(2)}:1`)
  return { label, ratio: ratio.toFixed(2), minLum: analysis.minLum, maxLum: analysis.maxLum }
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })

  console.log('\n--- Sampling Dark Nav ---')
  await analyzeElementContrast(page, '.nav-wrap.floating-pill-nav .logo', 'Dark Nav Logo')
  await analyzeElementContrast(page, '.nav-wrap.floating-pill-nav .nav-links a:not(.nav-contact-btn)', 'Dark Nav Link')

  console.log('\n--- Scrolling to Problem (Cream) Section ---')
  await page.evaluate(() => {
    const el = document.getElementById('problem')
    if (el) {
      if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
      else el.scrollIntoView()
    }
  })
  await page.waitForTimeout(300)
  console.log('--- Sampling Light Nav ---')
  await analyzeElementContrast(page, '.nav-wrap.floating-pill-nav .logo', 'Light Nav Logo')
  await analyzeElementContrast(page, '.nav-wrap.floating-pill-nav .nav-links a:not(.nav-contact-btn)', 'Light Nav Link')

  console.log('\n--- Scrolling to Carousel (#work) ---')
  await page.evaluate(() => {
    const el = document.getElementById('work')
    if (el) {
      if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
      else el.scrollIntoView()
    }
  })
  await page.waitForTimeout(300)
  console.log('--- Sampling Carousel Controls ---')
  await analyzeElementContrast(page, '.reel-ghost-btn', 'Carousel Chevron Button')
  await analyzeElementContrast(page, '.reel-dashes', 'Carousel Progress Dashes')

  await browser.close()
}

run().catch(e => console.error(e))
