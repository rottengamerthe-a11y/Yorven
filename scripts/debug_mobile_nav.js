import { chromium } from 'playwright'

async function debug() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)

  // 1. Position 3: Cream section
  const docH = await page.evaluate(() => document.body.scrollHeight)
  const creamEl = await page.$('.lp-light, [data-theme="light"], [data-theme="cream"]')
  let creamY = 800
  if (creamEl) {
    const box = await creamEl.boundingBox()
    creamY = box.y + 80
  }

  await page.evaluate((y) => window.scrollTo(0, y), creamY)
  await page.waitForTimeout(400)

  const debugCream = await page.evaluate(() => {
    const nav = document.querySelector('.nav-wrap.floating-pill-nav')
    const menuBtn = nav ? nav.querySelector('.menu-button') : null
    const backdrop = nav ? nav.querySelector('.liquid-glass-backdrop') : null
    const bg = backdrop ? window.getComputedStyle(backdrop).backgroundColor : null

    // What element is under the nav center point?
    const under = document.elementsFromPoint(window.innerWidth / 2, 48)
    const topEl = under.find(e => !e.closest('.nav-wrap'))

    return {
      navClass: nav ? nav.className : null,
      menuBtnColor: menuBtn ? window.getComputedStyle(menuBtn).color : null,
      backdropBg: bg,
      underTag: topEl ? topEl.tagName : null,
      underClass: topEl ? topEl.className : null
    }
  })

  console.log('Cream Position Debug:', debugCream)
  await browser.close()
}

debug().catch(console.error)
