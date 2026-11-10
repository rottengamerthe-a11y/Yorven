import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Users,
  Tv,
  FileCheck,
  BookOpen,
  HelpCircle
} from 'lucide-react'
import { HERO, PROOF, PROBLEM, SOLUTION, HOW, FAQ, CTA } from './content'
import { modernClasses } from '../data/site'
import { SafeImage } from '../components/ui/SafeImage'
import './landing.css'

/* ---------- helpers ---------- */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function motionReduced() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  const mode = document.documentElement?.dataset?.motion
  if (mode === 'reduced') return true
  if (mode === 'full') return false
  return window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
}

function useCountUp(target) {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (motionReduced()) {
      from.current = target
      setShown(target)
      return undefined
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 450)
      const value = a + (target - a) * (1 - Math.pow(1 - t, 3))
      from.current = value
      setShown(value)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return shown
}

function Heading({ lines, className = '' }) {
  return <h2 className={`masked-heading ${className}`}>{lines.map((line, i) => <span key={line} className={i === 1 ? 'serif-line' : undefined}>{line}</span>)}</h2>
}

/* ---------- 1. HERO ---------- */

export function Hero() {
  const heroLines = HERO.lines
  const perLine = Math.max(...heroLines.map((l) => l.length))
  return <section className="lp-hero-wrap" data-theme="teal">
    <div className="lp-sky" aria-hidden="true">
      <div className="lp-sky-glow" />
      <div className="lp-clouds lp-clouds-far"><div className="lp-cloud-plane"><div className="lp-cloud-tex" /></div></div>
      <div className="lp-clouds lp-clouds-near"><div className="lp-cloud-plane"><div className="lp-cloud-tex" /></div></div>
    </div>
    <div className="hero lp-hero container scroll-reveal is-visible">
      <div className="hero-copy reveal">
        <h1 aria-label={heroLines.map((l) => l.join(' ')).join(' ')}>
          {heroLines.map((line, lineIndex) => <span className="hero-line" key={lineIndex}>
            {line.map((word, wordIndex) => <React.Fragment key={word}>
              {word === HERO.highlight
                ? <em className="hero-word word-deserves" style={{ '--word-index': lineIndex * perLine + wordIndex }}>{word}<span className="headline-mark" aria-hidden="true"><svg viewBox="0 0 180 24" role="presentation"><path d="M4 17 C 42 5, 85 23, 176 7" /></svg></span></em>
                : <span className="hero-word" style={{ '--word-index': lineIndex * perLine + wordIndex }}>{word}</span>}
              {wordIndex < line.length - 1 ? ' ' : ''}
            </React.Fragment>)}
            {lineIndex === heroLines.length - 1 && <span className="lime">.</span>}
          </span>)}
        </h1>
        <p className="lede">{HERO.lede}</p>
        <div className="hero-actions">
          <Link className="button button-lime" to={HERO.primary.to}>{HERO.primary.label} <ArrowUpRight size={17} /></Link>
          <a className="text-link" href={HERO.secondary.href}>{HERO.secondary.label} <ArrowDownRight size={17} /></a>
        </div>
        <ul className="lp-trust" aria-label="What you can count on">
          {HERO.trust.map((item) => <li key={item}><Check size={15} strokeWidth={2.5} />{item}</li>)}
        </ul>
      </div>
      <div className="hero-art reveal" aria-label="Real digital products engineered by Yorven">
        <div className="hero-canvas-grid" aria-hidden="true" />

        {/* 1. Desktop Dashboard: ProofPay (PayperAI) */}
        <div className="hero-card hero-card-desktop">
          <div className="h-card-bar">
            <span className="dot dot-teal" />
            <span className="dot dot-teal" />
            <span className="dot dot-teal" />
            <span className="h-bar-url">proofpay.ai</span>
            <span className="h-bar-badge">Live System</span>
          </div>
          <div className="h-desktop-content">
            <div className="h-desktop-kpis">
              <div className="h-dkpi">
                <small>OUTSTANDING</small>
                <strong>$34,500</strong>
              </div>
              <div className="h-dkpi">
                <small>AUTO-RECOVERED</small>
                <strong className="text-green">$104,200</strong>
              </div>
            </div>
            <div className="h-desktop-rows">
              <div className="h-drow alert">
                <div className="h-drow-meta">
                  <b>Apex Logistics Ltd</b>
                  <small>INV-041 · 16d overdue</small>
                </div>
                <span className="h-drow-amt">$8,500</span>
              </div>
              <div className="h-drow">
                <div className="h-drow-meta">
                  <b>Kinetix Cloud Corp</b>
                  <small>INV-039 · Due in 3d</small>
                </div>
                <span className="h-drow-amt">$14,200</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Mobile Device: Racers Vault (Porsche 911 GT3 R Grello) */}
        <div className="hero-card hero-card-phone">
          <div className="h-phone-notch"><span /></div>
          <div className="h-phone-screen">
            <SafeImage
              src="/projects/racers-vault/porsche-gt3r-grello.webp"
              alt="Porsche 911 GT3 R Grello in Racers Vault"
              className="h-phone-img"
              width="576"
              height="930"
              aspectRatio="576 / 930"
            />
          </div>
        </div>

        {/* 3. Bot Platform: Aurix Discord Engine (Replaces bottom-left panel) */}
        <div className="hero-panel panel-aurix">
          <div className="h-bot-id">
            <div className="h-bot-avatar-wrap">
              <SafeImage
                src="/projects/aurix/aurix-flame-avatar.webp"
                alt="Aurix"
                className="h-bot-avatar-img"
                width="460"
                height="460"
                aspectRatio="1 / 1"
              />
            </div>
            <div className="h-bot-title-row">
              <strong>Aurix</strong>
              <span className="h-bot-app">APP</span>
            </div>
            <span className="h-bot-shards">● 16 Shards</span>
          </div>
          <div className="h-bot-embed">
            <div className="h-embed-title">
              <span className="h-spin-icon">✨</span>
              <b>Spin Complete • SUCCESS</b>
            </div>
            <p className="h-embed-payout">
              Gained <b>154 aura</b> & <b>103 XP</b>
            </p>
            <div className="h-embed-row">
              <span className="h-cmd-pill">/spin</span>
              <span className="h-wallet-note">174,381 aura</span>
            </div>
          </div>
        </div>
      </div>
      <div className="hero-scroll"><span>Scroll to explore</span><div className="scroll-line" /></div>
    </div>
  </section>
}

export function MobileScreenshotCarousel({ screens = [] }) {
  const [activeSlide, setActiveSlide] = useState(0)
  const [hasSwiped, setHasSwiped] = useState(false)
  const carouselRef = useRef(null)

  const handleScroll = (e) => {
    const el = e.currentTarget
    if (!hasSwiped && el.scrollLeft > 5) {
      setHasSwiped(true)
    }

    const center = el.scrollLeft + el.clientWidth / 2
    const items = el.children
    let closestIdx = 0
    let minDistance = Infinity

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemCenter = item.offsetLeft + item.offsetWidth / 2
      const dist = Math.abs(center - itemCenter)
      if (dist < minDistance) {
        minDistance = dist
        closestIdx = i
      }
    }

    if (closestIdx !== activeSlide) {
      setActiveSlide(closestIdx)
    }
  }

  const handleTouch = () => {
    if (!hasSwiped) setHasSwiped(true)
  }

  const scrollToSlide = (idx) => {
    setHasSwiped(true)
    setActiveSlide(idx)
    const el = carouselRef.current
    if (el && el.children[idx]) {
      el.children[idx].scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      })
    }
  }

  return (
    <div className="mc-mobile-scroll-view" role="region" aria-label="Swipeable application screenshots">
      <div
        ref={carouselRef}
        className="mc-scroll-carousel"
        tabIndex={0}
        onScroll={handleScroll}
        onTouchStart={handleTouch}
        onPointerDown={handleTouch}
      >
        {screens.map((screen, idx) => (
          <div key={screen.id || idx} className="mc-scroll-item">
            <div className="mc-scroll-frame">
              <SafeImage
                src={screen.src}
                alt={screen.alt || screen.title}
                className="mc-scroll-img"
                width="576"
                height="1024"
                loading="lazy"
                decoding="async"
                aspectRatio="576 / 1024"
              />
            </div>
            <div className="mc-scroll-caption">
              <strong>{screen.title}</strong>
              <span>{screen.subtitle}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Swipe Hint: single flex row, nowrap, clamp font-size, aria-hidden, hidden after swipe */}
      <div
        className={`mc-carousel-hint ${hasSwiped ? 'is-hidden' : ''}`}
        aria-hidden="true"
      >
        <span className="mc-hint-arrow">←</span>
        <span className="mc-hint-label">Swipe to explore</span>
        <span className="mc-hint-arrow">→</span>
      </div>

      {/* Dot Indicators for current slide */}
      <div className="mc-carousel-dots" role="tablist" aria-label="Screenshot carousel slides">
        {screens.map((screen, idx) => (
          <button
            key={screen.id || idx}
            type="button"
            role="tab"
            aria-selected={idx === activeSlide}
            aria-label={`Slide ${idx + 1} of ${screens.length}: ${screen.title || ''}`}
            className={`mc-carousel-dot ${idx === activeSlide ? 'active' : ''}`}
            onClick={() => scrollToSlide(idx)}
          />
        ))}
      </div>
    </div>
  )
}

export function ModernClassesProofCard() {
  const [activeScreen, setActiveScreen] = useState(0)
  const screens = modernClasses.carouselScreens || []
  const current = screens[activeScreen] || screens[0]

  const nextScreen = () => setActiveScreen((prev) => (prev + 1) % screens.length)
  const prevScreen = () => setActiveScreen((prev) => (prev - 1 + screens.length) % screens.length)

  return (
    <div className="mc-proof-card">
      <div className="mc-hero-grid">
        {/* Left Column: Editorial Info & Action Controls */}
        <div className="mc-hero-editorial">
          <div className="mc-badge-row">
            <span className="mc-badge-neutral">
              <span className="mc-dot" /> Live on Google Play
            </span>
            <span className="mc-badge-neutral">
              Android Application · 2025–2026
            </span>
          </div>

          <h3 className="mc-hero-h1 mc-proof-h1">
            Modern Classes — <span className="mc-lime-accent">a learning app for board &amp; competitive exams</span>
          </h3>

          <p className="mc-hero-intro">
            {modernClasses.subtitle}
          </p>

          <div className="mc-action-row">
            <div className="mc-action-buttons">
              <a
                href={modernClasses.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button button-lime mc-play-btn"
              >
                View on Google Play <ArrowUpRight size={16} />
              </a>
              <Link to="/work/modern-classes" className="mc-secondary-link">
                See how we built it <ArrowUpRight size={14} />
              </Link>
            </div>

            <div className="mc-desktop-qr-card" title="Scan with Android camera to open on Google Play">
              <SafeImage
                src={modernClasses.qrCode || '/projects/modern-classes-qr.svg'}
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
              title="Click to view next screen"
            >
              <div className="mc-phone-viewport">
                {current && (
                  <SafeImage
                    src={current.src}
                    alt={current.alt}
                    className="mc-phone-screen"
                    width="576"
                    height="1024"
                    loading="lazy"
                    aspectRatio="576 / 1024"
                  />
                )}
              </div>
            </div>

            <div className="mc-phone-controls">
              <button
                type="button"
                className="mc-nav-arrow"
                onClick={prevScreen}
                aria-label="Previous screen"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="mc-phone-caption">
                <strong>{current ? current.title : ''}</strong>
                <span>{current ? current.subtitle : ''}</span>
              </div>
              <button
                type="button"
                className="mc-nav-arrow"
                onClick={nextScreen}
                aria-label="Next screen"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Mobile Native Scroll-Snap Carousel (visible only on mobile) */}
          <MobileScreenshotCarousel screens={screens} />
        </div>
      </div>
    </div>
  )
}

/* ---------- 2. SOCIAL PROOF ---------- */

export function Proof({ concepts }) {
  const real = PROOF.filter((p) => !p.sample)
  // Sample entries are a dev-only preview: they never appear in the production build.
  const items = real.length ? real : (import.meta.env.DEV ? PROOF.filter((p) => p.sample) : [])
  if (!items.length && !concepts) return null
  const hasResults = items.length > 0
  const hasQuotes = items.some((p) => p.quote)
  const eyebrow = !hasResults ? 'Proof of craft' : hasQuotes ? 'Results' : 'Shipped work'
  const lines = !hasResults ? ['Concept work that shows', 'how we think and build.'] : hasQuotes ? ['What people got', 'when we built this for them.'] : ['Real projects,', 'built and live.']
  const intro = !hasResults
    ? 'Fictional projects, clearly labelled as concepts, built to the standard we bring to client work.'
    : hasQuotes ? 'Real projects, real outcomes, in our clients’ own words.' : 'Not concepts: products we designed, built and published.'
  return <section id="proof" className="section lp-section lp-dark scroll-reveal" data-theme="teal">
    <div className="container">
      <div className="section-heading">
        <div><p className="eyebrow">{eyebrow}</p><Heading lines={lines} /></div>
        <p className="section-intro">{intro}</p>
      </div>
      {hasResults && <ModernClassesProofCard />}
      {concepts && <div id="featured-products" className={`lp-concepts ${hasResults ? 'lp-concepts-after' : ''}`}>
        {hasResults && <p className="eyebrow">Featured Products &amp; Platforms</p>}
        <div className="work-grid">{concepts}</div>
      </div>}
    </div>
  </section>
}

/* ---------- 3. PROBLEM ---------- */

function CostOfDelay() {
  const c = PROBLEM.calc
  const [value, setValue] = useState(10000)
  const [months, setMonths] = useState(3)
  const shown = useCountUp(value * months)
  return <div className="lp-calc stagger-reveal">
    <div className="lp-calc-inputs">
      <p className="eyebrow">{c.title}</p>
      <label htmlFor="lp-value">{c.valueLabel}<output>{usd.format(value)} / month</output></label>
      <input id="lp-value" className="lp-range" type="range" min="1000" max="50000" step="1000" value={value} onChange={(e) => setValue(Number(e.target.value))} />
      <label htmlFor="lp-months">{c.monthsLabel}<output>{months} {months === 1 ? 'month' : 'months'}</output></label>
      <input id="lp-months" className="lp-range" type="range" min="1" max="12" step="1" value={months} onChange={(e) => setMonths(Number(e.target.value))} />
    </div>
    <div className="lp-calc-result" aria-live="polite">
      <span className="lp-calc-number">{usd.format(Math.round(shown))}</span>
      <span className="lp-calc-label">{c.resultLabel}</span>
      <p>{c.footnote}</p>
    </div>
  </div>
}

export function Problem() {
  return <section id="problem" className="section lp-section lp-light scroll-reveal" data-theme="cream">
    <div className="container">
      <div className="section-heading">
        <div><p className="eyebrow">{PROBLEM.eyebrow}</p><Heading lines={PROBLEM.title} /></div>
        <p className="section-intro">{PROBLEM.intro}</p>
      </div>
      <div className="lp-grid lp-pain-grid">
        {PROBLEM.pains.map((pain, i) => <article className="lp-card lp-pain stagger-reveal" style={{ '--i': i }} key={pain.quote}>
          <p className="lp-pain-quote">{pain.quote}</p>
          <p className="lp-pain-cost"><b>The cost</b>{pain.cost}</p>
        </article>)}
      </div>
      <CostOfDelay />
    </div>
  </section>
}

/* ---------- 4. SOLUTION ---------- */

function Visual({ name }) {
  const t = (x, y, s) => <text x={x} y={y} className="v-text">{s}</text>
  switch (name) {
    case 'quote':
      return <svg viewBox="0 0 260 150" aria-hidden="true" className="lp-vis">
        <rect x="42" y="14" width="176" height="122" rx="3" className="v-panel" />
        <rect x="58" y="30" width="64" height="6" className="v-dim" /><rect x="168" y="30" width="34" height="6" className="v-line v-anim" style={{ '--d': '0s' }} />
        <rect x="58" y="50" width="86" height="6" className="v-dim" /><rect x="168" y="50" width="34" height="6" className="v-line v-anim" style={{ '--d': '.15s' }} />
        <rect x="58" y="70" width="52" height="6" className="v-dim" /><rect x="168" y="70" width="34" height="6" className="v-line v-anim" style={{ '--d': '.3s' }} />
        <line x1="58" y1="92" x2="202" y2="92" className="v-rule" />
        {t(58, 116, 'FIXED TOTAL')}
        <rect x="156" y="104" width="46" height="16" className="v-total v-anim" style={{ '--d': '.5s' }} />
        <path d="M193 22 v-5 a5 5 0 0 1 10 0 v5 M190 22 h16 v11 h-16 z" className="v-stroke v-lock" transform="translate(-4 -8)" />
      </svg>
    case 'weekly':
      return <svg viewBox="0 0 260 150" aria-hidden="true" className="lp-vis">
        {[0, 1, 2, 3].map((i) => <g key={i}>
          <rect x={42 + i * 48} y="24" width="32" height="88" className="v-panel" />
          <rect x={42 + i * 48} y={112 - (28 + i * 20)} width="32" height={28 + i * 20} className="v-line v-grow v-anim" style={{ '--d': `${i * 0.18}s` }} />
          {t(48 + i * 48, 132, `WK ${i + 1}`)}
        </g>)}
        <path d="M54 14 l5 5 l9 -10" pathLength="1" className="v-stroke v-draw v-anim" style={{ '--d': '.9s' }} transform="translate(144 -2)" />
      </svg>
    case 'team':
      return <svg viewBox="0 0 260 150" aria-hidden="true" className="lp-vis">
        {[[44, 30], [216, 30], [44, 120], [216, 120]].map(([x, y], i) => <g key={i}>
          <line x1={x} y1={y} x2="130" y2="75" pathLength="1" className="v-stroke v-draw v-anim" style={{ '--d': `${i * 0.15}s` }} />
          <circle cx={x} cy={y} r="7" className="v-dot" />
        </g>)}
        <circle cx="130" cy="75" r="22" className="v-ring v-pulse" />
        <circle cx="130" cy="75" r="14" className="v-core" />
        {t(30, 14, 'STRATEGY')}{t(196, 14, 'DESIGN')}{t(34, 144, 'BUILD')}{t(204, 144, 'TEST')}
      </svg>
    case 'design':
      return <svg viewBox="0 0 260 150" aria-hidden="true" className="lp-vis">
        <rect x="16" y="26" width="92" height="98" rx="3" className="v-panel" />
        <rect x="26" y="36" width="72" height="12" className="v-dim" />
        <rect x="26" y="56" width="32" height="56" className="v-dim" /><rect x="64" y="56" width="34" height="24" className="v-dim" /><rect x="64" y="86" width="34" height="26" className="v-dim" />
        <path d="M120 75 H146" className="v-stroke v-flow" />
        <path d="M140 68 l8 7 l-8 7" className="v-stroke" />
        <rect x="156" y="26" width="88" height="98" rx="3" className="v-panel" />
        <text x="200" y="86" textAnchor="middle" className="v-code">{'</>'}</text>
      </svg>
    case 'own':
      return <svg viewBox="0 0 260 150" aria-hidden="true" className="lp-vis">
        <circle cx="86" cy="75" r="30" className="v-ring v-spin" />
        <circle cx="86" cy="75" r="20" className="v-stroke" />
        <path d="M78 75 l6 6 l11 -13" pathLength="1" className="v-stroke v-draw v-anim" style={{ '--d': '.3s' }} />
        <path d="M116 75 H206 M184 75 v16 M200 75 v11" className="v-stroke" />
        {t(124, 62, 'YOURS')}
      </svg>
    default:
      return <svg viewBox="0 0 260 150" aria-hidden="true" className="lp-vis">
        <g className="v-rule">{[40, 75, 110].map((y) => <line key={y} x1="16" y1={y} x2="244" y2={y} />)}</g>
        <path d="M16 96 H84 L98 48 L114 124 L128 96 H244" className="v-stroke v-beat" />
        {t(16, 22, 'STEADY UNDER LOAD')}
      </svg>
  }
}

export function Solution({ servicesSlot }) {
  return <section id="solution" className="section lp-section lp-dark scroll-reveal" data-theme="teal">
    <div className="container">
      <div className="section-heading">
        <div><p className="eyebrow">{SOLUTION.eyebrow}</p><Heading lines={SOLUTION.title} /></div>
        <p className="section-intro">{SOLUTION.intro}</p>
      </div>
      <div className="lp-grid lp-feature-grid">
        {SOLUTION.features.map((f, i) => <article className="lp-card lp-feature stagger-reveal" style={{ '--i': i }} key={f.title}>
          <div className="lp-vis-wrap"><Visual name={f.visual} /></div>
          <div className="lp-feature-body">
            <h3>{f.title}</h3>
            <p>{f.text}</p>
            <p className="lp-benefit"><b>You get</b>{f.benefit}</p>
          </div>
        </article>)}
      </div>
      {servicesSlot && <div id="services" className="lp-services">
        <p className="eyebrow">{SOLUTION.servicesEyebrow}</p>
        {servicesSlot}
      </div>}
    </div>
  </section>
}

/* ---------- 5. HOW IT WORKS ---------- */

export function HowItWorks() {
  return <section id="how" className="section lp-section lp-light scroll-reveal" data-theme="cream">
    <div className="container">
      <div className="section-heading">
        <div><p className="eyebrow">{HOW.eyebrow}</p><Heading lines={HOW.title} /></div>
      </div>
      <ol className="lp-grid lp-steps">
        {HOW.steps.map((s, i) => <li className="lp-card lp-step stagger-reveal" style={{ '--i': i }} key={s.n}>
          <span className="lp-step-num">{s.n}</span>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
          <span className="lp-step-tag">{s.tag}</span>
        </li>)}
      </ol>
      <ul className="lp-reassure">{HOW.reassure.map((r) => <li key={r}><Check size={16} strokeWidth={2.5} />{r}</li>)}</ul>
    </div>
  </section>
}

/* ---------- 6. FAQ ---------- */

export function Faq() {
  const [open, setOpen] = useState(0)
  return <section id="faq" className="section lp-section lp-dark scroll-reveal" data-theme="teal">
    <div className="container lp-faq">
      <div className="lp-faq-head"><p className="eyebrow">{FAQ.eyebrow}</p><Heading lines={FAQ.title} /></div>
      <div className="lp-faq-list">
        {FAQ.items.map((item, i) => {
          const isOpen = open === i
          return <div className={`lp-faq-item stagger-reveal ${isOpen ? 'is-open' : ''}`} key={item.q}>
            <h3><button type="button" id={`faq-btn-${i}`} aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? -1 : i)}><span>{item.q}</span><Plus className="lp-faq-icon" size={20} aria-hidden="true" /></button></h3>
            <div id={`faq-${i}`} role="region" aria-labelledby={`faq-btn-${i}`} className="lp-faq-panel"><div><p>{item.a}</p></div></div>
          </div>
        })}
      </div>
    </div>
  </section>
}

/* ---------- 7. FINAL CTA (the footer is rendered by your Layout) ---------- */

export function FinalCta() {
  const whatsapp = import.meta.env.VITE_WHATSAPP_URL
  return <section className="final-cta lp-cta container scroll-reveal" data-theme="cream">
    <div className="cta-grid">
      <p className="eyebrow">Ready when you are</p>
      <div>
        <h2 className="masked-heading cta-heading"><span>{CTA.title[0]}</span><span className="serif-line">{CTA.title[1]}<ArrowUpRight className="cta-heading-arrow" aria-hidden="true" /></span></h2>
        <p className="body-copy">{CTA.text}</p>
        <div className="lp-cta-actions">
          <Link className="button button-green" to={CTA.button.to}>{CTA.button.label} <ArrowUpRight size={17} /></Link>
          {whatsapp && <a className="text-link" href={whatsapp}>Or message us on WhatsApp <ArrowUpRight size={16} /></a>}
        </div>
        <p className="lp-cta-note">{CTA.note}</p>
      </div>
    </div>
  </section>
}
