import React, { useEffect, useRef, useState } from 'react'

const MANIFEST = {
  desktop: { path: '/sculpture/d/f_%03d.webp', frames: 215, width: 1280, height: 838 },
  mobile: { path: '/sculpture/m/f_%03d.webp', frames: 108, width: 720, height: 472 }
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

export function SculptureCanvas() {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const isReduced = checkReducedMotion()
    setReducedMotion(isReduced)

    const isMobile = window.innerWidth < 768
    const cfg = isMobile ? MANIFEST.mobile : MANIFEST.desktop
    const totalFrames = cfg.frames
    const pathTemplate = cfg.path

    const getFrameUrl = (idx) => pathTemplate.replace('%03d', String(idx).padStart(3, '0'))

    // Image storage
    const images = new Array(totalFrames + 1)
    let isDestroyed = false
    let isHidden = typeof document !== 'undefined' ? document.hidden : false

    // State for lerp interpolation
    const state = {
      targetProgress: 0,
      currentProgress: 0,
      targetOpacity: isMobile ? 0.35 : 0.70,
      currentOpacity: isMobile ? 0.35 : 0.70,
      targetX: isMobile ? 0 : 26,
      currentX: isMobile ? 0 : 26,
      targetY: isMobile ? 4 : 0,
      currentY: isMobile ? 4 : 0,
      targetScale: isMobile ? 0.85 : 1.12,
      currentScale: isMobile ? 0.85 : 1.12,
      targetTiltX: 0,
      targetTiltY: 0,
      currentTiltX: 0,
      currentTiltY: 0
    }

    let lastDrawnFrame = -1
    let rafId = 0

    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d', { alpha: true })

    // Helper to find nearest loaded frame
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

    // Drawing routine (contain-fit, capped dpr = 2)
    function drawImageToCanvas(img) {
      if (!img || !canvas || !ctx || isDestroyed) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight

      const targetCanvasW = Math.round(w * dpr)
      const targetCanvasH = Math.round(h * dpr)

      if (canvas.width !== targetCanvasW || canvas.height !== targetCanvasH) {
        canvas.width = targetCanvasW
        canvas.height = targetCanvasH
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
    }

    // 1. Immediate load of Frame 1
    const frame1 = new Image()
    frame1.decoding = 'async'
    frame1.src = getFrameUrl(1)
    frame1.onload = () => {
      if (isDestroyed) return
      images[1] = frame1
      drawImageToCanvas(frame1)
      lastDrawnFrame = 1

      // If reduced motion, stop here — don't load the rest or attach listeners
      if (isReduced) return

      // Otherwise begin background progressive loading
      startProgressiveLoading()
    }

    // Background progressive loading with concurrency 3
    function startProgressiveLoading() {
      let loadCursor = 2
      const concurrency = 3
      let activeRequests = 0

      function pumpQueue() {
        if (isDestroyed || loadCursor > totalFrames) return
        while (activeRequests < concurrency && loadCursor <= totalFrames) {
          const idx = loadCursor++
          activeRequests++
          const img = new Image()
          img.decoding = 'async'
          img.src = getFrameUrl(idx)
          img.onload = () => {
            activeRequests--
            if (!isDestroyed) {
              images[idx] = img
              pumpQueue()
            }
          }
          img.onerror = () => {
            activeRequests--
            if (!isDestroyed) pumpQueue()
          }
        }
      }

      pumpQueue()
    }

    if (isReduced) {
      // Set static layout
      if (wrapperRef.current) {
        wrapperRef.current.style.opacity = isMobile ? '0.35' : '0.65'
        wrapperRef.current.style.transform = `translate3d(${isMobile ? '0' : '26%'}, ${isMobile ? '4%' : '0'}, 0) scale(${isMobile ? '0.85' : '1.12'})`
      }
      return () => {
        isDestroyed = true
        if (images[1]) images[1].src = ''
      }
    }

    // Desktop mouse tilt (disabled on touch devices)
    const isTouch = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false
    const onPointerMove = (e) => {
      if (isTouch) return
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      state.targetTiltX = nx * 14
      state.targetTiltY = ny * 14
    }

    if (!isTouch) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
    }

    // Anchor calculation for the Section Map
    // Sections:
    // - Hero: 0.00 to 0.09 (large, right side on desktop, behind headline on mobile at reduced opacity)
    // - Shipped work (#proof): hold at 0.09, dimmed to 15% opacity, scaled down
    // - Sound familiar? (#problem): 0.09 to 0.37, dimmed to 20%
    // - A better way (#solution): 0.37 to 0.65 (transformation; full strength 1.0, beside heading)
    // - Services & How it works (#services, #how): 0.65 to 0.84 (settled form, medium strength 0.55, alternating shifts)
    // - FAQ (#faq): hold at 0.84, dimmed 0.20
    // - Final CTA (.final-cta): 0.84 to 1.00 (light sweep, full strength 1.0, centered)
    // - Footer (.footer): fade out (0.0)

    function updateAnchorsAndScroll() {
      if (isDestroyed) return
      const scrollY = window.scrollY || window.pageYOffset || 0

      const heroEl = document.querySelector('.lp-hero-wrap')
      const proofEl = document.querySelector('#proof')
      const problemEl = document.querySelector('#problem')
      const solutionEl = document.querySelector('#solution')
      const servicesEl = document.querySelector('#services')
      const howEl = document.querySelector('#how')
      const faqEl = document.querySelector('#faq')
      const ctaEl = document.querySelector('.final-cta')
      const footerEl = document.querySelector('.footer')

      const getTop = (el) => (el ? el.getBoundingClientRect().top + scrollY : 0)

      const hTop = getTop(heroEl)
      const pTop = getTop(proofEl) || (hTop + 800)
      const prTop = getTop(problemEl) || (pTop + 900)
      const sTop = getTop(solutionEl) || (prTop + 1000)
      const svTop = getTop(servicesEl) || (sTop + 450)
      const hwTop = getTop(howEl) || (svTop + 600)
      const fqTop = getTop(faqEl) || (hwTop + 700)
      const ctTop = getTop(ctaEl) || (fqTop + 800)
      const ftTop = getTop(footerEl) || (ctTop + 500)

      const anchors = [
        // 0. Hero start
        { top: 0, progress: 0.00, opacity: isMobile ? 0.35 : 0.70, x: isMobile ? 0 : 26, y: isMobile ? 4 : 0, scale: isMobile ? 0.85 : 1.12 },
        // 1. Hero end / Proof start
        { top: pTop - 120, progress: 0.09, opacity: isMobile ? 0.25 : 0.40, x: isMobile ? 0 : 24, y: 0, scale: isMobile ? 0.75 : 0.95 },
        // 2. Proof (Modern Classes + Featured Products) -> hold at 0.09, dimmed to 15%, scaled down
        { top: pTop + 250, progress: 0.09, opacity: 0.15, x: isMobile ? 0 : 22, y: 0, scale: isMobile ? 0.60 : 0.75 },
        // 3. Problem start ("Sound familiar?") -> 0.09 to 0.37, dimmed to 20%
        { top: prTop - 100, progress: 0.09, opacity: 0.18, x: isMobile ? 0 : 20, y: 0, scale: isMobile ? 0.65 : 0.80 },
        { top: prTop + 350, progress: 0.37, opacity: 0.20, x: isMobile ? 0 : 18, y: 0, scale: isMobile ? 0.70 : 0.85 },
        // 4. Solution ("A better way") -> 0.37 to 0.65, full strength (1.0)
        { top: sTop + 50, progress: 0.48, opacity: 0.85, x: isMobile ? 0 : 22, y: 0, scale: isMobile ? 0.80 : 1.00 },
        { top: sTop + 350, progress: 0.65, opacity: 1.00, x: isMobile ? 0 : 24, y: 0, scale: isMobile ? 0.85 : 1.05 },
        // 5. Services Hub -> shifts left on desktop, settled form 0.65..0.75, medium strength 0.55
        { top: svTop + 100, progress: 0.75, opacity: 0.55, x: isMobile ? 0 : -22, y: 0, scale: isMobile ? 0.75 : 0.95 },
        // 6. How it works -> shifts right on desktop, settled form 0.75..0.84, medium strength 0.55
        { top: hwTop + 150, progress: 0.84, opacity: 0.55, x: isMobile ? 0 : 22, y: 0, scale: isMobile ? 0.75 : 0.95 },
        // 7. FAQ -> hold at 0.84, dimmed to 0.20
        { top: fqTop + 150, progress: 0.84, opacity: 0.20, x: 0, y: 0, scale: isMobile ? 0.65 : 0.80 },
        // 8. Final CTA -> 0.84 to 1.00 (light sweep to final frame), full strength 1.0, centered behind CTA
        { top: ctTop - 80, progress: 0.92, opacity: 0.80, x: 0, y: 0, scale: isMobile ? 0.80 : 1.00 },
        { top: ctTop + 120, progress: 1.00, opacity: 1.00, x: 0, y: 0, scale: isMobile ? 0.90 : 1.10 },
        // 9. Footer -> fade out
        { top: ftTop - 50, progress: 1.00, opacity: 0.00, x: 0, y: 0, scale: isMobile ? 0.90 : 1.10 }
      ]

      // Interpolate target values between nearest anchors
      let currentAnchor = anchors[0]
      let nextAnchor = anchors[1]

      if (scrollY <= anchors[0].top) {
        currentAnchor = anchors[0]
        nextAnchor = anchors[0]
      } else if (scrollY >= anchors[anchors.length - 1].top) {
        currentAnchor = anchors[anchors.length - 1]
        nextAnchor = anchors[anchors.length - 1]
      } else {
        for (let i = 0; i < anchors.length - 1; i++) {
          if (scrollY >= anchors[i].top && scrollY <= anchors[i + 1].top) {
            currentAnchor = anchors[i]
            nextAnchor = anchors[i + 1]
            break
          }
        }
      }

      const span = nextAnchor.top - currentAnchor.top
      const t = span > 0 ? Math.min(1, Math.max(0, (scrollY - currentAnchor.top) / span)) : 0

      state.targetProgress = currentAnchor.progress + (nextAnchor.progress - currentAnchor.progress) * t
      state.targetOpacity = currentAnchor.opacity + (nextAnchor.opacity - currentAnchor.opacity) * t
      state.targetX = currentAnchor.x + (nextAnchor.x - currentAnchor.x) * t
      state.targetY = currentAnchor.y + (nextAnchor.y - currentAnchor.y) * t
      state.targetScale = currentAnchor.scale + (nextAnchor.scale - currentAnchor.scale) * t
    }

    const onScroll = () => {
      updateAnchorsAndScroll()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    updateAnchorsAndScroll()

    // Tab visibility handling
    const onVisibilityChange = () => {
      isHidden = document.hidden
      if (!isHidden) {
        updateAnchorsAndScroll()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Render loop with lerp smoothing
    const LERP_FACTOR = 0.08
    const TILT_LERP = 0.05

    function tick() {
      if (isDestroyed) return

      if (!isHidden) {
        // Smooth frame progress
        const pDiff = state.targetProgress - state.currentProgress
        if (Math.abs(pDiff) > 0.0001) {
          state.currentProgress += pDiff * LERP_FACTOR
        } else {
          state.currentProgress = state.targetProgress
        }

        // Smooth opacity & transform
        state.currentOpacity += (state.targetOpacity - state.currentOpacity) * LERP_FACTOR
        state.currentX += (state.targetX - state.currentX) * LERP_FACTOR
        state.currentY += (state.targetY - state.currentY) * LERP_FACTOR
        state.currentScale += (state.targetScale - state.currentScale) * LERP_FACTOR

        state.currentTiltX += (state.targetTiltX - state.currentTiltX) * TILT_LERP
        state.currentTiltY += (state.targetTiltY - state.currentTiltY) * TILT_LERP

        // Apply transform to wrapper
        if (wrapperRef.current) {
          const x = state.currentX
          const y = state.currentY
          const tiltX = state.currentTiltX
          const tiltY = state.currentTiltY
          const scale = state.currentScale

          wrapperRef.current.style.transform = `translate3d(calc(${x.toFixed(2)}% + ${tiltX.toFixed(1)}px), calc(${y.toFixed(2)}% + ${tiltY.toFixed(1)}px), 0) scale(${scale.toFixed(3)})`
          wrapperRef.current.style.opacity = Math.max(0, Math.min(1, state.currentOpacity)).toFixed(3)
        }

        // Determine frame index (1 to totalFrames)
        const frameIdx = Math.max(1, Math.min(totalFrames, Math.round(state.currentProgress * (totalFrames - 1)) + 1))
        const resolvedFrame = getNearestLoadedFrame(frameIdx)

        if (resolvedFrame !== lastDrawnFrame && images[resolvedFrame]) {
          drawImageToCanvas(images[resolvedFrame])
          lastDrawnFrame = resolvedFrame
        }
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      isDestroyed = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (!isTouch) window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', onVisibilityChange)

      // Release decoded image memory
      for (let i = 1; i <= totalFrames; i++) {
        if (images[i]) {
          images[i].onload = null
          images[i].onerror = null
          images[i].src = ''
        }
      }
      images.length = 0
    }
  }, [])

  return (
    <div
      ref={wrapperRef}
      className="sculpture-fixed-stage"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'hidden',
        willChange: 'transform, opacity'
      }}
    >
      <div className="sculpture-radial-glow" />
      <canvas
        ref={canvasRef}
        className="sculpture-canvas"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100vw',
          height: '100vh',
          objectFit: 'contain',
          mixBlendMode: 'screen',
          WebkitMaskImage: 'radial-gradient(ellipse 50% 48% at 50% 50%, #000 65%, rgba(0, 0, 0, 0.7) 80%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 50% 48% at 50% 50%, #000 65%, rgba(0, 0, 0, 0.7) 80%, transparent 100%)'
        }}
      />
    </div>
  )
}
