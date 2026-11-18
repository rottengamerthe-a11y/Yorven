import React, { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const MANIFEST = {
  desktop: { path: '/sculpture/d/f_%03d.webp', frames: 169, width: 1280, height: 838 },
  mobile: { path: '/sculpture/m/f_%03d.webp', frames: 85, width: 720, height: 472 }
}

function checkReducedMotion() {
  if (typeof window === 'undefined') return false
  if (navigator?.connection?.saveData) return true
  const mode = document.documentElement?.dataset?.motion
  if (mode === 'reduced') return true
  if (mode === 'full') return false
  const stored = localStorage.getItem('yorven-motion')
  if (stored === 'reduced') return true
  return window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
}

export function SculptureCanvas({ heroWrapRef }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mql = window.matchMedia('(max-width: 768px)')
    const handler = (e) => setIsMobile(e.matches)
    if (mql.addEventListener) {
      mql.addEventListener('change', handler)
    } else {
      mql.addListener(handler)
    }
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handler)
      } else {
        mql.removeListener(handler)
      }
    }
  }, [])

  useEffect(() => {
    const isReduced = checkReducedMotion()
    const cfg = isMobile ? MANIFEST.mobile : MANIFEST.desktop
    const totalFrames = cfg.frames
    const pathTemplate = cfg.path

    const getFrameUrl = (idx) => pathTemplate.replace('%03d', String(idx).padStart(3, '0'))

    const images = new Array(totalFrames + 1)
    let isDestroyed = false
    let isHidden = typeof document !== 'undefined' ? document.hidden : false
    let lastDrawnFrame = -1
    let rafId = 0

    let targetProgress = 0
    let currentProgress = 0
    const LERP_FACTOR = 0.08

    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d', { alpha: true })

    function getNearestLoadedFrame(targetIdx) {
      if (images[targetIdx]?.complete && images[targetIdx]?.naturalWidth > 0) {
        return targetIdx
      }
      let left = targetIdx - 1
      let right = targetIdx + 1
      while (left >= 1 || right <= totalFrames) {
        if (left >= 1 && images[left]?.complete && images[left]?.naturalWidth > 0) return left
        if (right <= totalFrames && images[right]?.complete && images[right]?.naturalWidth > 0) return right
        left--
        right++
      }
      return 1
    }

    function drawFrame(frameIdx) {
      if (!canvas || !ctx || isDestroyed) return
      const img = images[frameIdx]
      if (!img || !img.complete || img.naturalWidth === 0) return

      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const targetW = Math.round(rect.width * dpr)
      const targetH = Math.round(rect.height * dpr)

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const imgW = img.naturalWidth || cfg.width
      const imgH = img.naturalHeight || cfg.height

      const scale = Math.min(canvas.width / imgW, canvas.height / imgH)
      const drawW = imgW * scale
      const drawH = imgH * scale
      const drawX = (canvas.width - drawW) / 2
      const drawY = (canvas.height - drawH) / 2

      ctx.drawImage(img, drawX, drawY, drawW, drawH)
      lastDrawnFrame = frameIdx
    }

    // 1. Immediate load of Frame 1 (Hero initial payload under 300KB)
    const frame1 = new Image()
    frame1.decoding = 'async'
    frame1.src = getFrameUrl(1)
    frame1.onload = () => {
      if (isDestroyed) return
      images[1] = frame1
      drawFrame(1)

      if (isReduced) return
      startProgressivePreload()
    }

    // Progressive background preload with concurrency 2
    function startProgressivePreload() {
      let cursor = 2
      const concurrency = 2
      let active = 0

      function pump() {
        if (isDestroyed || cursor > totalFrames) return
        while (active < concurrency && cursor <= totalFrames) {
          const idx = cursor++
          active++
          const img = new Image()
          img.decoding = 'async'
          img.src = getFrameUrl(idx)
          img.onload = () => {
            active--
            if (!isDestroyed) {
              images[idx] = img
              pump()
            }
          }
          img.onerror = () => {
            active--
            if (!isDestroyed) pump()
          }
        }
      }
      pump()
    }

    // Render loop with lerp smoothing
    function tick() {
      if (isDestroyed || isHidden) return

      const diff = targetProgress - currentProgress
      if (Math.abs(diff) > 0.0001) {
        currentProgress += diff * LERP_FACTOR
      } else {
        currentProgress = targetProgress
      }

      // Scrubs sequence: targetProgress runs 0.00 to 0.55
      const frameIdx = Math.max(1, Math.min(totalFrames, Math.round(currentProgress * (totalFrames - 1)) + 1))
      const resolved = getNearestLoadedFrame(frameIdx)

      if (resolved !== lastDrawnFrame && images[resolved]) {
        drawFrame(resolved)
      }

      rafId = requestAnimationFrame(tick)
    }

    // Tab visibility handling (pause when tab hidden)
    const onVisibilityChange = () => {
      isHidden = document.hidden
      if (!isHidden) {
        if (lastDrawnFrame > 0 && images[lastDrawnFrame]) {
          drawFrame(lastDrawnFrame)
        }
        if (!isReduced) {
          cancelAnimationFrame(rafId)
          rafId = requestAnimationFrame(tick)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Redraw on window resize
    const onResize = () => {
      if (lastDrawnFrame > 0 && images[lastDrawnFrame]) {
        drawFrame(lastDrawnFrame)
      }
    }
    window.addEventListener('resize', onResize, { passive: true })

    // Setup ScrollTrigger pinned hero scene
    const triggerEl = heroWrapRef?.current || containerRef.current?.closest('.lp-hero-wrap') || containerRef.current

    const ctxGsap = gsap.context(() => {
      if (!isReduced && triggerEl) {
        ScrollTrigger.create({
          trigger: triggerEl,
          start: 'top top',
          end: () => `+=${window.innerHeight * 2}`,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            // Scrub fraction 0.00 to 0.55 of the sequence
            targetProgress = self.progress * 0.55
          }
        })

        rafId = requestAnimationFrame(tick)
      }
    })

    return () => {
      isDestroyed = true
      cancelAnimationFrame(rafId)
      ctxGsap.revert()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('resize', onResize)

      for (let i = 1; i <= totalFrames; i++) {
        if (images[i]) {
          images[i].onload = null
          images[i].onerror = null
          images[i].src = ''
        }
      }
      images.length = 0
    }
  }, [heroWrapRef, isMobile])

  return (
    <div
      ref={containerRef}
      className="hero-sculpture"
      aria-hidden="true"
    >
      <div className="sculpture-backing" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="sculpture-canvas"
        aria-hidden="true"
      />
    </div>
  )
}
