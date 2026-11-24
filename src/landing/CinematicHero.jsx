import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ArrowDown } from 'lucide-react'
import FaultyTerminal from '../components/FaultyTerminal'
import './cinematic-hero.css'

export function CinematicHero() {
  const containerRef = useRef(null)
  const headingRef = useRef(null)
  const sublineRef = useRef(null)
  const ctaGroupRef = useRef(null)
  const scrollCueRef = useRef(null)

  // Parallax on background shader
  useEffect(() => {
    if (typeof window === 'undefined') return
    const shaderEl = containerRef.current?.querySelector('.hero-faulty-terminal')
    const handleScroll = () => {
      if (!containerRef.current || !shaderEl) return
      const scrollY = window.scrollY
      const heroHeight = containerRef.current.offsetHeight || 800
      if (scrollY <= heroHeight * 1.5) {
        const opacity = Math.max(0.4, 1 - (scrollY / heroHeight) * 0.6)
        shaderEl.style.opacity = String(opacity)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Scroll cue helper to smooth-scroll to #work
  const scrollToWork = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    const target = document.getElementById('work')
    if (target) {
      if (window.__lenis) {
        window.__lenis.scrollTo(target, { offset: -32, duration: 1.2 })
      } else {
        target.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  // Dynamic clearance check between CTA group and scroll cue
  useEffect(() => {
    if (typeof window === 'undefined') return
    const checkCueClearance = () => {
      if (!ctaGroupRef.current || !scrollCueRef.current) return
      const ctaRect = ctaGroupRef.current.getBoundingClientRect()
      const cueRect = scrollCueRef.current.getBoundingClientRect()
      const verticalGap = cueRect.top - ctaRect.bottom

      if (verticalGap < 40 || window.innerHeight < 640) {
        scrollCueRef.current.classList.add('cue-hidden-clearance')
      } else {
        scrollCueRef.current.classList.remove('cue-hidden-clearance')
      }
    }

    checkCueClearance()
    window.addEventListener('resize', checkCueClearance)
    return () => window.removeEventListener('resize', checkCueClearance)
  }, [])

  // Fade out cue as soon as user scrolls past 5% of the hero
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleScroll = () => {
      if (!scrollCueRef.current || !containerRef.current) return
      const heroHeight = containerRef.current.offsetHeight || window.innerHeight
      const scrolled = window.scrollY || window.pageYOffset
      if (scrolled > heroHeight * 0.05) {
        scrollCueRef.current.classList.add('cue-scrolled-past')
      } else {
        scrollCueRef.current.classList.remove('cue-scrolled-past')
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <section
      ref={containerRef}
      id="hero"
      className="cinematic-hero-section font-candidate-titan-one surface-dark hero"
      data-theme="dark"
      aria-label="Yorven Studio Intro"
    >
      {/* 1) Faulty Terminal Background */}
      <FaultyTerminal
        tint="#A7EF9E"
        glyphs="blocks"
        scale={1.5}
        digitSize={1.2}
        timeScale={0.5}
        brightness={0.75}
        glow={0.5}
        persistence={0.5}
        mouseReact={true}
        mouseStrength={0.5}
        mouseGlow={0.6}
        curvature={0.1}
        vignette={0.25}
        clickEffect="glitch"
        className="hero-faulty-terminal"
      />
      <div className="cinematic-hero-bottom-fade" aria-hidden="true" />

      {/* 2) Central Animation Stage: Real HTML Headline */}
      <div className="cinematic-stage">
        <div className="cinematic-title-box">
          <h1 className="hero-headline-real" data-no-split="true">
            <span className="hero-word-reveal">Launch&nbsp;</span>
            <span className="hero-word-reveal">your&nbsp;</span>
            <span className="hero-word-reveal">product</span>
          </h1>
        </div>

        {/* Subline */}
        <p ref={sublineRef} className="cinematic-subline hero-sub">
          without guesswork, overruns or delays
        </p>

        {/* Dual CTA Buttons */}
        <div ref={ctaGroupRef} className="cinematic-cta-group hero-actions">
          <Link to="/contact" className="cinematic-btn-primary">
            <span>Start a project</span>
            <span className="cinematic-btn-arrow" aria-hidden="true">
              <ArrowUpRight size={18} strokeWidth={2.4} />
            </span>
          </Link>

          <a
            href="#work"
            className="cinematic-btn-secondary"
            onClick={scrollToWork}
          >
            <span>Explore our work</span>
            <span className="cinematic-btn-arrow" aria-hidden="true">
              <ArrowDown size={15} strokeWidth={2.4} />
            </span>
          </a>
        </div>
      </div>

      {/* 3) Bottom Scroll Cue */}
      <a
        ref={scrollCueRef}
        href="#work"
        onClick={scrollToWork}
        className="cinematic-scroll-cue"
        aria-label="Scroll to selected work section"
      >
        <div className="cinematic-scroll-pill" aria-hidden="true">
          <div className="cinematic-scroll-dot" />
        </div>
        <span>Scroll to explore</span>
      </a>
    </section>
  )
}
