/**
 * LiquidGlass React Component
 *
 * Real SVG physical displacement refraction with multi-tier fallbacks:
 * - Refraction with chromatic aberration (Chromium)
 * - Tuned frosted glass (Safari, Firefox, Mobile)
 * - Solid high-contrast surface (Reduced Transparency)
 *
 * Attribution:
 * Derived and re-engineered from deepika-builds/liquid-glass (MIT License)
 * and hyalite (VII-Cae).
 */

import React, { useRef, useState, useEffect, useMemo } from 'react'
import {
  detectGlassCapability,
  acquireGlassFilter,
  releaseGlassFilter
} from '../utils/glass-manager'
import './liquid-glass.css'

export function LiquidGlass({
  as: Component = 'div',
  variant = 'frost',
  shape = 'custom', // 'pill' | 'card' | 'bar' | 'btn' | 'custom'
  scale = -20,
  chroma = 0,
  radius: radiusProp = null,
  className = '',
  style = {},
  children,
  ...restProps
}) {
  const containerRef = useRef(null)
  const [filterId, setFilterId] = useState(null)
  const [inView, setInView] = useState(true)
  const currentFilterIdRef = useRef(null)

  // Determine browser capability (refract vs frost)
  const [engineMode, setEngineMode] = useState(() => {
    if (typeof window === 'undefined') return 'frost'
    return detectGlassCapability()
  })

  useEffect(() => {
    setEngineMode(detectGlassCapability())
  }, [])

  const shouldRefract = variant === 'refract' && engineMode === 'refract' && inView

  // 1. IntersectionObserver: culls refraction when out of viewport
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting)
      },
      { threshold: 0.05 }
    )
    io.observe(el)

    return () => io.disconnect()
  }, [])

  // 2. ResizeObserver & Filter Allocation
  useEffect(() => {
    const el = containerRef.current
    if (!el || !shouldRefract) {
      if (currentFilterIdRef.current) {
        releaseGlassFilter(currentFilterIdRef.current)
        currentFilterIdRef.current = null
        setFilterId(null)
      }
      return
    }

    let resizeTimer = null

    const updateFilter = () => {
      if (!el || !el.isConnected) return
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (!w || !h) return

      let r = radiusProp
      if (r === null) {
        const computed = window.getComputedStyle(el)
        const rawRadius = computed.borderTopLeftRadius || '0px'
        const parsed = parseFloat(rawRadius) || 0
        r = rawRadius.trim().endsWith('%') ? (parsed / 100) * Math.min(w, h) : parsed
      }

      const newId = acquireGlassFilter({
        width: w,
        height: h,
        radius: r,
        scale,
        chroma
      })

      if (newId !== currentFilterIdRef.current) {
        if (currentFilterIdRef.current) {
          releaseGlassFilter(currentFilterIdRef.current)
        }
        currentFilterIdRef.current = newId
        setFilterId(newId)
      }
    }

    updateFilter()

    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(updateFilter, 120)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      clearTimeout(resizeTimer)
      if (currentFilterIdRef.current) {
        releaseGlassFilter(currentFilterIdRef.current)
        currentFilterIdRef.current = null
      }
    }
  }, [shouldRefract, radiusProp, scale, chroma])

  // Compute backdrop filter style specifically for the isolated background layer
  const computedBackdropStyle = useMemo(() => {
    if (shouldRefract && filterId) {
      const filterValue = `url(#${filterId}) blur(2px) saturate(1.4)`
      return {
        WebkitBackdropFilter: filterValue,
        backdropFilter: filterValue
      }
    }
    return {}
  }, [shouldRefract, filterId])

  const shapeClass = shape !== 'custom' ? `liquid-glass-${shape}` : ''
  const variantClass = shouldRefract && filterId ? 'lg-variant-refract' : 'lg-variant-frost'

  return (
    <Component
      ref={containerRef}
      className={`liquid-glass-wrapper ${shapeClass} ${variantClass} ${className}`.trim()}
      style={style}
      {...restProps}
    >
      <div
        className="liquid-glass-backdrop"
        style={computedBackdropStyle}
        aria-hidden="true"
      />
      <div className="liquid-glass-content">{children}</div>
    </Component>
  )
}
