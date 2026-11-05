import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, Menu, X } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { pageMeta, services, work } from './data/site'
import { assembleParticles } from './components/particleAssemble'
import './styles.css'
import { Hero, Proof, Problem, Solution, HowItWorks, Faq, FinalCta } from './landing/Landing'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

gsap.registerPlugin(ScrollTrigger)

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 0)
    else window.scrollTo(0, 0)
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
          <NavLink to="/#services" onClick={() => setOpen(false)}>Services</NavLink>
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
      <div><p className="eyebrow">Explore</p><Link to="/#services">Services</Link><Link to="/#how">How it works</Link><Link to="/#faq">FAQ</Link><Link to="/work">Work</Link><Link to="/about">About</Link><Link to="/contact">Contact</Link></div>
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
function WorkCard({ item }) {
  return <Link className="work-card parallax-card" to={`/work/${item.slug}`}><div className={`work-visual ${item.className}`}><div className="visual-top"><span>{item.label}</span><span>↗</span></div><div className="visual-content">{item.title === 'Northstar' ? <><div className="mini-chart"><i /><i /><i /><i /><i /><i /></div><strong>Good morning,<br />Maya.</strong></> : item.title === 'Lumen' ? <><div className="phone"><b>$ 4,820.00</b><span>Available balance</span><div className="phone-line" /></div><div className="coin">✦</div></> : <div className="arc-shape"><span>arc</span></div>}</div></div><div className="work-meta"><div><h3>{item.title}</h3><p>{item.type}</p></div><span className="work-arrow"><ArrowUpRight size={18} /></span></div></Link>
}

function Process() {
  const items = [['01', 'Discover', 'Understand the business, the users and the opportunity.', 'A shared brief and clear opportunity map.'], ['02', 'Define', 'Turn the messy middle into a clear, shared direction.', 'A practical product direction and prioritized plan.'], ['03', 'Design', 'Make the experience feel as good as the idea behind it.', 'A tested interface system ready to build.'], ['04', 'Develop', 'Build the dependable, maintainable product underneath.', 'A working product with a clear technical foundation.'], ['05', 'Refine', 'Test, learn and make every detail earn its place.', 'A sharper release shaped by real feedback.'], ['06', 'Launch', 'Ship with confidence and keep improving together.', 'A measured handover and next-step roadmap.']]
  return <section className="process-section section scroll-reveal" data-theme="teal"><div className="container"><div className="section-heading"><div><p className="eyebrow">A considered process</p><h2 className="masked-heading"><span>From first thought</span><span>to final launch.</span></h2></div><p className="section-intro">The path from an idea to a product is rarely a straight line. Our job is to make the next step feel clear.</p></div><div className="process-grid">{items.map(([num, title, text, outcome]) => <div className="process-item stagger-reveal" key={num}><span>{num}</span><h3>{title}</h3><p>{text}</p><small><b>What you get</b>{outcome}</small></div>)}</div></div></section>
}

function Work() { return <PageShell eyebrow="Selected work" title={<>Ideas with<br /><span>somewhere to go</span></>}><p className="page-intro">A selection of concept projects that show how we think, design and build. The work below is fictional and clearly labelled as Concept.</p><div className="work-grid work-page-grid">{work.map((item) => <WorkCard key={item.slug} item={item} />)}</div></PageShell> }
function CaseStudy() { const { slug } = useParams(); const item = work.find((project) => project.slug === slug); if (!item) return <PageShell eyebrow="404" title={<>Project not<br /><span>found</span></>}><Link className="button button-lime" to="/work">Back to work <ArrowUpRight size={17} /></Link></PageShell>; return <PageShell eyebrow={`${item.label} · ${item.type}`} title={item.title}><div className="case-study"><p className="page-intro">{item.description}</p><div className={`case-visual work-visual ${item.className}`}><div className="visual-top"><span>Concept project</span><span>{item.type}</span></div></div><div className="case-grid"><div><p className="eyebrow">The problem</p><p className="body-copy">{item.problem}</p></div><div><p className="eyebrow">The approach</p><p className="body-copy">{item.approach}</p></div></div><div className="case-screens"><p className="eyebrow">Screens explored</p>{item.screens.map((screen) => <span key={screen}>{screen}</span>)}</div><p className="case-stack"><b>Stack</b>{item.stack}</p></div></PageShell> }
function About() { return <PageShell eyebrow="A little about us" title={<>Good work starts<br /><span>with good questions</span></>}><div className="about-layout"><div><p className="page-intro">Yorven is an independent digital product studio for businesses with something meaningful to build.</p><p className="body-copy">We believe technology should make things clearer, not more complicated. That means asking the right questions early, sweating the details and building with enough care that the product can keep up with the people using it.</p></div><div className="principles">{[['01','Clarity over theatre'],['02','Craft in every layer'],['03','Progress, together']].map(([n, t]) => <div key={n}><span>{n}</span><h3>{t}</h3><p>Thoughtful decisions, made visible and shared along the way.</p></div>)}</div></div><section className="trust-todo"><p className="eyebrow">Trust</p><h2>Proof points — <em>TODO.</em></h2><p>We’ll add approved client, partner or delivery facts here when provided.</p></section></PageShell> }
function PageShell({ eyebrow, title, children }) { return <section className="page-shell container"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}</section> }

function Contact() {
  const [sent, setSent] = useState(false); const [error, setError] = useState(''); const [sending, setSending] = useState(false); const successRef = useRef(null)
  useEffect(() => { if (sent) successRef.current?.focus() }, [sent])
  async function submit(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
    if (data.get('website')) return
    if (!data.get('name') || !data.get('email') || !data.get('description') || !data.get('type') || !data.get('budget') || !data.get('timeline')) { setError('Please complete the required fields before sending.'); return }
    setError(''); setSending(true)
    const payload = Object.fromEntries(data); const endpoint = import.meta.env.VITE_CONTACT_ENDPOINT
    try { if (endpoint) { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(`Contact endpoint returned ${response.status}`) } else { window.location.href = `mailto:projects@yorven.in?subject=${encodeURIComponent(`Yorven enquiry from ${payload.name}`)}&body=${encodeURIComponent(payload.description)}` }; setSent(true); form.reset() } catch (submissionError) { console.error(submissionError); setError('We couldn’t send your enquiry. Please email projects@yorven.in instead.') } finally { setSending(false) }
  }
  return <PageShell eyebrow="Start a conversation" title={<>Let's build<br /><span>what's next</span></>}>
    <div className="contact-layout">
      <div><p className="page-intro">Tell us the shape of the idea and we’ll take it from there.</p><div className="contact-detail"><p className="eyebrow">Email</p><a href="mailto:projects@yorven.in">projects@yorven.in <ArrowUpRight size={15} /></a><p className="eyebrow">Phone</p><a href="tel:+916289853585">+91 62898 53585 <ArrowUpRight size={15} /></a></div></div>
      <div className="form-card">
        {sent ? <div className="success" tabIndex="-1" ref={successRef} aria-live="polite"><h2>Thanks for reaching out.</h2><p>Your enquiry is ready to send.</p></div> : <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <label>Full name *<input required name="name" autoComplete="name" /></label>
            <label>Business name<input name="business" autoComplete="organization" /></label>
            <label>Email address *<input required name="email" type="email" autoComplete="email" /></label>
            <label>Project type *<select required name="type" defaultValue=""><option value="" disabled>Select one</option><option>Website</option><option>Web application</option><option>Mobile application</option><option>Something else</option></select></label>
            <label>Budget range *<select required name="budget" defaultValue=""><option value="" disabled>Select INR range</option><option>Under ₹2 lakh</option><option>₹2–5 lakh</option><option>₹5–10 lakh</option><option>₹10 lakh+</option><option>Prefer to discuss</option></select></label>
            <label>Timeline *<select required name="timeline" defaultValue=""><option value="" disabled>Select timeline</option><option>Exploring</option><option>Within 1–2 months</option><option>Within 3–6 months</option><option>Flexible</option></select></label>
            <label className="full">Project description *<textarea required name="description" rows="5" /></label>
            <label className="honeypot" aria-hidden="true">Website<input tabIndex="-1" autoComplete="off" name="website" /></label>
          </div>
          {error && <p className="form-error" role="alert" aria-live="polite">{error}</p>}
          <button className="button button-green" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send enquiry'} <ArrowUpRight size={17} /></button>
          <p className="form-footnote">Required fields are marked *. We’ll only use your details to respond to this enquiry.</p>
        </form>}
      </div>
    </div>
  </PageShell>
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

    lenis.on('scroll', ScrollTrigger.update)

    const tickerCallback = (time) => {
      lenis.raf(time * 1000)
    }

    gsap.ticker.add(tickerCallback)
    gsap.ticker.lagSmoothing(0)

    return () => {
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
