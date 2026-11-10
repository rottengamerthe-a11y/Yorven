import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Activity, ArrowDown, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Cpu, ExternalLink, FileCheck, FileText, HelpCircle, Layers, LayoutDashboard, List, Lock, Menu, Search, ShieldCheck, Sparkles, Terminal, Tv, X, Zap } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { pageMeta, services, work, allProjects } from './data/site'
import { insights, getPublishedInsights, getInsightBySlug, INSIGHT_CATEGORIES, extractTableOfContents, calculateReadingTime } from './data/insights'
import { InsightCard } from './components/insights/InsightCard'
import { ArticleProse } from './components/insights/ArticleProse'
import { TableOfContents } from './components/insights/TableOfContents'
import { assembleParticles } from './components/particleAssemble'
import './styles.css'
import { Hero, Proof, Problem, Solution, HowItWorks, Faq, FinalCta, MobileScreenshotCarousel } from './landing/Landing'
import { dispatchLead } from './services/leadDispatcher'
import SEOHead from './components/seo/SEOHead'
import { SafeImage } from './components/ui/SafeImage'
import { PrivacyPolicy, TermsOfService, CookiePolicy } from './components/legal/LegalPages'
import { AuthProvider } from './dashboard/context/AuthContext'
import { DashboardLayout } from './dashboard/components/DashboardLayout'
import { DashboardLogin } from './dashboard/pages/DashboardLogin'
import { DashboardMfa } from './dashboard/pages/DashboardMfa'
import { DashboardOverview } from './dashboard/pages/DashboardOverview'
import { DashboardPages } from './dashboard/pages/DashboardPages'
import { DashboardMetrics } from './dashboard/pages/DashboardMetrics'
import { DashboardStatus } from './dashboard/pages/DashboardStatus'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

gsap.registerPlugin(ScrollTrigger)

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const prevPathRef = useRef(pathname)

  useIsomorphicLayoutEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }

    if (hash) {
      const targetId = hash.slice(1)
      const isRouteTransition = prevPathRef.current !== pathname
      prevPathRef.current = pathname

      const applyScroll = (immediate) => {
        const el = document.getElementById(targetId) || (targetId === 'work' ? document.getElementById('featured-products') : null)
        if (!el) return false

        const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - 96)
        if (immediate) {
          window.scrollTo(0, top)
          if (window.__lenis) {
            window.__lenis.resize()
            window.__lenis.scrollTo(top, { immediate: true })
          }
        } else {
          if (window.__lenis) {
            window.__lenis.resize()
            window.__lenis.scrollTo(el, { offset: -96, duration: 1.2 })
          } else {
            window.scrollTo({ top, behavior: 'smooth' })
          }
        }
        return true
      }

      // Synchronously position scroll before browser paint on route transitions
      if (!applyScroll(isRouteTransition)) {
        let attempts = 0
        const interval = setInterval(() => {
          attempts++
          if (applyScroll(isRouteTransition) || attempts >= 20) {
            clearInterval(interval)
          }
        }, 30)
        return () => clearInterval(interval)
      }
    } else {
      prevPathRef.current = pathname
      if (window.__lenis) {
        window.__lenis.resize()
        window.__lenis.scrollTo(0, { immediate: true })
      } else {
        window.scrollTo(0, 0)
      }
    }
  }, [pathname, hash])
  return null
}

// SEO metadata is handled by SEOHead

function useScrollMotion() {
  useEffect(() => {
    const forceFull = new URLSearchParams(window.location.search).get('motion') === 'full'
    const reduced = !forceFull && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('yorven-motion') === 'reduced')
    const root = document.documentElement
    root.classList.add('motion-ready')
    root.classList.toggle('motion-reduced', reduced)
    const themedSections = Array.from(document.querySelectorAll('[data-theme]'))
    let themeFrame = 0
    const updateTheme = () => {
      themeFrame = 0
      const viewportCenter = window.innerHeight * 0.5
      let closest = themedSections[0]
      let closestDistance = Number.POSITIVE_INFINITY
      themedSections.forEach((section) => {
        const rect = section.getBoundingClientRect()
        const distance = Math.abs((rect.top + rect.height * 0.5) - viewportCenter)
        if (distance < closestDistance) {
          closest = section
          closestDistance = distance
        }
      })
      if (closest?.dataset.theme && root.dataset.theme !== closest.dataset.theme) root.dataset.theme = closest.dataset.theme
    }
    const queueThemeUpdate = () => {
      if (!themeFrame) themeFrame = window.requestAnimationFrame(updateTheme)
    }
    const observer = reduced ? null : new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        if (!entry.target.dataset.theme) observer.unobserve(entry.target)
      }
    }), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    document.querySelectorAll('.scroll-reveal, .stagger-reveal, .process-grid, [data-theme]').forEach((element) => observer ? observer.observe(element) : element.classList.add('is-visible'))
    const onScroll = () => {
      root.classList.toggle('nav-scrolled', window.scrollY > 24)
      queueThemeUpdate()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', queueThemeUpdate, { passive: true })
    onScroll()
    if (reduced) return () => { window.cancelAnimationFrame(themeFrame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', queueThemeUpdate); root.removeAttribute('data-theme'); root.classList.remove('motion-ready', 'motion-reduced', 'nav-scrolled') }

    const cleanups = []
    const revealTimer = window.setTimeout(() => {
      document.querySelectorAll('.scroll-reveal, .stagger-reveal, .masked-heading').forEach((element) => element.classList.add('is-visible'))
    }, 2000)
    const ctx = gsap.context(() => {
      const splitText = (element) => {
        if (!element.dataset.splitSource) element.dataset.splitSource = element.innerHTML
        element.innerHTML = element.dataset.splitSource
        const label = element.getAttribute('aria-label') || element.textContent.trim()
        if (label) element.setAttribute('aria-label', label)
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const nodes = []
        while (walker.nextNode()) nodes.push(walker.currentNode)
        nodes.forEach((node) => {
          if (node.parentElement?.closest('.headline-mark')) return
          const tokens = node.textContent.match(/\s+|[^\s]+/g) || []
          const fragment = document.createDocumentFragment()
          tokens.forEach((token) => {
            if (/^\s+$/.test(token)) {
              fragment.appendChild(document.createTextNode(token))
              return
            }
            const word = document.createElement('span')
            word.className = 'motion-word'
            word.setAttribute('aria-hidden', 'true')
            Array.from(token).forEach((character) => {
              const char = document.createElement('span')
              char.className = 'motion-char'
              char.textContent = character
              word.appendChild(char)
            })
            fragment.appendChild(word)
          })
          node.parentNode.replaceChild(fragment, node)
        })
        element.dataset.split = 'true'
      }

      const textTargets = document.querySelectorAll('h1, h2')
      textTargets.forEach(splitText)
      const resplitText = () => {
        textTargets.forEach((element) => {
          element.innerHTML = element.dataset.splitSource
          element.dataset.split = 'false'
          splitText(element)
        })
        ScrollTrigger.refresh()
      }
      let resizeTimer
      const onResize = () => {
        window.clearTimeout(resizeTimer)
        resizeTimer = window.setTimeout(resplitText, 180)
      }
      window.addEventListener('resize', onResize, { passive: true })
      document.fonts?.ready.then(resplitText)
      cleanups.push(() => {
        window.clearTimeout(resizeTimer)
        window.removeEventListener('resize', onResize)
      })
      document.querySelectorAll('.eyebrow').forEach((element) => {
        const label = element.textContent.trim()
        element.dataset.scrambleLabel = label
        element.setAttribute('aria-label', label)
        element.addEventListener('mouseenter', () => scramble(element))
        scramble(element)
      })
      document.querySelectorAll('.button, .text-link, .nav-links a').forEach((element) => {
        if (!element.dataset.roll) element.dataset.roll = element.textContent.trim()
        element.setAttribute('aria-label', element.dataset.roll)
      })

      const headings = gsap.utils.toArray('h1, h2')
      headings.forEach((heading) => {
        const chars = heading.querySelectorAll('.motion-char')
        gsap.set(chars, { yPercent: 110, rotate: 6, transformOrigin: '0 100%' })
        const trigger = heading.closest('.hero') ? undefined : { trigger: heading, start: 'top 88%', once: true }
        gsap.to(chars, { yPercent: 0, rotate: 0, duration: 1.05, stagger: 0.025, ease: 'expo.out', delay: heading.closest('.hero') ? 0.1 : 0, clearProps: 'transform', scrollTrigger: trigger })
      })

      gsap.utils.toArray('.lede, .body-copy, .section-intro, .page-intro, .hero-actions').forEach((element) => {
        gsap.fromTo(element, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: element, start: 'top 88%', once: true } })
      })

      const manifesto = document.querySelector('.manifesto-copy')
      if (manifesto) {
        splitWords(manifesto)
        gsap.fromTo(manifesto.querySelectorAll('.motion-word'), { opacity: 0.15 }, { opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: manifesto, start: 'top 78%', end: 'top 40%', scrub: true } })
      }

      document.querySelectorAll('.headline-mark path').forEach((path) => {
        const length = path.getTotalLength()
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length })
        gsap.to(path, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.out', delay: 0.55 })
      })

      const hero = document.querySelector('.hero')
      const heroChars = hero?.querySelectorAll('h1 .motion-char')
      if (hero && heroChars?.length) {
        const quickY = Array.from(heroChars).map((char) => gsap.quickTo(char, 'y', { duration: 0.6, ease: 'elastic.out(1, .55)' }))
        const quickSkew = Array.from(heroChars).map((char) => gsap.quickTo(char, 'skewX', { duration: 0.6, ease: 'elastic.out(1, .55)' }))
        const centersX = []
        const centersY = []
        const updateCenters = () => heroChars.forEach((char, index) => {
          const rect = char.getBoundingClientRect()
          centersX[index] = rect.left + rect.width / 2
          centersY[index] = rect.top + rect.height / 2
        })
        updateCenters()
        const onPointerMove = (event) => {
          heroChars.forEach((char, index) => {
            const distance = Math.hypot(event.clientX - centersX[index], event.clientY - centersY[index])
            const influence = Math.max(0, 1 - distance / 120)
            quickY[index](-8 * influence)
            quickSkew[index](6 * influence)
            gsap.to(char, { color: influence > 0.02 ? 'var(--green)' : '', duration: 0.2, overwrite: true })
          })
        }
        const resetPointer = () => heroChars.forEach((char, index) => { quickY[index](0); quickSkew[index](0); gsap.to(char, { color: '', duration: 0.6, overwrite: true }) })
        window.addEventListener('resize', updateCenters, { passive: true })
        hero.addEventListener('pointermove', onPointerMove, { passive: true })
        hero.addEventListener('pointerleave', resetPointer)
        cleanups.push(() => { window.removeEventListener('resize', updateCenters); hero.removeEventListener('pointermove', onPointerMove); hero.removeEventListener('pointerleave', resetPointer) })
      }

    })
    const refresh = () => ScrollTrigger.refresh()
    document.fonts?.ready.then(refresh)
    window.addEventListener('load', refresh, { once: true })
    refresh()
    return () => { window.clearTimeout(revealTimer); window.cancelAnimationFrame(themeFrame); cleanups.forEach((cleanup) => cleanup()); ctx.revert(); observer?.disconnect(); window.removeEventListener('load', refresh); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', queueThemeUpdate); root.removeAttribute('data-theme'); root.classList.remove('motion-ready', 'motion-reduced', 'nav-scrolled') }
  }, [])
}

function scramble(element) {
  const label = element.dataset.scrambleLabel
  if (!label || element.dataset.scrambling === 'true') return
  element.dataset.scrambling = 'true'
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const proxy = { progress: 0 }
  gsap.to(proxy, { progress: 1, duration: 0.6, ease: 'power2.out', onUpdate: () => {
    const settled = Math.floor(proxy.progress * label.length)
    element.textContent = label.split('').map((character, index) => index < settled ? character : glyphs[Math.floor(Math.random() * glyphs.length)]).join('')
  }, onComplete: () => { element.textContent = label; element.dataset.scrambling = 'false' } })
}

function splitWords(element) {
  if (element.dataset.splitWords === 'true') return
  const words = element.textContent.trim().split(/\s+/)
  element.setAttribute('aria-label', element.textContent.trim())
  element.textContent = ''
  words.forEach((word, index) => {
    const span = document.createElement('span')
    span.className = 'motion-word'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = word
    element.appendChild(span)
    if (index < words.length - 1) element.appendChild(document.createTextNode(' '))
  })
  element.dataset.splitWords = 'true'
}

function MotionToggle() {
  const [forceFull, setForceFull] = useState(false)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const isForceFull = new URLSearchParams(window.location.search).get('motion') === 'full'
    const isReduced = !isForceFull && localStorage.getItem('yorven-motion') === 'reduced'
    setForceFull(isForceFull)
    setReduced(isReduced)
    document.documentElement.dataset.motion = isForceFull ? 'full' : isReduced ? 'reduced' : 'full'
  }, [])

  const handleToggle = () => {
    setReduced((prev) => {
      const next = !prev
      localStorage.setItem('yorven-motion', next ? 'reduced' : 'full')
      document.documentElement.dataset.motion = forceFull ? 'full' : next ? 'reduced' : 'full'
      return next
    })
  }

  return (
    <button
      className="motion-toggle"
      type="button"
      aria-pressed={forceFull || reduced}
      onClick={handleToggle}
    >
      {forceFull ? 'Full motion preview' : reduced ? 'Motion reduced' : 'Reduce motion'}
    </button>
  )
}

function MarqueeRow({ items, reverse = false }) {
  const rowRef = useRef(null)
  const trackRef = useRef(null)
  const content = [...items, ...items, ...items, ...items]
  useEffect(() => {
    const row = rowRef.current
    const track = trackRef.current
    if (!row || !track) return undefined
    const measure = () => {
      const distance = Math.ceil(track.getBoundingClientRect().width)
      row.style.setProperty('--marquee-distance', `${distance}px`)
      row.style.setProperty('--marquee-duration', `${Math.max(distance / 50, 1)}s`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    measure()
    return () => observer.disconnect()
  }, [])
  const renderTrack = (hidden = false) => <div ref={hidden ? undefined : trackRef} className="marquee-track" aria-hidden={hidden || undefined}>{content.map((item, index) => <React.Fragment key={`${item}-${index}`}><span>{item}</span>{index < content.length - 1 && <b className="marquee-spark" aria-hidden="true" />}</React.Fragment>)}</div>
  return <div ref={rowRef} className={`marquee-row ${reverse ? 'marquee-row-reverse' : 'marquee-row-forward'}`}>{renderTrack()}{renderTrack(true)}</div>
}

function StickyBottomCta({ label = 'Start a project', to = '/contact', href }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const handleScroll = () => {
      if (typeof window !== 'undefined' && window.scrollY > 400) {
        setVisible(true)
      } else {
        setVisible(false)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className={`sticky-bottom-cta ${visible ? 'is-visible' : ''}`} role="region" aria-label="Quick mobile action">
      <div className="container sticky-cta-inner">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="button button-lime sticky-btn">
            {label} <ArrowUpRight size={16} />
          </a>
        ) : (
          <Link to={to} className="button button-lime sticky-btn">
            {label} <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
    </div>
  )
}

function Layout({ children }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const close = () => { setOpen(false); triggerRef.current?.focus() }

  useEffect(() => {
    if (!open) return undefined
    const menu = menuRef.current
    const focusable = menu ? menu.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])') : []
    const firstEl = focusable[0]
    const lastEl = focusable[focusable.length - 1]

    const onKey = (event) => {
      if (event.key === 'Escape') {
        close()
      } else if (event.key === 'Tab' && focusable.length > 0) {
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault()
          lastEl?.focus()
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault()
          firstEl?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('menu-open')
    // Give focus to first item after opening
    setTimeout(() => firstEl?.focus(), 50)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('menu-open')
    }
  }, [open])

  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="scroll-progress" aria-hidden="true" />
    <div className={`nav-backdrop ${open ? 'is-open' : ''}`} onClick={close} aria-hidden="true" />
    <header className="nav-wrap">
      <nav className="nav container" aria-label="Primary navigation">
        <Link className="logo" to="/" onClick={() => setOpen(false)}>
          <img src="/yorven-wordmark.svg" alt="Yorven" width="360" height="72" />
        </Link>
        <div
          ref={menuRef}
          id="primary-menu"
          className={`nav-links ${open ? 'is-open' : ''}`}
          role={open ? "dialog" : undefined}
          aria-modal={open ? "true" : undefined}
          aria-label="Navigation menu"
        >
          <div className="nav-drawer-header">
            <span className="nav-drawer-title">Navigation</span>
            <button
              type="button"
              className="nav-drawer-close"
              onClick={close}
              aria-label="Close navigation menu"
            >
              <X size={20} />
            </button>
          </div>
          <NavLink
            to="/services"
            onClick={(e) => {
              setOpen(false)
              if (window.location.pathname === '/') {
                const el = document.getElementById('services')
                if (el) {
                  e.preventDefault()
                  if (window.location.hash !== '#services') {
                    window.history.pushState(null, '', '/#services')
                  }
                  if (window.__lenis) {
                    window.__lenis.scrollTo(el, { offset: -96, duration: 1.2 })
                  } else {
                    el.scrollIntoView({ behavior: 'smooth' })
                  }
                }
              }
            }}
          >
            Services
          </NavLink>
          <NavLink to="/work" onClick={() => setOpen(false)}>Work</NavLink>
          <NavLink to="/insights" onClick={() => setOpen(false)}>Insights</NavLink>
          <NavLink to="/about" onClick={() => setOpen(false)}>About</NavLink>
          <NavLink className="nav-contact" to="/contact" onClick={() => setOpen(false)}>
            Start a project <ArrowUpRight size={15} />
          </NavLink>
        </div>
        <button
          ref={triggerRef}
          className="menu-button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="primary-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
    </header>
    <main id="main-content">{children || <Outlet />}</main>
    <Footer />
  </>
}

function Footer() {
  const whatsapp = import.meta.env.VITE_WHATSAPP_URL
  return <footer className="footer">
    <div className="container footer-grid">
      <div><Link className="logo" to="/"><img src="/yorven-wordmark.svg" alt="Yorven" width="360" height="72" /></Link><p className="footer-note">Thoughtful digital products<br />for what’s next.</p></div>
      <div>
        <p className="eyebrow">Explore</p>
        <Link
          to="/services"
          onClick={(e) => {
            if (window.location.pathname === '/') {
              const el = document.getElementById('services')
              if (el) {
                e.preventDefault()
                if (window.location.hash !== '#services') {
                  window.history.pushState(null, '', '/#services')
                }
                if (window.__lenis) {
                  window.__lenis.scrollTo(el, { offset: -96, duration: 1.2 })
                } else {
                  el.scrollIntoView({ behavior: 'smooth' })
                }
              }
            }
          }}
        >
          Services Hub
        </Link>
        <Link to="/services/websites">Websites</Link>
        <Link to="/services/digital-products">Digital Products</Link>
        <Link to="/services/systems">Systems & Scale</Link>
        <Link to="/work">Work</Link>
        <Link to="/insights">Insights</Link>
        <Link to="/about">About</Link>
        <Link to="/contact">Contact</Link>
      </div>
      <div><p className="eyebrow">Get in touch</p><a href="mailto:projects@yorven.in">projects@yorven.in</a>{whatsapp && <a href={whatsapp}>WhatsApp</a>}</div>
      <div><p className="eyebrow">Elsewhere</p><a href="https://x.com/YORVENin?s=20" target="_blank" rel="noreferrer">X / Twitter</a><a href="https://www.instagram.com/yorven.in/" target="_blank" rel="noreferrer">Instagram</a><MotionToggle /></div>
    </div>
    <div className="container footer-bottom"><span>© {new Date().getFullYear()} Yorven</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/cookies">Cookies</Link></div></div>
  </footer>
}

function ServiceCards() {
  const [active, setActive] = useState(null)
  const listRef = useRef(null)
  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setActive((current) => (current === null ? 0 : current)); io.disconnect() }
    }, { threshold: 0.45 })
    io.observe(list)
    return () => io.disconnect()
  }, [])
  return (
    <div className="service-list" ref={listRef}>
      {services.map((service, i) => (
        <ServiceRow
          key={service.number}
          service={service}
          open={active === i}
          onToggle={() => setActive(active === i ? null : i)}
          index={i}
        />
      ))}
    </div>
  )
}

function Home() {
  useScrollMotion()
  return <div>
    <Hero />
    <Proof concepts={work.map((item) => <WorkCard key={item.slug} item={item} />)} />
    <Problem />
    <Solution servicesSlot={<ServiceCards />} />
    <HowItWorks />
    <Faq />
    <FinalCta />
    <StickyBottomCta label="Start a project" to="/contact" />
  </div>
}




function ServiceVisual({ number }) {
  if (number === '01') {
    return (
      <div className="service-visual-box website-visual" aria-hidden="true">
        <div className="sv-browser-bar">
          <div className="sv-dots">
            <span className="sv-dot dot-red" />
            <span className="sv-dot dot-yellow" />
            <span className="sv-dot dot-green" />
          </div>
          <span className="sv-url">
            <Lock size={10} /> platform.yorven.studio
          </span>
          <span className="sv-score-pill">
            <Sparkles size={10} /> Fast &amp; Accessible
          </span>
        </div>
        <div className="sv-browser-body">
          <div className="sv-mock-hero">
            <div className="sv-mock-h1" />
            <div className="sv-mock-sub" />
          </div>
          <div className="sv-mock-features">
            <span className="sv-mfeat">Fluid Motion</span>
            <span className="sv-mfeat">Design System</span>
            <span className="sv-mfeat">Zero Layout Shift</span>
          </div>
        </div>
      </div>
    )
  }

  if (number === '02') {
    return (
      <div className="service-visual-box product-visual" aria-hidden="true">
        <div className="sv-app-bar">
          <div className="sv-app-title">
            <LayoutDashboard size={12} /> app.yorven.io
          </div>
          <span className="sv-status-pill green">
            <span className="sv-pulse-dot" /> Live Session
          </span>
        </div>
        <div className="sv-app-body">
          <div className="sv-kpi-grid">
            <div className="sv-kpi-card">
              <small>ACTIVE USERS</small>
              <strong>14,820</strong>
              <span className="sv-trend">+18.4%</span>
            </div>
            <div className="sv-kpi-card">
              <small>API LATENCY</small>
              <strong>24ms</strong>
              <span className="sv-trend">Real-time</span>
            </div>
          </div>
          <div className="sv-flow-row">
            <span className="sv-flow-node">Auth</span>
            <span className="sv-flow-arrow">→</span>
            <span className="sv-flow-node">Realtime DB</span>
            <span className="sv-flow-arrow">→</span>
            <span className="sv-flow-node active">Reactive UI</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="service-visual-box systems-visual" aria-hidden="true">
      <div className="sv-term-bar">
        <div className="sv-term-title">
          <Terminal size={12} /> api.engine.internal
        </div>
        <span className="sv-status-pill cyan">
          <Cpu size={11} /> 16 Shards
        </span>
      </div>
      <div className="sv-term-body">
        <div className="sv-log-line">
          <span className="sv-log-status">[200 OK]</span>
          <span className="sv-log-method">POST</span>
          <span className="sv-log-path">/v1/telemetry</span>
          <span className="sv-log-time">12ms</span>
        </div>
        <div className="sv-log-line">
          <span className="sv-log-status queue">[QUEUE]</span>
          <span className="sv-log-msg">Worker ACK job #8921</span>
          <span className="sv-log-time">0.8ms</span>
        </div>
        <div className="sv-uptime-row">
          <span>UPTIME 99.99%</span>
          <div className="sv-uptime-bars">
            <span className="bar active" /><span className="bar active" /><span className="bar active" /><span className="bar active" /><span className="bar active" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ServiceRow({ service, open, onToggle, index }) {
  const Icon = service.icon
  const articleRef = useRef(null)
  const triggerRef = useRef(null)
  const detailRef = useRef(null)
  const innerRef = useRef(null)
  const canvasRef = useRef(null)
  const timelineRef = useRef(null)
  const [built, setBuilt] = useState(false)

  const detailId = `service-detail-${service.number}`

  // 1) Make room: the card grows downward smoothly
  useEffect(() => {
    const panel = detailRef.current
    if (!panel) return

    timelineRef.current?.kill()

    const contentHeight = panel.scrollHeight

    if (open) {
      gsap.set(panel, { height: 0, opacity: 1, overflow: 'hidden' })

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.set(panel, { height: 'auto', overflow: 'visible' })
          ScrollTrigger.refresh()
        }
      })
      timelineRef.current = tl
      tl.to(panel, { height: contentHeight, duration: 0.55, ease: 'power3.out' })
    } else {
      const currentHeight = panel.getBoundingClientRect().height

      gsap.set(panel, { height: currentHeight, overflow: 'hidden' })

      const tl = gsap.timeline({ onComplete: () => ScrollTrigger.refresh() })
      timelineRef.current = tl
      tl.to(panel, { height: 0, duration: 0.45, ease: 'power3.inOut' })
    }

    return () => {
      timelineRef.current?.kill()
      timelineRef.current = null
    }
  }, [open])

  // 2) Build it: dust particle assembly ("reverse snap" integration/disintegration)
  useIsomorphicLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    const reveal = (px) => {
      const feather = 32
      const mask = `linear-gradient(to bottom, #000 ${Math.max(0, px - feather)}px, transparent ${px}px)`
      inner.style.maskImage = mask
      inner.style.webkitMaskImage = mask
    }
    const showAll = () => {
      inner.style.maskImage = ''
      inner.style.webkitMaskImage = ''
    }

    if (!open) {
      showAll()
      setBuilt(false)
      return undefined
    }
    const mode = document.documentElement.dataset.motion
    const reduced = mode === 'reduced' || (mode !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (reduced) {
      inner.style.opacity = '1'
      showAll()
      setBuilt(true)
      return undefined
    }

    inner.style.transition = 'none'
    inner.style.opacity = '1'
    reveal(0)

    const PAD = 48
    const art = articleRef.current.getBoundingClientRect()
    const trigger = triggerRef.current.getBoundingClientRect()
    const box = inner.getBoundingClientRect()
    const rel = (r) => ({ x: r.left - art.left + PAD, y: r.top - art.top + PAD, w: r.width, h: r.height })
    const width = art.width + PAD * 2
    const height = box.bottom - art.top + PAD * 2
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    return assembleParticles(canvas, {
      source: rel(trigger),
      target: rel(box),
      width,
      height,
      palette: [
        ['#14504a', 0.52],
        ['#104641', 0.2],
        ['#1a5a53', 0.12],
        ['#0d3a37', 0.06],
        ['#d7ed83', 0.05],
        ['#c9ebaa', 0.03],
        ['#087c48', 0.02]
      ],
      onProgress: reveal,
      onSettled: () => {
        showAll()
        setBuilt(true)
      }
    })
  }, [open])

  // Parse deliverables into clean capitalized list items
  const deliverableItems = service.deliverables
    ? service.deliverables.split(', ').map((str) => str.charAt(0).toUpperCase() + str.slice(1))
    : []

  return (
    <article
      ref={articleRef}
      className={`service-row stagger-reveal ${open ? 'active' : ''}`}
      style={{ '--i': index }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="service-trigger"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <div className="service-trigger-top">
          <span className="service-number">{service.number}</span>
          <Icon className="service-icon" size={24} strokeWidth={1.5} />
        </div>

        <span className="service-main">
          <strong>{service.title}</strong>
          <span>{service.text}</span>
        </span>

        <ServiceVisual number={service.number} />

        <div className="service-footer-row">
          <span className="service-tags">
            {service.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </span>

          <span className="service-expand-hint">
            {open ? 'Hide details' : 'Deliverables & timeline'}
            <ChevronDown className={`row-arrow ${open ? 'is-open' : ''}`} size={16} />
          </span>
        </div>
      </button>

      <div
        id={detailId}
        ref={detailRef}
        className="service-detail"
        aria-hidden={!open}
        style={{ height: 0, overflow: 'hidden' }}
      >
        <div ref={innerRef} className={`service-detail-inner ${built ? 'is-built' : ''}`}>
          {/* Micro Spec Bar: Timeline & Stack */}
          <div className="s-spec-bar">
            <div className="s-spec-cell">
              <span className="s-spec-label">Timeline</span>
              <strong className="s-spec-val highlight">{service.timeline}</strong>
            </div>
            <div className="s-spec-divider" />
            <div className="s-spec-cell">
              <span className="s-spec-label">Technology</span>
              <span className="s-spec-val">{service.tech}</span>
            </div>
          </div>

          {/* Key Deliverables Structured Checklist */}
          <div className="s-deliverables-section">
            <span className="s-spec-label">What We Ship</span>
            <ul className="s-deliverables-grid">
              {deliverableItems.map((item) => (
                <li key={item}>
                  <Check size={13} className="s-check-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action CTA inside drawer */}
          <div className="s-drawer-action">
            <Link to={`/contact?type=${encodeURIComponent(service.contactType || service.title)}`} className="s-book-call-btn">
              <span>Book a free call for {service.title.toLowerCase()}</span>
              <ArrowUpRight size={14} />
            </Link>
            {service.slug && (
              <Link to={`/services/${service.slug}`} className="s-explore-link">
                <span>Explore {service.title.toLowerCase()} service</span>
                <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className={`particle-canvas ${open && !built ? 'is-live' : ''} ${built ? 'is-done' : ''}`}
        style={{ left: -48, top: -48 }}
        aria-hidden="true"
      />
    </article>
  )
}
function WorkVisualContent({ item }) {
  if (item.slug === 'payper-ai') {
    return (
      <div className="payper-mockup" aria-hidden="true">
        <div className="mockup-header">
          <div className="mockup-brand">
            <span className="mockup-cmd-icon">⌘</span>
            <strong>proofpay<span className="brand-accent">.ai</span></strong>
          </div>
          <span className="mockup-badge ai-badge">
            <Sparkles size={11} /> Receivables AI
          </span>
        </div>
        <div className="mockup-metrics">
          <div className="mockup-metric-card">
            <small>Active tracked</small>
            <div className="mockup-metric-val">$104,200</div>
            <span className="mockup-metric-sub green-sub">+24% recovered</span>
          </div>
          <div className="mockup-metric-card">
            <small>Overdue risk</small>
            <div className="mockup-metric-val overdue-val">$14,200</div>
            <span className="mockup-metric-sub orange-sub">3 flagged</span>
          </div>
        </div>
        <div className="mockup-ledger">
          <div className="ledger-row alert-row">
            <div className="ledger-cell-top">
              <strong className="ledger-name">Apex Logistics Ltd</strong>
              <span className="ledger-id">INV-2026-041</span>
            </div>
            <div className="ledger-cell-bottom">
              <span className="ledger-amount">$8,500</span>
              <span className="ledger-pill overdue">16d Overdue</span>
            </div>
          </div>
          <div className="ledger-row">
            <div className="ledger-cell-top">
              <strong className="ledger-name">Kinetix Cloud Corp</strong>
              <span className="ledger-id">INV-2026-039</span>
            </div>
            <div className="ledger-cell-bottom">
              <span className="ledger-amount">$14,200</span>
              <span className="ledger-pill pending">Due in 3d</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (item.slug === 'racers-vault') {
    return (
      <div className="racers-mockup" aria-hidden="true">
        <div className="racers-phone-frame">
          <div className="phone-screen-wrap">
            <SafeImage
              src="/projects/racers-vault/porsche-gt3r-grello.webp"
              alt="Porsche 911 GT3 R Grello in Racers Vault"
              className="racers-screen-main"
              width="576"
              height="930"
              aspectRatio="576 / 930"
            />
            <SafeImage
              src="/projects/racers-vault/amg-gt63-coupe.webp"
              alt="Mercedes-AMG GT 63 Coupe in Racers Vault"
              className="racers-screen-alt"
              width="576"
              height="930"
              aspectRatio="576 / 930"
            />
          </div>
        </div>
      </div>
    )
  }

  if (item.slug === 'aurix') {
    return (
      <div className="aurix-mockup" aria-hidden="true">
        <div className="aurix-discord-card">
          <div className="discord-client-top">
            <div className="discord-bot-meta">
              <SafeImage
                src="/projects/aurix/aurix-flame-avatar.webp"
                alt="Aurix Bot"
                className="discord-avatar"
                width="32"
                height="32"
                aspectRatio="1 / 1"
              />
              <div className="discord-bot-identity">
                <span className="discord-bot-name">Aurix</span>
                <span className="discord-app-tag">APP</span>
                <span className="discord-time">Today at 1:05 PM</span>
              </div>
            </div>
          </div>

          <div className="discord-embed-wrap">
            <div className="discord-embed-bar" />
            <div className="discord-embed-content">
              <div className="discord-embed-title">
                <span className="discord-sparkle">✨</span> Server Event: Champion Signal
              </div>
              <p className="discord-embed-desc">
                A combat signal locks onto the server and pays out players who answer before it expires.
                <br /><code className="discord-cmd">/event action:claim</code>
              </p>

              <div className="discord-activity-row">
                <span className="discord-dot-blue">🔹</span>
                <strong>Activity:</strong> Answer the champion signal with the right opener.
              </div>

              {/* 3 Columns on desktop, 1 stacked column on mobile with text wrapping */}
              <div className="discord-cols-grid">
                <div className="discord-col">
                  <div className="discord-col-header">
                    <span className="discord-bullet-orange">◆</span> <strong>Reward</strong>
                  </div>
                  <div className="discord-col-val">6,200 aura + 1,250 XP</div>
                </div>

                <div className="discord-col">
                  <div className="discord-col-header">
                    <span className="discord-bullet-sparkle">✦</span> <strong>Unique Bonus</strong>
                  </div>
                  <div className="discord-col-val">
                    <span>rare crate ×1</span>
                    <span>Adrenaline Tonic ×1</span>
                  </div>
                </div>

                <div className="discord-col">
                  <div className="discord-col-header">
                    <span className="discord-bullet-blue">❖</span> <strong>Window</strong>
                  </div>
                  <div className="discord-col-val discord-window-val">20m 0s</div>
                </div>
              </div>

              <div className="discord-btn-row">
                <span className="discord-pill-btn btn-blurple">⚔️ Claim Loot</span>
                <span className="discord-pill-btn btn-dark">📜 Raid Log</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (item.slug === 'modern-classes') {
    return (
      <div className="modern-card-mockup" aria-hidden="true">
        <div className="m-card-brand-row">
          <SafeImage
            src="/modern-classes-logo.webp"
            alt="Modern Classes Patna"
            className="m-card-logo"
            width="48"
            height="48"
            aspectRatio="1 / 1"
          />
          <div className="m-card-brand-text">
            <strong>Modern Classes Patna</strong>
            <span>Official Android App · Google Play</span>
          </div>
        </div>
        <div className="m-card-badges-row">
          <span className="m-card-badge">Live Classes</span>
          <span className="m-card-badge">Automated Tests</span>
          <span className="m-card-badge">Bilingual Notes</span>
        </div>
      </div>
    )
  }

  return null
}

function WorkCard({ item }) {
  return (
    <Link className="work-card parallax-card" to={'/work/' + item.slug} aria-label={item.title + ' — ' + item.type}>
      <article className="work-card-inner">
        <div className="work-meta">
          <div>
            <h3>{item.title}</h3>
            <p>{item.type}</p>
          </div>
          <span className="work-arrow"><ArrowUpRight size={18} /></span>
        </div>
        <div className={'work-visual ' + item.className}>
          <div className="visual-content">
            <WorkVisualContent item={item} />
          </div>
        </div>
      </article>
    </Link>
  )
}

function Work() { 
  return (
    <PageShell eyebrow="Selected work" title={<>Featured Products &amp;<br /><span>Platforms</span></>}>
      <p className="page-intro">Real-world applications, mobile software, and high-scale systems engineered by our studio.</p>
      <div className="work-grid work-page-grid">{work.map((item) => <WorkCard key={item.slug} item={item} />)}</div>
    </PageShell>
  ) 
}

/* --- High-Fidelity Product Showcase: Racers Vault --- */
function RacersVaultShowcase({ item }) {
  const screens = item.detailedScreens || []
  const [activeIdx, setActiveIdx] = useState(0)
  const active = screens[activeIdx] || screens[0]

  return (
    <div className="cs-showcase-container">
      {/* Clean Screen Selector Tabs */}
      <div className="cs-minimal-tabs" role="tablist" aria-label="Vehicle spot screens">
        {screens.map((s, idx) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={idx === activeIdx}
            className={'cs-min-tab ' + (idx === activeIdx ? 'active' : '')}
            onClick={() => setActiveIdx(idx)}
          >
            <span>0{idx + 1}</span> {s.name}
          </button>
        ))}
      </div>

      <div className="cs-hero-stage">
        {/* Phone Frame */}
        <div
          className="cs-phone-focal"
          onClick={() => setActiveIdx((activeIdx + 1) % screens.length)}
          title="Click to view next spot"
        >
          <div className="phone-device-chassis">
            <div className="phone-notch-bar">
              <span className="phone-island-pill" />
            </div>
            <div className="phone-viewport">
              <SafeImage
                src={active.src}
                alt={active.name}
                className="phone-screen-render"
                width="576"
                height="930"
                aspectRatio="576 / 930"
              />
            </div>
            <div className="phone-home-indicator" />
          </div>
          <span className="phone-click-hint">Click to switch spot ↗</span>
        </div>

        {/* Telemetry Breakdown */}
        <div className="cs-telemetry-story">
          <div className="telemetry-pill-row">
            <span className="cs-clean-pill tag-tier">{active.tier} Tier</span>
            <span className="cs-clean-pill">{active.category}</span>
            <span className="cs-clean-pill tag-xp">{active.xp}</span>
          </div>

          <h2 className="telemetry-headline">{active.name}</h2>
          <p className="telemetry-sub">📍 {active.location}</p>

          <p className="telemetry-body">{active.caption}</p>

          <div className="telemetry-highlights">
            <div>
              <small>VISION LATENCY</small>
              <strong>&lt;780ms</strong>
            </div>
            <div>
              <small>GPS RADAR</small>
              <strong>±3m Accuracy</strong>
            </div>
            <div>
              <small>VERIFICATION</small>
              <strong>Anti-Spoof EXIF</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 3-Up Spot Strip */}
      <div className="cs-gallery-strip">
        <span className="strip-title">Verified Community Spots</span>
        <div className="strip-grid">
          {screens.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              className={'strip-card ' + (idx === activeIdx ? 'active' : '')}
              onClick={() => setActiveIdx(idx)}
            >
              <SafeImage
                src={s.src}
                alt={s.name}
                width="576"
                height="930"
                aspectRatio="576 / 930"
              />
              <div className="strip-card-info">
                <strong>{s.name}</strong>
                <small>{s.category} · {s.tier}</small>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* --- High-Fidelity Product Showcase: Aurix Discord Platform --- */
function AurixShowcase({ item }) {
  const screens = item.detailedScreens || []
  const [activeIdx, setActiveIdx] = useState(0)
  const active = screens[activeIdx] || screens[0]

  return (
    <div className="cs-showcase-container">
      {/* Clean Command Tabs */}
      <div className="cs-minimal-tabs" role="tablist" aria-label="Bot command tabs">
        {screens.map((s, idx) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={idx === activeIdx}
            className={'cs-min-tab aurix-tab ' + (idx === activeIdx ? 'active' : '')}
            onClick={() => setActiveIdx(idx)}
          >
            {s.cmd}
          </button>
        ))}
      </div>

      <div className="cs-hero-stage aurix-stage">
        {/* Discord Client Window */}
        <div className="discord-client-window">
          <div className="discord-frame-header">
            <div className="df-channel">
              <span className="df-hash">#</span>
              <strong>aurix-lounge</strong>
            </div>
            <span className="df-status">● 16 Shards Active</span>
          </div>

          <div className="discord-frame-body">
            <div className="df-message-row">
              <div className="df-bot-avatar">
                <SafeImage
                  src="/projects/aurix/aurix-flame-avatar.webp"
                  alt="Aurix"
                  className="df-bot-avatar-img"
                  width="460"
                  height="460"
                  aspectRatio="1 / 1"
                />
              </div>
              <div className="df-message-content">
                <div className="df-message-header">
                  <strong>Aurix</strong>
                  <span className="df-app-badge">APP</span>
                  <span className="df-timestamp">Today at 1:05 PM</span>
                </div>
                <div className="df-embed-image-box">
                  <SafeImage
                    src={active.src}
                    alt={active.name}
                    className="df-embed-img"
                    width="647"
                    height="680"
                    aspectRatio="647 / 680"
                  />
                </div>
                {active.buttons && (
                  <div className="df-action-row" aria-label="Interactive bot action buttons">
                    {active.buttons.map((b, bIdx) => (
                      <span key={bIdx} className={'df-btn df-btn-' + b.style}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* System Architecture Info */}
        <div className="cs-telemetry-story">
          <div className="telemetry-pill-row">
            <span className="cs-clean-pill tag-cmd">{active.cmd}</span>
            <span className="cs-clean-pill">{active.category}</span>
          </div>

          <h2 className="telemetry-headline">{active.name}</h2>
          <p className="telemetry-sub">⚡ Shard Cluster #03 · Dynamic Wealth Engine</p>

          <p className="telemetry-body">{active.desc}</p>

          <div className="telemetry-highlights">
            <div>
              <small>DISPATCH LATENCY</small>
              <strong>&lt;85ms</strong>
            </div>
            <div>
              <small>CONCURRENCY</small>
              <strong>16 Shards</strong>
            </div>
            <div>
              <small>INFLATION DRIFT</small>
              <strong>0.00% Net</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 5-Up Command Strip */}
      <div className="cs-gallery-strip">
        <span className="strip-title">Production Interaction Modules</span>
        <div className="strip-grid five-up">
          {screens.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              className={'strip-card aurix-card ' + (idx === activeIdx ? 'active' : '')}
              onClick={() => setActiveIdx(idx)}
            >
              <SafeImage
                src={s.src}
                alt={s.name}
                width="647"
                height="680"
                aspectRatio="647 / 680"
              />
              <div className="strip-card-info">
                <strong>{s.cmd}</strong>
                <small>{s.category}</small>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* --- High-Fidelity Product Showcase: PayperAI SaaS Platform --- */
function PayperAIShowcase({ item }) {
  return (
    <div className="cs-showcase-container payper-showcase-container">
      {/* Sleek Browser Window Frame */}
      <div className="cs-browser-frame">
        <div className="browser-chrome-bar">
          <div className="browser-dots">
            <span className="dot-red" />
            <span className="dot-yellow" />
            <span className="dot-green" />
          </div>
          <div className="browser-url-bar">
            <span className="url-lock">🔒</span> proofpay.ai/receivables
          </div>
          <a
            href="http://localhost:5174/"
            target="_blank"
            rel="noreferrer"
            className="browser-open-btn"
          >
            Open Live App <ArrowUpRight size={13} />
          </a>
        </div>

        {/* Real Live Application Screenshot */}
        <div className="browser-screenshot-viewport">
          <SafeImage
            src="/projects/payper-ai-live.png"
            alt="ProofPay Live Application (proofpay.ai)"
            className="cs-browser-live-img"
            width="1440"
            height="900"
            aspectRatio="16 / 10"
          />
        </div>
      </div>

      {/* Live Financial Telemetry Banner */}
      <div className="payper-live-kpi-row">
        <div className="kpi-banner-tile">
          <small>OUTSTANDING TRACKED</small>
          <strong>$34,500</strong>
          <span className="kpi-trend neutral">4 Active Accounts</span>
        </div>
        <div className="kpi-banner-tile">
          <small>AUTO-RECOVERED</small>
          <strong className="text-lime">$104,200</strong>
          <span className="kpi-trend up">+24% on-time settlement</span>
        </div>
        <div className="kpi-banner-tile">
          <small>OVERDUE AT RISK</small>
          <strong className="text-danger">$25,800</strong>
          <span className="kpi-trend down">3 Accounts flagged</span>
        </div>
        <div className="kpi-banner-tile">
          <small>AVERAGE DSO</small>
          <strong>21 Days</strong>
          <span className="kpi-trend up">-9d velocity gain</span>
        </div>
      </div>
    </div>
  )
}

/* --- Modern Classes Bespoke Case Study (Phase 4 Overhaul) --- */
function ModernClassesCaseStudy({ item, nextItem }) {
  const navigate = useNavigate()
  const [activeScreen, setActiveScreen] = useState(0)
  const screens = item.carouselScreens || []
  const current = screens[activeScreen] || screens[0]

  useEffect(() => {
    document.documentElement.dataset.theme = 'teal'
    return () => {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [])

  const nextScreen = () => setActiveScreen((prev) => (prev + 1) % screens.length)
  const prevScreen = () => setActiveScreen((prev) => (prev - 1 + screens.length) % screens.length)

  const handleBack = (e) => {
    e.preventDefault()
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/#proof')
    }
  }

  return (
    <div className="mc-page-wrapper" data-theme="teal">
      <article className="mc-editorial-page container">
      {/* Back Link */}
      <div className="mc-page-top">
        <a href="/#proof" onClick={handleBack} className="cs-back-link">
          <ArrowLeft size={16} /> <span>Back to Featured Products &amp; Platforms</span>
        </a>
      </div>

      {/* Hero: 2-Column Split (Editorial Info on Left, Phone Showcase on Right) */}
      <header className="mc-hero-grid mc-case-study-hero">
        <div className="mc-hero-editorial">
          {/* Small neutral badge */}
          <div className="mc-badge-row">
            <span className="mc-badge-neutral">
              <span className="mc-dot" /> Live on Google Play
            </span>
            <span className="mc-badge-neutral">
              Android Application · 2025–2026
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="mc-hero-h1">
            Modern Classes — <span className="mc-lime-accent">a learning app for board &amp; competitive exams</span>
          </h1>

          {/* Shortened 2-line intro */}
          <p className="mc-hero-intro">
            {item.subtitle || item.description}
          </p>

          {/* Action Row */}
          <div className="mc-action-row">
            <div className="mc-action-buttons">
              <a
                href={item.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button button-lime mc-play-btn"
              >
                View on Google Play <ArrowUpRight size={16} />
              </a>
              <a href="#how-we-built-it" className="mc-secondary-link">
                See how we built it <ArrowDown size={14} />
              </a>
            </div>

            {/* Desktop QR code */}
            <div className="mc-desktop-qr-card" title="Scan with Android camera to open on Google Play">
              <SafeImage
                src={item.qrCode || '/projects/modern-classes-qr.svg'}
                alt="Scan QR code to open Modern Classes on Google Play"
                className="mc-qr-img"
                width="52"
                height="52"
                loading="lazy"
                aspectRatio="1 / 1"
              />
              <div className="mc-qr-info">
                <strong>Scan on Android</strong>
                <small>Instant Google Play link</small>
              </div>
            </div>
          </div>

          {/* 2x2 Feature Chips with Icons */}
          <div className="mc-feature-grid" aria-label="Key app features">
            <div className="mc-feature-chip">
              <div className="mc-feature-chip-icon"><Tv size={16} /> <span>Live Classes</span></div>
              <p>Streaming &amp; recorded video lectures</p>
            </div>
            <div className="mc-feature-chip">
              <div className="mc-feature-chip-icon"><FileCheck size={16} /> <span>Mock Tests</span></div>
              <p>Timed single-choice testing engine</p>
            </div>
            <div className="mc-feature-chip">
              <div className="mc-feature-chip-icon"><BookOpen size={16} /> <span>Study Vault</span></div>
              <p>Bilingual notes &amp; batch schedules</p>
            </div>
            <div className="mc-feature-chip">
              <div className="mc-feature-chip-icon"><HelpCircle size={16} /> <span>Doubts Desk</span></div>
              <p>Direct faculty resolution &amp; review</p>
            </div>
          </div>
        </div>

        {/* Right Column: Desktop Interactive Showcase & Mobile Scroll-Snap Carousel */}
        <div className="mc-phone-showcase">
          {/* Desktop Single-Device View (hidden on mobile via CSS) */}
          <div className="mc-desktop-phone-view">
            <div
              className="mc-phone-device"
              onClick={nextScreen}
              style={{ cursor: 'pointer' }}
              title="Click to view next screenshot"
            >
              <div className="mc-phone-viewport">
                {current && (
                  <SafeImage
                    src={current.src}
                    alt={current.alt || current.title}
                    className="mc-phone-img"
                    width="576"
                    height="1024"
                    loading="lazy"
                    aspectRatio="576 / 1024"
                  />
                )}
              </div>
            </div>

            {/* Carousel Controls & Caption */}
            <div className="mc-phone-controls">
              <button
                type="button"
                className="mc-nav-arrow"
                onClick={prevScreen}
                aria-label="Previous screenshot"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="mc-phone-caption">
                <strong>{current?.title}</strong>
                <span>{current?.subtitle}</span>
              </div>
              <button
                type="button"
                className="mc-nav-arrow"
                onClick={nextScreen}
                aria-label="Next screenshot"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Mobile Native Scroll-Snap Carousel (visible only on mobile) */}
          <MobileScreenshotCarousel screens={screens} />
        </div>
      </header>

      {/* 9. Section 1: Role & Stack (Requirement 9) */}
      <section id="role-stack" className="mc-section">
        <div className="mc-section-header">
          <p className="eyebrow">Studio Delivery</p>
          <h2 className="mc-section-title">Engineering Role &amp; Production Stack</h2>
          <p className="mc-section-desc">
            Yorven architected and shipped the complete mobile application from initial UX design to production deployment on Google Play.
          </p>
        </div>

        <div className="mc-role-grid">
          {(item.roleDetails || []).map((role, idx) => (
            <div key={idx} className="mc-role-card">
              <span className="mc-card-index">0{idx + 1}</span>
              <h3>{role.title}</h3>
              <p>{role.desc}</p>
            </div>
          ))}
        </div>

        <div className="mc-stack-box">
          <span className="mc-stack-heading">Production Technology Stack</span>
          <div className="mc-stack-pills">
            {(item.stackItems || []).map((st, idx) => (
              <div key={idx} className="mc-stack-pill">
                <strong>{st.name}</strong>
                <small>{st.category}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Section 2: Problem -> Solution -> Result (Requirement 9) */}
      <section id="how-we-built-it" className="mc-section">
        <div className="mc-section-header">
          <p className="eyebrow">Architecture &amp; Outcomes</p>
          <h2 className="mc-section-title">Problem &rarr; Solution &rarr; Measurable Result</h2>
          <p className="mc-section-desc">
            How structured software replaced chaotic messaging groups with an institutional digital classroom.
          </p>
        </div>

        <div className="mc-narrative-grid">
          <div className="mc-narrative-card">
            <div className="mc-narrative-tag tag-problem">01 / THE PROBLEM</div>
            <h3>Fragmented Student Experience</h3>
            <p>{item.narrative?.problem || item.problem}</p>
          </div>

          <div className="mc-narrative-card">
            <div className="mc-narrative-tag tag-solution">02 / THE SOLUTION</div>
            <h3>Bespoke Flutter Platform</h3>
            <p>{item.narrative?.solution || item.approach}</p>
          </div>

          <div className="mc-narrative-card">
            <div className="mc-narrative-tag tag-result">03 / THE RESULT</div>
            <h3>Measurable Exam-Day Impact</h3>
            <p>{item.narrative?.result || 'Students manage weekly tests, doubts, and enrolled batch curriculum seamlessly in one verified Android application.'}</p>
          </div>
        </div>
      </section>

      {/* 9. Section 3: App Screenshots Gallery (Requirement 9) */}
      <section id="screenshots" className="mc-section">
        <div className="mc-section-header">
          <p className="eyebrow">Visual Tour</p>
          <h2 className="mc-section-title">Core Student Workflows</h2>
          <p className="mc-section-desc">
            Explore key screens delivered in the production Android build on Google Play.
          </p>
        </div>

        <div className="mc-gallery-grid">
          {screens.map((scr, idx) => (
            <div key={scr.id} className="mc-gallery-card">
              <div className="mc-gallery-frame">
                <SafeImage
                  src={scr.src}
                  alt={scr.alt || scr.title}
                  width="576"
                  height="1024"
                  className="mc-gallery-img"
                  aspectRatio="576 / 1024"
                />
              </div>
              <div className="mc-gallery-meta">
                <span className="mc-gallery-badge">0{idx + 1} · {scr.title}</span>
                <p>{scr.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 9. Section 4: Next Project & Contact CTA (Requirement 9) */}
      <footer className="cs-editorial-footer">
        <div className="cs-next-row">
          <span className="next-label">Next Project</span>
          <Link to={'/work/' + nextItem.slug} className="next-project-link">
            <span>{nextItem.title}</span> <ArrowUpRight size={24} />
          </Link>
        </div>

        <div className="cs-contact-banner">
          <div>
            <h2>Have an ambitious mobile learning product to build?</h2>
            <p className="body-copy">
              We partner with founders and institutions to engineer production software with craft, speed, and client code ownership.
            </p>
          </div>
          <Link to="/contact" className="button button-lime cs-cta-btn">
            Start a project <ArrowUpRight size={16} />
          </Link>
        </div>
      </footer>
    </article>
    <StickyBottomCta label="View on Google Play" href={item.liveUrl} />
  </div>
  )
}

function CaseStudy() { 
  const { slug } = useParams(); 
  const item = (allProjects || work).find((project) => project.slug === slug); 
  if (!item) {
    return (
      <PageShell eyebrow="404" title={<>Product not<br /><span>found</span></>}>
        <Link className="button button-lime" to="/#featured-products">Back to products <ArrowUpRight size={17} /></Link>
      </PageShell>
    );
  }

  const navigate = useNavigate();
  const currentIndex = work.findIndex((p) => p.slug === slug);
  const nextItem = currentIndex !== -1 ? work[(currentIndex + 1) % work.length] : work[0];

  const handleBack = (e) => {
    e.preventDefault();
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/#featured-products');
    }
  };

  if (slug === 'modern-classes') {
    return <ModernClassesCaseStudy item={item} nextItem={nextItem} />
  }

  return (
    <article className="cs-editorial-page container">
      {/* 1. Calm Editorial Header */}
      <header className="cs-editorial-header">
        <a href="/#featured-products" onClick={handleBack} className="cs-back-link">
          <ArrowLeft size={16} /> <span>Back to Featured Products &amp; Platforms</span>
        </a>

        <div className="cs-hero-titles">
          <div className="cs-category-row">
            <span className="cs-meta-pill">{item.label}</span>
            <span className="cs-meta-pill live">● {item.badge || 'Live in Production'}</span>
            <span className="cs-meta-pill">{item.timeline || '2026'}</span>
          </div>
          <h1 className="cs-editorial-h1">{item.title}</h1>
          <p className="cs-editorial-sub">{item.subtitle || item.description}</p>
        </div>

        {/* Minimal inline metadata line (uncluttered) */}
        <div className="cs-inline-specs">
          <span><b>Domain</b> {item.type}</span>
          <span><b>Role</b> {item.role}</span>
          <span><b>Stack</b> {item.stack}</span>
        </div>
      </header>

      {/* 2. Primary Focal Showcase */}
      <section className="cs-primary-showcase" aria-label="Product Showcase">
        {item.slug === 'payper-ai' && <PayperAIShowcase item={item} />}
        {item.slug === 'racers-vault' && <RacersVaultShowcase item={item} />}
        {item.slug === 'aurix' && <AurixShowcase item={item} />}
        {item.slug === 'modern-classes' && <ModernClassesShowcase item={item} />}
      </section>

      {/* 3. Editorial Story: Problem & Engineering */}
      <section className="cs-editorial-story">
        <div className="cs-story-grid">
          <div className="cs-story-col">
            <span className="cs-story-num">01 / THE CHALLENGE</span>
            <h2 className="cs-story-h2">The Opportunity & Problem</h2>
            <p>{item.problem}</p>
          </div>

          <div className="cs-story-col">
            <span className="cs-story-num">02 / THE ARCHITECTURE</span>
            <h2 className="cs-story-h2">How Yorven Engineered It</h2>
            <p>{item.approach}</p>
          </div>
        </div>

        {/* Clean Shipped Capabilities Chips */}
        <div className="cs-clean-caps">
          <span className="caps-label">Shipped Capabilities</span>
          <div className="caps-row">
            {item.screens.map((screen, idx) => (
              <span key={idx} className="caps-pill">{screen}</span>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Next Project & Footer CTA */}
      <footer className="cs-editorial-footer">
        <div className="cs-next-row">
          <span className="next-label">Next Project</span>
          <Link to={'/work/' + nextItem.slug} className="next-project-link">
            <span>{nextItem.title}</span> <ArrowUpRight size={24} />
          </Link>
        </div>

        <div className="cs-contact-banner">
          <div>
            <h2>Have something ambitious to build?</h2>
            <p className="body-copy">We partner with founders and product teams to engineer production software with craft and care.</p>
          </div>
          <Link to="/contact" className="button button-green cs-cta-btn">
            Start a project <ArrowUpRight size={16} />
          </Link>
        </div>
      </footer>
    </article>
  ); 
}

function ServicesHub() {
  return (
    <div className="services-hub-page container">
      <header className="services-hub-header">
        <span className="eyebrow">Studio Capabilities</span>
        <h1 className="services-hub-h1">
          Thoughtful digital services,<br /><span>engineered with clarity and craft</span>
        </h1>
        <p className="page-intro">
          We partner with founders and product teams to design, engineer, and scale modern software.
          Our work spans high-performance web platforms, full-stack digital applications, and resilient backend systems.
        </p>
      </header>

      {/* 3 Core Discipline Cards */}
      <section className="services-hub-grid" aria-label="Core Services">
        {services.map((svc) => {
          const Icon = svc.icon || Layers
          return (
            <article key={svc.slug} className="service-hub-card">
              <div className="sh-card-top">
                <span className="sh-number">{svc.number}</span>
                <span className="sh-icon-box"><Icon size={20} /></span>
              </div>
              <h2 className="sh-card-title">{svc.title}</h2>
              <p className="sh-card-desc">{svc.text}</p>

              <div className="sh-spec-strip">
                <div>
                  <small>DELIVERY WINDOW</small>
                  <strong>{svc.timeline}</strong>
                </div>
                <div>
                  <small>CORE FOUNDATION</small>
                  <strong>{svc.tech}</strong>
                </div>
              </div>

              <div className="sh-deliverables-box">
                <span className="sh-deliv-heading">Key Deliverables</span>
                <ul className="sh-deliv-list">
                  {(svc.deliverableList || []).slice(0, 4).map((item, idx) => (
                    <li key={idx}>
                      <Check size={14} className="sh-check" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="sh-card-actions">
                <Link to={`/services/${svc.slug}`} className="button button-secondary sh-explore-btn">
                  <span>Explore {svc.title.toLowerCase()}</span>
                  <ArrowUpRight size={15} />
                </Link>
                <Link to={`/contact?type=${encodeURIComponent(svc.contactType || svc.title)}`} className="sh-book-link">
                  <span>Start a project</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </article>
          )
        })}
      </section>

      {/* Engineering Process: How We Build Together */}
      <section className="services-process-section" aria-label="How We Build">
        <div className="sp-header">
          <span className="eyebrow">Engagement Model</span>
          <h2 className="sp-title">How we engineer together</h2>
          <p className="body-copy">
            Direct access to senior builders from day one. We replace bureaucratic agency handoffs with working software milestones, transparent architecture, and weekly shipping cadence.
          </p>
        </div>

        <div className="services-process-grid">
          <div className="sp-step-card">
            <span className="sp-step-num">01</span>
            <h3>Problem Framing &amp; Scope</h3>
            <p>We clarify business objectives, user journeys, and technical constraints upfront. You get a concrete technical brief, milestone roadmap, and clear scope boundaries.</p>
          </div>
          <div className="sp-step-card">
            <span className="sp-step-num">02</span>
            <h3>Interactive Prototypes</h3>
            <p>We test interactions and design systems in real browser viewports, not static mockups. This uncovers edge cases early and validates user flows before full engineering begins.</p>
          </div>
          <div className="sp-step-card">
            <span className="sp-step-num">03</span>
            <h3>Full-Stack Implementation</h3>
            <p>Clean front-end component architecture, robust API contracts, and secure database schemas built to production grade with automated tests and weekly preview builds.</p>
          </div>
          <div className="sp-step-card">
            <span className="sp-step-num">04</span>
            <h3>Hardening &amp; Launch Handover</h3>
            <p>Rigorous pre-launch auditing, telemetry instrumentation, performance optimization, and clean deployment handover with complete documentation and team onboarding.</p>
          </div>
        </div>
      </section>

      {/* Services Hub Bottom CTA */}
      <section className="services-hub-cta">
        <div>
          <h2>Ready to build something meaningful?</h2>
          <p className="body-copy">
            Tell us about your product goals, technical parameters, and launch timeline. We will review your brief and follow up within 24 hours.
          </p>
        </div>
        <Link to="/contact" className="button button-lime">
          Start a project <ArrowUpRight size={16} />
        </Link>
      </section>
    </div>
  )
}

function ServiceLandingPage() {
  const { slug } = useParams()
  const service = services.find((s) => s.slug === slug)

  if (!service) {
    return (
      <PageShell eyebrow="404" title={<>Service not<br /><span>found</span></>}>
        <p className="body-copy">The requested service discipline could not be found.</p>
        <Link className="button button-lime" to="/services">
          View all services <ArrowUpRight size={16} />
        </Link>
      </PageShell>
    )
  }

  const currentIndex = services.findIndex((s) => s.slug === slug)
  const nextService = services[(currentIndex + 1) % services.length]
  const relatedCaseStudies = work.filter((w) => (service.caseStudySlugs || []).includes(w.slug))

  return (
    <article className="service-page container">
      {/* 1. Header & Breadcrumb Navigation */}
      <header className="service-page-header">
        <Link to="/services" className="cs-back-link">
          <ArrowLeft size={16} /> <span>Back to all services</span>
        </Link>

        <div className="service-hero-titles">
          <div className="cs-category-row">
            <span className="cs-meta-pill">Service {service.number}</span>
            <span className="cs-meta-pill">{service.tags.join(' · ')}</span>
            <span className="cs-meta-pill">Typical: {service.timeline}</span>
          </div>
          <h1 className="service-editorial-h1">{service.heroTitle || service.title}</h1>
          <p className="service-editorial-sub">{service.heroSub || service.text}</p>
        </div>

        {/* Inline Specs Strip */}
        <div className="cs-inline-specs">
          <span><b>Discipline</b> {service.title}</span>
          <span><b>Delivery window</b> {service.timeline}</span>
          <span><b>Core stack</b> {service.tech}</span>
          <span><b>Engagement</b> Fixed-scope or milestone sprints</span>
        </div>
      </header>

      {/* 2. Visual Capability Showcase */}
      <section className="service-focal-showcase" aria-label={`${service.title} Capability Preview`}>
        <div className="service-visual-stage">
          <ServiceVisual number={service.number} />
        </div>
      </section>

      {/* 3. Editorial Story: The Problem & Our Engineering Approach */}
      <section className="service-editorial-story">
        <div className="cs-story-grid">
          <div className="cs-story-col">
            <span className="cs-story-num">01 / THE CHALLENGE</span>
            <h2 className="cs-story-h2">Why standard execution falls short</h2>
            <p>{service.challenge}</p>
          </div>
          <div className="cs-story-col">
            <span className="cs-story-num">02 / OUR APPROACH</span>
            <h2 className="cs-story-h2">How Yorven engineers it</h2>
            <p>{service.approach}</p>
          </div>
        </div>
      </section>

      {/* 4. What We Ship: Detailed Deliverables Checklist */}
      <section className="service-deliverables-block" aria-label="Deliverables & Specifications">
        <span className="eyebrow">Specifications</span>
        <h2 className="service-section-h2">What we engineer and ship</h2>
        <div className="service-deliverables-grid">
          {(service.deliverableList || []).map((item, idx) => (
            <div key={idx} className="service-deliv-card">
              <div className="sd-card-header">
                <Check size={16} className="sd-icon" />
                <span className="sd-num">0{idx + 1}</span>
              </div>
              <p className="sd-text">{item}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Production Evidence: Case Studies */}
      <section className="service-evidence-block" aria-label="Related Production Case Studies">
        <span className="eyebrow">Track Record</span>
        <h2 className="service-section-h2">Applied in production software</h2>
        {relatedCaseStudies.length > 0 ? (
          <div className="service-evidence-grid">
            {relatedCaseStudies.map((cs) => (
              <Link key={cs.slug} to={`/work/${cs.slug}`} className="service-evidence-card">
                <div className="sec-top">
                  <span className="cs-meta-pill">{cs.label}</span>
                  <span className="cs-meta-pill live">● {cs.badge || 'Live'}</span>
                </div>
                <h3 className="sec-title">{cs.title}</h3>
                <p className="sec-desc">{cs.subtitle || cs.description}</p>
                <div className="sec-meta-row">
                  <span><b>Domain:</b> {cs.type}</span>
                  <span className="sec-cta">View case study <ArrowUpRight size={14} /></span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="service-evidence-fallback">
            <p className="body-copy">
              Our websites are engineered to the same exacting standards as our flagship SaaS and mobile products:
              semantic HTML, responsive layout systems, zero layout shifts, accessible motion, and resilient component structures.
              Explore our engineering across our published product case studies:
            </p>
            <div className="service-evidence-grid">
              {work.slice(0, 2).map((cs) => (
                <Link key={cs.slug} to={`/work/${cs.slug}`} className="service-evidence-card">
                  <div className="sec-top">
                    <span className="cs-meta-pill">{cs.label}</span>
                    <span className="cs-meta-pill live">● {cs.badge || 'Live'}</span>
                  </div>
                  <h3 className="sec-title">{cs.title}</h3>
                  <p className="sec-desc">{cs.subtitle || cs.description}</p>
                  <div className="sec-meta-row">
                    <span><b>Domain:</b> {cs.type}</span>
                    <span className="sec-cta">View case study <ArrowUpRight size={14} /></span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 6. Footer Navigation & Contact CTA */}
      <footer className="service-page-footer">
        <div className="cs-next-row">
          <span className="next-label">Next Discipline</span>
          <Link to={`/services/${nextService.slug}`} className="next-project-link">
            <span>{nextService.title}</span> <ArrowUpRight size={24} />
          </Link>
        </div>

        <div className="cs-contact-banner">
          <div>
            <h2>Ready to discuss your {service.title.toLowerCase()} project?</h2>
            <p className="body-copy">
              Let's explore your requirements, architecture, and timeline with a senior studio engineer.
            </p>
          </div>
          <Link
            to={`/contact?type=${encodeURIComponent(service.contactType || service.title)}`}
            className="button button-green cs-cta-btn"
          >
            Start a project <ArrowUpRight size={16} />
          </Link>
        </div>
      </footer>
    </article>
  )
}

function InsightsListing() {
  const [selectedCategory, setSelectedCategory] = useState('All')
  const publishedArticles = getPublishedInsights()
  const categories = ['All', ...INSIGHT_CATEGORIES]

  const filteredArticles = selectedCategory === 'All'
    ? publishedArticles
    : publishedArticles.filter(a => a.category === selectedCategory)

  const featuredArticle = publishedArticles.find(a => a.featured)
  const nonFeaturedArticles = featuredArticle
    ? filteredArticles.filter(a => a.slug !== featuredArticle.slug)
    : filteredArticles

  return (
    <div className="insights-page container">
      <header className="insights-header">
        <span className="eyebrow">Studio Perspectives &amp; Writing</span>
        <h1 className="insights-h1">
          Perspectives on software craft,<br /><span>systems, and product momentum</span>
        </h1>
        <p className="page-intro">
          Notes, architecture teardowns, and engineering disciplines from our independent product studio.
        </p>
      </header>

      {/* Category filter toolbar */}
      <div className="insights-filters-bar" role="toolbar" aria-label="Filter insights by discipline">
        <span className="if-label">Topic:</span>
        <div className="insights-filters" role="tablist">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat}
              className={`insight-filter-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content Rendering: Empty State vs Article Grid */}
      {publishedArticles.length === 0 ? (
        <section className="insights-empty-section" aria-label="Editorial Status">
          <div className="insights-empty-card">
            <div className="iec-icon-box">
              <BookOpen size={24} aria-hidden="true" />
            </div>
            <h2 className="iec-title">Publishing in progress</h2>
            <p className="iec-body">
              We are curating technical deep-dives on full-stack architecture, design systems, and distributed infrastructure drawn from our active client and internal engineering.
            </p>
            <p className="iec-sub">
              In the meantime, explore our applied engineering across our published product case studies and core studio capabilities.
            </p>
            <div className="iec-actions">
              <Link to="/work" className="button button-secondary">
                <span>Explore Selected Work</span>
                <ArrowUpRight size={15} />
              </Link>
              <Link to="/services" className="button button-lime">
                <span>View Studio Capabilities</span>
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>

          {/* Core Writing Pillars */}
          <div className="insights-pillars-wrap">
            <span className="eyebrow">Editorial Pillars</span>
            <div className="insights-pillars-grid">
              <div className="ip-card">
                <span className="ip-num">01</span>
                <h3>Systems Architecture</h3>
                <p>High-throughput event loops, Redis state synchronization, resilient database schemas, and lease fencing under concurrency.</p>
              </div>
              <div className="ip-card">
                <span className="ip-num">02</span>
                <h3>Product Engineering</h3>
                <p>Translating user journeys into fast, accessible, full-stack software with verifiable weekly milestones and zero agency telephone games.</p>
              </div>
              <div className="ip-card">
                <span className="ip-num">03</span>
                <h3>Front-End Craft</h3>
                <p>Semantic HTML trees, responsive design token systems, fluid layout scaling, and zero layout shift without bloated JavaScript dependencies.</p>
              </div>
            </div>
          </div>
        </section>
      ) : filteredArticles.length === 0 ? (
        <section className="insights-no-results">
          <p className="body-copy">No published insights found in category "{selectedCategory}".</p>
          <button type="button" className="button button-secondary" onClick={() => setSelectedCategory('All')}>
            View all insights
          </button>
        </section>
      ) : (
        <section className="insights-content-grid" aria-label="Published Insights">
          {/* Featured Article Presentation */}
          {selectedCategory === 'All' && featuredArticle && (
            <div className="insights-featured-row">
              <InsightCard article={featuredArticle} featured={true} />
            </div>
          )}

          {/* Standard Article Grid */}
          <div className="insights-grid">
            {nonFeaturedArticles.map((article) => (
              <InsightCard key={article.slug} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* Bottom CTA Banner */}
      <section className="insights-footer-cta">
        <div>
          <h2>Have something meaningful to build?</h2>
          <p className="body-copy">
            We partner with founders and product teams to engineer production software with craft and care.
          </p>
        </div>
        <Link to="/contact" className="button button-lime">
          Start a project <ArrowUpRight size={16} />
        </Link>
      </section>
    </div>
  )
}

function InsightArticle() {
  const { slug } = useParams()
  const article = getInsightBySlug(slug)

  if (!article) {
    return (
      <PageShell eyebrow="404" title={<>Article not<br /><span>found</span></>}>
        <p className="body-copy">The requested insight does not exist or has not been published yet.</p>
        <Link className="button button-lime" to="/insights">
          Back to all insights <ArrowUpRight size={16} />
        </Link>
      </PageShell>
    )
  }

  const tocItems = extractTableOfContents(article)
  const readingTime = calculateReadingTime(article.sections)
  const relatedServices = services.filter(s => (article.relatedServiceSlugs || []).includes(s.slug))
  const relatedCaseStudies = work.filter(w => (article.relatedCaseStudySlugs || []).includes(w.slug))

  return (
    <article className="insight-article-page container">
      {/* 1. Calm Editorial Header */}
      <header className="insight-article-header">
        <Link to="/insights" className="cs-back-link">
          <ArrowLeft size={16} /> <span>Back to all insights</span>
        </Link>

        <div className="insight-hero-titles">
          <div className="cs-category-row">
            <span className="cs-meta-pill">{article.category}</span>
            <span className="cs-meta-pill"><Clock size={11} aria-hidden="true" /> {readingTime}</span>
            <time dateTime={article.publishedAt} className="cs-meta-pill">{article.publishedAt}</time>
          </div>
          <h1 className="insight-article-h1">{article.title}</h1>
          <p className="insight-article-sub">{article.excerpt}</p>
        </div>

        {/* Minimal inline metadata line */}
        <div className="cs-inline-specs">
          <span><b>Topic</b> {article.category}</span>
          <span><b>Published</b> {article.publishedAt}</span>
          {article.author && article.author.name && (
            <span><b>Author</b> {article.author.name}</span>
          )}
          <span><b>Tags</b> {article.tags.join(' · ')}</span>
        </div>
      </header>

      {/* 2. Article Layout: TOC Sidebar + Prose Body */}
      <div className="insight-article-layout">
        {tocItems.length > 0 && (
          <aside className="insight-article-sidebar">
            <TableOfContents items={tocItems} />
          </aside>
        )}

        <div className="insight-article-main">
          <ArticleProse sections={article.sections} />
        </div>
      </div>

      {/* 3. Related Capabilities & Evidence (Conditional) */}
      {(relatedServices.length > 0 || relatedCaseStudies.length > 0) && (
        <section className="insight-related-section" aria-label="Related Studio Capabilities">
          <span className="eyebrow">Applied Engineering</span>
          <h2 className="insight-section-h2">Related capabilities &amp; work</h2>
          <div className="insight-related-grid">
            {relatedServices.map(svc => (
              <Link key={svc.slug} to={`/services/${svc.slug}`} className="service-evidence-card">
                <div className="sec-top">
                  <span className="cs-meta-pill">Service {svc.number}</span>
                </div>
                <h3 className="sec-title">{svc.title}</h3>
                <p className="sec-desc">{svc.text}</p>
                <div className="sec-meta-row">
                  <span>Explore service</span>
                  <span className="sec-cta"><ArrowUpRight size={14} /></span>
                </div>
              </Link>
            ))}
            {relatedCaseStudies.map(cs => (
              <Link key={cs.slug} to={`/work/${cs.slug}`} className="service-evidence-card">
                <div className="sec-top">
                  <span className="cs-meta-pill">{cs.label}</span>
                  <span className="cs-meta-pill live">● Live</span>
                </div>
                <h3 className="sec-title">{cs.title}</h3>
                <p className="sec-desc">{cs.subtitle || cs.description}</p>
                <div className="sec-meta-row">
                  <span>View case study</span>
                  <span className="sec-cta"><ArrowUpRight size={14} /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 4. Footer CTA */}
      <footer className="insight-article-footer">
        <div className="cs-contact-banner">
          <div>
            <h2>Have something ambitious to build?</h2>
            <p className="body-copy">We partner with founders and product teams to engineer production software with craft and care.</p>
          </div>
          <Link to="/contact" className="button button-green cs-cta-btn">
            Start a project <ArrowUpRight size={16} />
          </Link>
        </div>
      </footer>
    </article>
  )
}

function About() { return <PageShell eyebrow="A little about us" title={<>Good work starts<br /><span>with good questions</span></>}><div className="about-layout"><div><p className="page-intro">Yorven is an independent digital product studio for businesses with something meaningful to build.</p><p className="body-copy">We believe technology should make things clearer, not more complicated. That means asking the right questions early, sweating the details and building with enough care that the product can keep up with the people using it.</p></div><div className="principles">{[['01','Clarity over theatre'],['02','Craft in every layer'],['03','Progress, together']].map(([n, t]) => <div key={n}><span>{n}</span><h3>{t}</h3><p>Thoughtful decisions, made visible and shared along the way.</p></div>)}</div></div><section className="trust-todo"><p className="eyebrow">Trust</p><h2>Proof points — <em>TODO.</em></h2><p>We’ll add approved client, partner or delivery facts here when provided.</p></section></PageShell> }
function PageShell({ eyebrow, title, children }) { return <section className="page-shell container"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}</section> }

function Contact() {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    name: '',
    business: '',
    email: '',
    type: '',
    budget: '',
    timeline: '',
    description: '',
    website: ''
  })
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const successRef = useRef(null)

  useEffect(() => {
    if (sent) successRef.current?.focus()
  }, [sent])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search)
      const requestedType = params.get('type')
      if (requestedType) {
        const validOptions = [
          'Website / Marketing Platform',
          'Web Application / SaaS MVP',
          'Mobile Application (iOS & Android)',
          'Systems & Custom Infrastructure',
          'Something else'
        ]
        const matched = validOptions.find(o => o.toLowerCase() === requestedType.toLowerCase()) || ''
        setFormData(prev => ({ ...prev, type: matched }))
      }
    }
  }, [])

  function updateField(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  function handleNext(e) {
    if (e) e.preventDefault()
    if (step === 1) {
      if (!formData.name.trim()) {
        setError('Please enter your full name to continue.')
        return
      }
      setError('')
      setStep(2)
    } else if (step === 2) {
      if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        setError('Please enter a valid work email address.')
        return
      }
      if (!formData.type) {
        setError('Please select a project type.')
        return
      }
      if (!formData.budget) {
        setError('Please select a budget range.')
        return
      }
      if (!formData.timeline) {
        setError('Please select your preferred launch timeline.')
        return
      }
      setError('')
      setStep(3)
    }
  }

  function handleBack() {
    setError('')
    setStep(prev => Math.max(1, prev - 1))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (formData.website) return // Honeypot
    if (!formData.description.trim()) {
      setError('Please provide a brief project description.')
      return
    }
    setError('')
    setSending(true)

    try {
      const result = await dispatchLead({ ...formData })
      if (result && result.ok) {
        setSent(true)
      } else {
        setError(result?.error || "We couldn't submit your booking. Please email projects@yorven.in directly or try again.")
      }
    } catch (submissionError) {
      console.error('[Contact] Submission error:', submissionError)
      setError("We couldn't submit your booking. Please email projects@yorven.in directly or try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <PageShell eyebrow="Start a conversation" title={<>Let's build<br /><span>what's next</span></>}>
      <div className="contact-layout">
        <div>
          <p className="page-intro">Tell us the shape of the idea and we’ll take it from there.</p>
          <div className="contact-detail">
            <p className="eyebrow">Email</p>
            <a href="mailto:projects@yorven.in">projects@yorven.in <ArrowUpRight size={15} /></a>
          </div>
        </div>

        <div className="form-card">
          {sent ? (
            <div className="form-success-card" tabIndex="-1" ref={successRef} aria-live="polite">
              <span className="success-pill">✓ Call Request Confirmed</span>
              <h2>We’re looking forward to speaking, {formData.name}.</h2>
              <p className="body-copy">
                We’ve received your project brief for <strong>{formData.business || 'your venture'}</strong>. 
                Our team will review your scope and follow up at <strong>{formData.email}</strong> within 24 hours with calendar invite options and a preliminary roadmap.
              </p>
              <div className="success-summary-box">
                <div>
                  <small>PROJECT FOCUS</small>
                  <strong>{formData.type || 'Custom Software'}</strong>
                </div>
                <div>
                  <small>BUDGET BRACKET</small>
                  <strong>{formData.budget}</strong>
                </div>
                <div>
                  <small>TIMELINE</small>
                  <strong>{formData.timeline}</strong>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={step === 3 ? handleSubmit : handleNext} noValidate>
              {/* Multi-Stage Progress Bar & Header */}
              <div className="form-progress-wrap">
                <div className="form-progress-meta">
                  <span className="form-stage-badge">Stage {step} of 3</span>
                  <span className="form-stage-title">
                    {step === 1 && '01 / About you'}
                    {step === 2 && '02 / Scope & Parameters'}
                    {step === 3 && '03 / Project Vision'}
                  </span>
                  <span className="form-progress-pct">{step === 1 ? '33%' : step === 2 ? '66%' : '100%'}</span>
                </div>
                <div
                  className="form-progress-track"
                  role="progressbar"
                  aria-valuenow={step === 1 ? 33 : step === 2 ? 66 : 100}
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div
                    className="form-progress-fill"
                    style={{ width: step === 1 ? '33.3%' : step === 2 ? '66.6%' : '100%' }}
                  />
                </div>
              </div>

              {/* STAGE 1: About You */}
              {step === 1 && (
                <div className="form-stage-body">
                  <div className="form-stage-intro">
                    <h3>Let's start with who you are</h3>
                    <p>Tell us your name and business so we know who we're speaking with.</p>
                  </div>
                  <div className="form-grid">
                    <label htmlFor="contact-name">
                      Full name *
                      <input
                        id="contact-name"
                        required
                        name="name"
                        type="text"
                        inputMode="text"
                        autoComplete="name"
                        placeholder="e.g. Sarah Jenkins"
                        value={formData.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? 'contact-form-error' : undefined}
                        autoFocus
                      />
                    </label>
                    <label htmlFor="contact-business">
                      Business name
                      <input
                        id="contact-business"
                        name="business"
                        type="text"
                        inputMode="text"
                        autoComplete="organization"
                        placeholder="e.g. Acme Labs or stealth venture"
                        value={formData.business}
                        onChange={(e) => updateField('business', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* STAGE 2: Scope & Budget */}
              {step === 2 && (
                <div className="form-stage-body">
                  <div className="form-stage-intro">
                    <h3>What are you looking to build?</h3>
                    <p>Help us understand your scope, target budget, and desired launch window.</p>
                  </div>
                  <div className="form-grid">
                    <label htmlFor="contact-email">
                      Work email address *
                      <input
                        id="contact-email"
                        required
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="sarah@acmelabs.com"
                        value={formData.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? 'contact-form-error' : undefined}
                        autoFocus
                      />
                    </label>
                    <label htmlFor="contact-type">
                      Project type *
                      <select
                        id="contact-type"
                        required
                        name="type"
                        value={formData.type}
                        onChange={(e) => updateField('type', e.target.value)}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? 'contact-form-error' : undefined}
                      >
                        <option value="" disabled>Select project type</option>
                        <option>Website / Marketing Platform</option>
                        <option>Web Application / SaaS MVP</option>
                        <option>Mobile Application (iOS & Android)</option>
                        <option>Systems & Custom Infrastructure</option>
                        <option>Something else</option>
                      </select>
                    </label>
                    <label htmlFor="contact-budget">
                      Budget range (USD) *
                      <select
                        id="contact-budget"
                        required
                        name="budget"
                        value={formData.budget}
                        onChange={(e) => updateField('budget', e.target.value)}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? 'contact-form-error' : undefined}
                      >
                        <option value="" disabled>Select USD budget range</option>
                        <option>Under $5,000</option>
                        <option>$5,000 – $15,000</option>
                        <option>$15,000 – $30,000</option>
                        <option>$30,000 – $50,000+</option>
                        <option>Prefer to discuss</option>
                      </select>
                    </label>
                    <label htmlFor="contact-timeline">
                      Target launch timeline *
                      <select
                        id="contact-timeline"
                        required
                        name="timeline"
                        value={formData.timeline}
                        onChange={(e) => updateField('timeline', e.target.value)}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? 'contact-form-error' : undefined}
                      >
                        <option value="" disabled>Select launch window</option>
                        <option>Exploring / Early planning</option>
                        <option>Within 1–2 months</option>
                        <option>Within 3–6 months</option>
                        <option>Flexible</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {/* STAGE 3: Project Vision & Booking */}
              {step === 3 && (
                <div className="form-stage-body">
                  <div className="form-stage-intro">
                    <h3>Tell us about your project</h3>
                    <p>Share a brief summary of what you want to achieve on our free discovery call.</p>
                  </div>
                  <div className="form-grid">
                    <label htmlFor="contact-description" className="full">
                      Project description *
                      <textarea
                        id="contact-description"
                        required
                        name="description"
                        rows="5"
                        placeholder="Tell us what you're looking to build, any technical preferences, key features, or benchmark products you admire..."
                        value={formData.description}
                        onChange={(e) => updateField('description', e.target.value)}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? 'contact-form-error' : undefined}
                        autoFocus
                      />
                    </label>
                    <label className="honeypot" aria-hidden="true">
                      Website
                      <input
                        tabIndex="-1"
                        autoComplete="off"
                        name="website"
                        value={formData.website}
                        onChange={(e) => updateField('website', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}

              {error && <div id="contact-form-error" className="form-error" role="alert" aria-live="assertive">{error}</div>}

              {/* Form Actions: Back & Next / Book Call with generous spacing */}
              <div className="form-actions-row">
                {step > 1 ? (
                  <button
                    type="button"
                    className="button button-outline form-back-btn"
                    onClick={handleBack}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                ) : <div />}

                {step < 3 ? (
                  <button
                    type="button"
                    className="button button-green form-next-btn"
                    onClick={handleNext}
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    className="button button-green form-submit-btn"
                    type="submit"
                    disabled={sending}
                  >
                    {sending ? 'Scheduling…' : 'Book a free call'} <ArrowUpRight size={17} />
                  </button>
                )}
              </div>

              {step === 3 && (
                <p className="form-privacy-notice">
                  Information provided is used solely to evaluate your project and respond to your enquiry. Deliveries are routed via Web3Forms and relevant project alerts are forwarded to our private studio Discord channel. See our <Link to="/privacy">Privacy Policy</Link> for details.
                </p>
              )}

              <p className="form-footnote">
                {step === 3
                  ? 'No pressure, no hard sell. Just a candid technical conversation and written roadmap.'
                  : 'Stage ' + step + ' of 3 · Your details are saved automatically.'}
              </p>
            </form>
          )}
        </div>
      </div>
    </PageShell>
  )
}

function DashboardRouteWrapper() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <SEOHead />
      <Routes>
        {/* Private Studio Dashboard Control Room */}
        <Route element={<DashboardRouteWrapper />}>
          <Route path="/dashboard/login" element={<DashboardLogin />} />
          <Route path="/dashboard/mfa" element={<DashboardMfa />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/dashboard/overview" replace />} />
            <Route path="overview" element={<DashboardOverview />} />
            <Route path="pages" element={<DashboardPages />} />
            <Route path="metrics" element={<DashboardMetrics />} />
            <Route path="status" element={<DashboardStatus />} />
          </Route>
        </Route>

        {/* Public Marketing Routes with Public Studio Layout */}
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<ServicesHub />} />
          <Route path="/services/:slug" element={<ServiceLandingPage />} />
          <Route path="/work" element={<Work />} />
          <Route path="/work/:slug" element={<CaseStudy />} />
          <Route path="/insights" element={<InsightsListing />} />
          <Route path="/insights/:slug" element={<InsightArticle />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route
            path="*"
            element={
              <PageShell
                eyebrow="404"
                title={<>That page went<br /><span>somewhere else</span></>}
              >
                <Link className="button button-lime" to="/">
                  Back home <ArrowUpRight size={17} />
                </Link>
              </PageShell>
            }
          />
        </Route>
      </Routes>
    </>
  )
}

export function App() {
  useEffect(() => {
    // On mobile screens or coarse pointers, disable Lenis so native hardware-accelerated touch momentum scrolling runs directly on the compositor
    const isMobile = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 768px), (pointer: coarse)').matches : false
    if (isMobile) {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.add('is-mobile-touch')
      }
      return undefined
    }

    const lenis = new Lenis({
      duration: 1.2,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    })

    window.__lenis = lenis
    lenis.on('scroll', ScrollTrigger.update)

    const tickerCallback = (time) => {
      lenis.raf(time * 1000)
    }

    gsap.ticker.add(tickerCallback)
    gsap.ticker.lagSmoothing(0)

    if (window.location.hash) {
      setTimeout(() => {
        const target = document.querySelector(window.location.hash) || (window.location.hash === '#work' ? document.getElementById('featured-products') : null)
        if (target) lenis.scrollTo(target, { offset: -96, immediate: true })
      }, 50)
    }

    return () => {
      window.__lenis = null
      gsap.ticker.remove(tickerCallback)
      lenis.destroy()
    }
  }, [])

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

if (typeof document !== 'undefined') {
  const rootElement = document.getElementById('root')
  if (rootElement) {
    if (rootElement.hasChildNodes()) {
      hydrateRoot(rootElement, <React.StrictMode><App /></React.StrictMode>)
    } else {
      createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>)
    }
  }
}
