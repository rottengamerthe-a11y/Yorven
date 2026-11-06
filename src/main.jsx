import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bot, Check, ChevronDown, Cpu, ExternalLink, FileText, Globe, Layers, LayoutDashboard, Menu, Search, ShieldCheck, Sparkles, Terminal, X, Zap } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { pageMeta, services, work } from './data/site'
import { assembleParticles } from './components/particleAssemble'
import './styles.css'
import { Hero, Proof, Problem, Solution, HowItWorks, Faq, FinalCta } from './landing/Landing'
import { dispatchLead } from './services/leadDispatcher'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

gsap.registerPlugin(ScrollTrigger)

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const targetId = hash.slice(1)
      let attempts = 0
      const scrollToTarget = () => {
        const el = document.getElementById(targetId)
        if (el && window.__lenis) {
          window.__lenis.resize()
          window.__lenis.scrollTo(el, { offset: -96, duration: 1.2 })
          return
        }
        if (attempts < 20) {
          attempts++
          setTimeout(scrollToTarget, 100)
          return
        }
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }
      const timer = setTimeout(scrollToTarget, 100)
      return () => clearTimeout(timer)
    } else {
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

function DocumentMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    const [title, description] = pageMeta[pathname] || ['Yorven — Built for what’s next.', 'Yorven digital product studio.']
    document.title = title
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${window.location.origin}${pathname}`)
  }, [pathname])
  return null
}

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
  const forceFull = new URLSearchParams(window.location.search).get('motion') === 'full'
  const [reduced, setReduced] = useState(() => !forceFull && localStorage.getItem('yorven-motion') === 'reduced')
  useEffect(() => {
    document.documentElement.dataset.motion = forceFull ? 'full' : reduced ? 'reduced' : 'full'
    localStorage.setItem('yorven-motion', reduced ? 'reduced' : 'full')
  }, [forceFull, reduced])
  return <button className="motion-toggle" type="button" aria-pressed={forceFull || reduced} onClick={() => setReduced((value) => !value)}>{forceFull ? 'Full motion preview' : reduced ? 'Motion reduced' : 'Reduce motion'}</button>
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

function Layout({ children }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const close = () => { setOpen(false); triggerRef.current?.focus() }
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('menu-open')
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('menu-open') }
  }, [open])
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="scroll-progress" aria-hidden="true" />
    <header className="nav-wrap">
      <nav className="nav container" aria-label="Primary navigation">
        <Link className="logo" to="/" onClick={() => setOpen(false)}><img src="/yorven-wordmark.svg" alt="Yorven" /></Link>
        <div ref={menuRef} id="primary-menu" className={`nav-links ${open ? 'is-open' : ''}`}>
          <NavLink
            to="/#services"
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
          <NavLink to="/about" onClick={() => setOpen(false)}>About</NavLink>
          <NavLink className="nav-contact" to="/contact" onClick={() => setOpen(false)}>Start a project <ArrowUpRight size={15} /></NavLink>
        </div>
        <button ref={triggerRef} className="menu-button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="primary-menu" onClick={() => setOpen((value) => !value)}>{open ? <X /> : <Menu />}</button>
      </nav>
    </header>
    <main id="main-content">{children}</main>
    <Footer />
  </>
}

function Footer() {
  const whatsapp = import.meta.env.VITE_WHATSAPP_URL
  return <footer className="footer">
    <div className="container footer-grid">
      <div><Link className="logo" to="/"><img src="/yorven-wordmark.svg" alt="Yorven" /></Link><p className="footer-note">Thoughtful digital products<br />for what’s next.</p></div>
      <div>
        <p className="eyebrow">Explore</p>
        <Link
          to="/#services"
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
          Services
        </Link>
        <Link to="/#how">How it works</Link>
        <Link to="/#faq">FAQ</Link>
        <Link to="/work">Work</Link>
        <Link to="/about">About</Link>
        <Link to="/contact">Contact</Link>
      </div>
      <div><p className="eyebrow">Get in touch</p><a href="mailto:projects@yorven.in">projects@yorven.in</a><a href="tel:+916289853585">+91 62898 53585</a>{whatsapp && <a href={whatsapp}>WhatsApp</a>}</div>
      <div><p className="eyebrow">Elsewhere</p><a href="https://x.com/YORVENin?s=20" target="_blank" rel="noreferrer">X / Twitter</a><a href="https://www.instagram.com/yorven.in/" target="_blank" rel="noreferrer">Instagram</a><MotionToggle /></div>
    </div>
    <div className="container footer-bottom"><span>© {new Date().getFullYear()} Yorven Technologies</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div></div>
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
  return <div className="service-list" ref={listRef}>{services.map((service, i) => <ServiceRow key={service.number} service={service} open={active === i} onToggle={() => setActive(active === i ? null : i)} />)}</div>
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
  </div>
}




function ServiceRow({ service, open, onToggle }) {
  const Icon = service.icon
  const articleRef = useRef(null)
  const triggerRef = useRef(null)
  const detailRef = useRef(null)
  const innerRef = useRef(null)
  const canvasRef = useRef(null)
  const timelineRef = useRef(null)
  const [built, setBuilt] = useState(false)

  const detailId = `service-detail-${service.number}`

  // 1) Make room: the card grows downward (same height animation as before).
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

    // 2) Build it: dust pours out of the compact card, and the real card is revealed
  //    row by row, right behind the dust, as it lands.
  useLayoutEffect(() => {
    const inner = innerRef.current

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
    reveal(0) // nothing of the card exists yet

    const PAD = 48
    const art = articleRef.current.getBoundingClientRect()
    const trigger = triggerRef.current.getBoundingClientRect()
    const box = inner.getBoundingClientRect() // natural size even while the card is still growing
    const rel = (r) => ({ x: r.left - art.left + PAD, y: r.top - art.top + PAD, w: r.width, h: r.height })
    const width = art.width + PAD * 2
    const height = box.bottom - art.top + PAD * 2
    const canvas = canvasRef.current
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
  
  return (
    <article
      ref={articleRef}
      className={`service-row stagger-reveal ${open ? 'active' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="service-trigger"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="service-number">{service.number}</span>

        <Icon className="service-icon" size={27} strokeWidth={1.5} />

        <span className="service-main">
          <strong>{service.title}</strong>
          <span>{service.text}</span>
        </span>

        <span className="service-tags">
          {service.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </span>

        <ChevronDown className="row-arrow" size={22} />
      </button>

      <div
        id={detailId}
        ref={detailRef}
        className="service-detail"
        aria-hidden={!open}
        style={{ height: 0, overflow: 'hidden' }}
      >
        <div ref={innerRef} className={`service-detail-inner ${built ? 'is-built' : ''}`}>
          <p>
            <b>Deliverables</b>
            {service.deliverables}
          </p>

          <p>
            <b>Typical timeline</b>
            {service.timeline}
          </p>

          <p>
            <b>Technology</b>
            {service.tech}
          </p>
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
            <div className="ledger-cell-main">
              <strong>Apex Logistics Ltd</strong>
              <small>INV-2026-041</small>
            </div>
            <div className="ledger-cell-amount">$8,500</div>
            <div className="ledger-pill overdue">16d Overdue</div>
          </div>
          <div className="ledger-row">
            <div className="ledger-cell-main">
              <strong>Kinetix Cloud Corp</strong>
              <small>INV-2026-039</small>
            </div>
            <div className="ledger-cell-amount">$14,200</div>
            <div className="ledger-pill pending">Due in 3d</div>
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
            <img
              src="/projects/racers-vault/pagani-huayra-spot.jpg"
              alt="Pagani Huayra BC"
              className="racers-screen-main"
            />
            <img
              src="/projects/racers-vault/porsche-gt3r-grello.jpg"
              alt="Porsche 911 GT3 R Grello"
              className="racers-screen-alt"
            />
          </div>
        </div>
      </div>
    )
  }

  if (item.slug === 'aurix') {
    return (
      <div className="aurix-mockup" aria-hidden="true">
        <div className="aurix-embed-frame">
          <img src="/projects/aurix/aurix-spin-complete.png" alt="Aurix Spin Complete" className="aurix-screen-main" />
          <img src="/projects/aurix/aurix-champion-signal.png" alt="Aurix Champion Signal" className="aurix-screen-alt" />
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
        <div className={'work-visual ' + item.className}>
          <div className="visual-content">
            <WorkVisualContent item={item} />
          </div>
        </div>
        <div className="work-meta">
          <div>
            <h3>{item.title}</h3>
            <p>{item.type}</p>
          </div>
          <span className="work-arrow"><ArrowUpRight size={18} /></span>
        </div>
      </article>
    </Link>
  )
}

function Work() { 
  return (
    <PageShell eyebrow="Selected work" title={<>Products & platforms<br /><span>engineered to scale</span></>}>
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
              <img src={active.src} alt={active.name} className="phone-screen-render" />
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

          <h3 className="telemetry-headline">{active.name}</h3>
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
              <img src={s.src} alt={s.name} />
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
                <img src="/projects/aurix/aurix-flame-avatar.png" alt="Aurix" className="df-bot-avatar-img" />
              </div>
              <div className="df-message-content">
                <div className="df-message-header">
                  <strong>Aurix</strong>
                  <span className="df-app-badge">APP</span>
                  <span className="df-timestamp">Today at 1:05 PM</span>
                </div>
                <div className="df-embed-image-box">
                  <img src={active.src} alt={active.name} className="df-embed-img" />
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

          <h3 className="telemetry-headline">{active.name}</h3>
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
              <img src={s.src} alt={s.name} />
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
          <img
            src="/projects/payper-ai-live.png"
            alt="ProofPay Live Application (proofpay.ai)"
            className="cs-browser-live-img"
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

function CaseStudy() { 
  const { slug } = useParams(); 
  const item = work.find((project) => project.slug === slug); 
  if (!item) {
    return (
      <PageShell eyebrow="404" title={<>Product not<br /><span>found</span></>}>
        <Link className="button button-lime" to="/work">Back to work <ArrowUpRight size={17} /></Link>
      </PageShell>
    );
  }

  const currentIndex = work.findIndex((p) => p.slug === slug);
  const nextItem = work[(currentIndex + 1) % work.length];

  return (
    <article className="cs-editorial-page container">
      {/* 1. Calm Editorial Header */}
      <header className="cs-editorial-header">
        <Link to="/work" className="cs-back-link">
          <ArrowLeft size={16} /> <span>Back to selected work</span>
        </Link>

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
      </section>

      {/* 3. Editorial Story: Problem & Engineering */}
      <section className="cs-editorial-story">
        <div className="cs-story-grid">
          <div className="cs-story-col">
            <span className="cs-story-num">01 / THE CHALLENGE</span>
            <h3>The Opportunity & Problem</h3>
            <p>{item.problem}</p>
          </div>

          <div className="cs-story-col">
            <span className="cs-story-num">02 / THE ARCHITECTURE</span>
            <h3>How Yorven Engineered It</h3>
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
      const success = await dispatchLead({ ...formData })
      if (!success) {
        throw new Error('Lead dispatch failed')
      }
      setSent(true)
    } catch (submissionError) {
      console.error(submissionError)
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
            <p className="eyebrow">Phone</p>
            <a href="tel:+916289853585">+91 62898 53585 <ArrowUpRight size={15} /></a>
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
                    <label>
                      Full name *
                      <input
                        required
                        name="name"
                        autoComplete="name"
                        placeholder="e.g. Sarah Jenkins"
                        value={formData.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        autoFocus
                      />
                    </label>
                    <label>
                      Business name
                      <input
                        name="business"
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
                    <label>
                      Work email address *
                      <input
                        required
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="sarah@acmelabs.com"
                        value={formData.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        autoFocus
                      />
                    </label>
                    <label>
                      Project type *
                      <select
                        required
                        name="type"
                        value={formData.type}
                        onChange={(e) => updateField('type', e.target.value)}
                      >
                        <option value="" disabled>Select project type</option>
                        <option>Website / Marketing Platform</option>
                        <option>Web Application / SaaS MVP</option>
                        <option>Mobile Application (iOS & Android)</option>
                        <option>Systems & Custom Infrastructure</option>
                        <option>Something else</option>
                      </select>
                    </label>
                    <label>
                      Budget range (USD) *
                      <select
                        required
                        name="budget"
                        value={formData.budget}
                        onChange={(e) => updateField('budget', e.target.value)}
                      >
                        <option value="" disabled>Select USD budget range</option>
                        <option>Under $5,000</option>
                        <option>$5,000 – $15,000</option>
                        <option>$15,000 – $30,000</option>
                        <option>$30,000 – $50,000+</option>
                        <option>Prefer to discuss</option>
                      </select>
                    </label>
                    <label>
                      Target launch timeline *
                      <select
                        required
                        name="timeline"
                        value={formData.timeline}
                        onChange={(e) => updateField('timeline', e.target.value)}
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
                    <label className="full">
                      Project description *
                      <textarea
                        required
                        name="description"
                        rows="5"
                        placeholder="Tell us what you're looking to build, any technical preferences, key features, or benchmark products you admire..."
                        value={formData.description}
                        onChange={(e) => updateField('description', e.target.value)}
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

              {error && <p className="form-error" role="alert" aria-live="polite">{error}</p>}

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

function Legal({ title, type }) { return <PageShell eyebrow="Yorven Technologies" title={title}><div className="legal-copy"><p className="todo-label">TODO — legal review required</p><h2>{type === 'privacy' ? 'Privacy policy structure' : 'Terms of use structure'}</h2><p>This page is a placeholder for approved legal text. No legal claims or policy terms have been invented here.</p><h3>To be completed</h3><ul><li>Approved {type} text</li><li>Data, jurisdiction and contact details supplied by Yorven</li><li>Final review before launch</li></ul></div></PageShell> }
function App() {
  useEffect(() => {
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
        const target = document.querySelector(window.location.hash)
        if (target) lenis.scrollTo(target, { offset: -96, duration: 1.2 })
      }, 200)
    }

    return () => {
      window.__lenis = null
      gsap.ticker.remove(tickerCallback)
      lenis.destroy()
    }
  }, [])

  return (
    <BrowserRouter>
      <ScrollToTop />
      <DocumentMeta />
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Navigate to="/#services" replace />} />
          <Route path="/work" element={<Work />} />
          <Route path="/work/:slug" element={<CaseStudy />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Legal title="Privacy policy" type="privacy" />} />
          <Route path="/terms" element={<Legal title="Terms of use" type="terms" />} />
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
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
