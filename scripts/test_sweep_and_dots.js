import { chromium } from 'playwright'

async function test() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
  console.log('Page loaded')

  console.log('Testing scroll sweep...')
  for (let y = 0; y <= 1500; y += 100) {
    await page.evaluate(top => {
      if (window.__lenis) {
        window.__lenis.scrollTo(top, { immediate: true })
      } else {
        window.scrollTo(0, top)
      }
    }, y)
    await page.waitForTimeout(40)
    const state = await page.evaluate(() => {
      const navWrap = document.querySelector('.nav-wrap')
      return navWrap ? navWrap.className : 'no-nav'
    })
    console.log(`Scroll ${y}: class = ${state}`)
  }

  console.log('Testing carousel dots...')
  await page.evaluate(() => {
    const el = document.getElementById('work')
    if (el) {
      if (window.__lenis) window.__lenis.scrollTo(el, { immediate: true })
      else el.scrollIntoView()
    }
  })
  await page.waitForTimeout(300)
  const dots = await page.$$('.reel-dash')
  console.log(`Found ${dots.length} dots`)
  for (let i = 0; i < dots.length; i++) {
    console.log(`Clicking dot ${i}...`)
    await dots[i].click()
    await page.waitForTimeout(100)
    console.log(`Clicked dot ${i}`)
  }

  await browser.close()
  console.log('Done!')
}

test().catch(e => console.error(e))
