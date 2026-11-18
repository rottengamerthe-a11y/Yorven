import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  ExternalLink,
  Plus,
  Minus,
  Clock,
  Layers,
  Terminal,
  Shield,
  Calendar
} from 'lucide-react'
import {
  HERO,
  SELECTED_WORK,
  PROBLEM,
  HOW_WE_WORK,
  SERVICES,
  WEEK_PLAN,
  FAQ,
  CLOSING
} from './content'
import { SafeImage } from '../components/ui/SafeImage'
import './landing.css'

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

/* ---------- 1. HERO SECTION ---------- */
export function Hero() {
  return (
    <section className="yn-hero-section" aria-label="Introduction">
      <div className="container yn-hero-grid">
        {/* Hero Editorial: Headline, Sub-copy, Single CTA */}
        <div className="yn-hero-copy">
          <h1 className="yn-hero-title">
            {HERO.headline}
          </h1>
          <p className="yn-hero-sub">
            {HERO.subcopy}
          </p>
          <div className="yn-hero-actions">
            <Link to={HERO.primary.to} className="btn-primary">
              {HERO.primary.label} <ArrowUpRight size={16} strokeWidth={1.75} />
            </Link>
            <a href={HERO.secondary.href} className="text-link">
              {HERO.secondary.label} <ArrowDown size={14} strokeWidth={1.75} />
            </a>
          </div>
        </div>

        {/* Hero Visual: Static Glass Sculpture (Corner-matched #000 base, normal blend, no glow) */}
        <div className="yn-hero-sculpture-slot">
          <picture className="yn-sculpture-picture">
            <source media="(max-width: 767px)" srcSet="/sculpture/m/f_001.webp" width="720" height="472" />
            <img
              src="/sculpture/d/f_001.webp"
              alt="Yorven Digital Core Sculpture"
              className="yn-hero-sculpture-img"
              width="1280"
              height="838"
              loading="eager"
              decoding="async"
            />
          </picture>
        </div>
      </div>
    </section>
  )
}

/* ---------- 2. SELECTED WORK (4 Alternating Full-Bleed Blocks) ---------- */
export function SelectedWork() {
  return (
    <section id="work" className="section yn-section yn-work-section" aria-label="Selected work">
      <div className="container">
        <div className="yn-section-header">
          <p className="eyebrow">Selected work</p>
          <h2 className="yn-section-title">Shipped products. Real code in production.</h2>
          <p className="yn-section-desc">
            We partner with founders and product teams to engineer production software with clear scope, fixed price, and full client code ownership.
          </p>
        </div>

        <div className="yn-work-stack">
          {SELECTED_WORK.map((project, idx) => {
            const isReversed = idx % 2 === 1
            return (
              <article
                key={project.slug}
                className={`yn-work-block ${isReversed ? 'is-reversed' : ''}`}
                id={`work-${project.slug}`}
              >
                {/* Visual Media Container with Concentric Radius */}
                <div className="yn-work-media-col">
                  <div className="yn-work-media-viewport">
                    <SafeImage
                      src={project.image}
                      alt={project.imageAlt}
                      className="yn-work-img"
                      width="1200"
                      height="800"
                      loading="lazy"
                      aspectRatio="16 / 10"
                    />
                  </div>
                </div>

                {/* Editorial Details */}
                <div className="yn-work-info-col">
                  <span className="yn-work-role">{project.role}</span>
                  <h3 className="yn-work-title">{project.title}</h3>
                  <p className="yn-work-outcome">{project.outcome}</p>

                  <div className="yn-work-tags" aria-label="Technology stack">
                    {project.stack.map((tag) => (
                      <span key={tag} className="yn-mono-tag">{tag}</span>
                    ))}
                  </div>

                  <div className="yn-work-links">
                    {project.linkType === 'external' ? (
                      <a
                        href={project.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-link"
                      >
                        View live on Google Play <ExternalLink size={14} strokeWidth={1.75} />
                      </a>
                    ) : (
                      <Link to={project.link} className="btn-link">
                        Explore case study <ArrowUpRight size={14} strokeWidth={1.75} />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* Backward compatibility export */
export const Proof = SelectedWork

/* ---------- 3. THE PROBLEM & COST CALCULATOR ---------- */
function CostOfDelay() {
  const c = PROBLEM.calc
  const [value, setValue] = useState(12000)
  const [months, setMonths] = useState(3)

  const lostTotal = value * months

  return (
    <div className="yn-calc-panel" aria-label="Cost of delay interactive calculator">
      <div className="yn-calc-header">
        <span className="eyebrow">Interactive model</span>
        <h3 className="yn-calc-title">{c.title}</h3>
      </div>

      <div className="yn-calc-controls">
        <div className="yn-calc-field">
          <div className="yn-calc-label-row">
            <label htmlFor="yn-val-range">{c.valueLabel}</label>
            <output className="yn-tabular-metric">{usdFormatter.format(value)} / mo</output>
          </div>
          <input
            id="yn-val-range"
            type="range"
            className="yn-range-slider"
            min="2000"
            max="50000"
            step="1000"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </div>

        <div className="yn-calc-field">
          <div className="yn-calc-label-row">
            <label htmlFor="yn-mo-range">{c.monthsLabel}</label>
            <output className="yn-tabular-metric">{months} {months === 1 ? 'month' : 'months'}</output>
          </div>
          <input
            id="yn-mo-range"
            type="range"
            className="yn-range-slider"
            min="1"
            max="12"
            step="1"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="yn-calc-output" aria-live="polite">
        <span className="yn-calc-big-num yn-tabular-metric">{usdFormatter.format(lostTotal)}</span>
        <span className="yn-calc-output-label">{c.resultLabel}</span>
      </div>
    </div>
  )
}

export function Problem() {
  return (
    <section id="problem" className="section yn-section yn-problem-section" aria-label="The problem">
      <div className="container">
        <div className="yn-section-header">
          <p className="eyebrow">{PROBLEM.eyebrow}</p>
          <h2 className="yn-section-title">{PROBLEM.title}</h2>
          <p className="yn-section-desc">{PROBLEM.intro}</p>
        </div>

        <div className="yn-problem-layout">
          {/* Asymmetrical Pain Points Layout (No identical boxes) */}
          <div className="yn-pains-flow">
            {PROBLEM.pains.map((pain) => (
              <div key={pain.title} className="yn-pain-row">
                <span className="yn-pain-headline">{pain.title}</span>
                <blockquote className="yn-pain-quote">{pain.quote}</blockquote>
                <p className="yn-pain-detail">{pain.detail}</p>
              </div>
            ))}
          </div>

          {/* Cost of Delay Interactive Centerpiece */}
          <div className="yn-problem-calc-col">
            <CostOfDelay />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- 4. HOW WE WORK ---------- */
export function HowWeWork() {
  return (
    <section id="how" className="section yn-section yn-how-section" aria-label="How we work">
      <div className="container">
        <div className="yn-section-header">
          <p className="eyebrow">{HOW_WE_WORK.eyebrow}</p>
          <h2 className="yn-section-title">{HOW_WE_WORK.title}</h2>
        </div>

        <div className="yn-how-grid">
          {/* Large Spotlight Feature Card */}
          <div className="yn-how-spotlight">
            <span className="yn-spotlight-pill">Core Guarantee</span>
            <h3 className="yn-spotlight-title">{HOW_WE_WORK.feature.title}</h3>
            <p className="yn-spotlight-desc">{HOW_WE_WORK.feature.desc}</p>
          </div>

          {/* Compact 3-Item List (No 6 identical cards, no "You get" tags) */}
          <div className="yn-how-list">
            {HOW_WE_WORK.principles.map((p, idx) => (
              <div key={p.title} className="yn-how-item">
                <div className="yn-how-item-header">
                  <span className="yn-how-num">0{idx + 1}</span>
                  <h4>{p.title}</h4>
                </div>
                <p>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* Backward compatibility export */
export const Solution = HowWeWork
export const HowItWorks = HowWeWork

/* ---------- 5. SERVICES (Websites, Digital products, Systems & scale) ---------- */
export function ServicesSection() {
  return (
    <section id="services" className="section yn-section yn-services-section" aria-label="Services">
      <div className="container">
        <div className="yn-section-header">
          <p className="eyebrow">Disciplines</p>
          <h2 className="yn-section-title">Three engineering disciplines. One accountable studio.</h2>
          <p className="yn-section-desc">
            We do not farm out code to junior contractors. You communicate directly with senior software engineers delivering working software every week.
          </p>
        </div>

        <div className="yn-services-grid">
          {SERVICES.map((svc) => (
            <article key={svc.slug} className="yn-service-card">
              <div className="yn-service-visual">
                <SafeImage
                  src={svc.videoPoster}
                  alt={`${svc.title} preview`}
                  className="yn-service-poster"
                  width="720"
                  height="450"
                  loading="lazy"
                  aspectRatio="16 / 10"
                />
              </div>

              <div className="yn-service-body">
                <div className="yn-service-meta-row">
                  <span className="yn-service-time">
                    <Clock size={13} strokeWidth={1.75} /> {svc.timeline}
                  </span>
                </div>
                <h3 className="yn-service-name">{svc.title}</h3>
                <p className="yn-service-tagline">{svc.tagline}</p>

                <ul className="yn-service-checklist">
                  {svc.deliverables.map((item) => (
                    <li key={item}>
                      <Check size={14} strokeWidth={2} className="yn-check-icon" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <Link to={svc.link} className="btn-link">
                  View {svc.title.toLowerCase()} capabilities <ArrowUpRight size={14} strokeWidth={1.75} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- 6. WEEK-BY-WEEK PLAN ---------- */
export function WeekPlanSection() {
  return (
    <section id="plan" className="section yn-section yn-plan-section" aria-label="Week by week plan">
      <div className="container">
        <div className="yn-section-header">
          <p className="eyebrow">{WEEK_PLAN.eyebrow}</p>
          <h2 className="yn-section-title">{WEEK_PLAN.title}</h2>
          <p className="yn-section-desc">
            Derived from our verified delivery timelines: Websites (4–8 weeks), Digital products (8–16 weeks), and Systems & scale (6–12 weeks).
          </p>
        </div>

        <div className="yn-plan-timeline">
          {WEEK_PLAN.stages.map((stage) => (
            <div key={stage.period} className="yn-plan-row">
              <div className="yn-plan-period-col">
                <span className="yn-period-badge">
                  <Calendar size={13} strokeWidth={1.75} /> {stage.period}
                </span>
              </div>
              <div className="yn-plan-content-col">
                <h4 className="yn-plan-stage-title">{stage.title}</h4>
                <p className="yn-plan-deliverable">{stage.deliverable}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- 7. FAQ ACCORDION ---------- */
export function Faq() {
  const [openIdx, setOpenIdx] = useState(0)

  return (
    <section id="faq" className="section yn-section yn-faq-section" aria-label="Frequently asked questions">
      <div className="container yn-faq-container">
        <div className="yn-section-header">
          <p className="eyebrow">{FAQ.eyebrow}</p>
          <h2 className="yn-section-title">{FAQ.title}</h2>
        </div>

        <div className="yn-faq-list" role="region" aria-label="Accordion items">
          {FAQ.items.map((item, idx) => {
            const isOpen = openIdx === idx
            return (
              <div key={item.q} className={`yn-faq-item ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="yn-faq-trigger"
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${idx}`}
                  id={`faq-question-${idx}`}
                  onClick={() => setOpenIdx(isOpen ? -1 : idx)}
                >
                  <span className="yn-faq-question-text">{item.q}</span>
                  <span className="yn-faq-icon-wrapper" aria-hidden="true">
                    {isOpen ? (
                      <Minus size={18} strokeWidth={1.75} />
                    ) : (
                      <Plus size={18} strokeWidth={1.75} />
                    )}
                  </span>
                </button>
                <div
                  id={`faq-answer-${idx}`}
                  role="region"
                  aria-labelledby={`faq-question-${idx}`}
                  className="yn-faq-content"
                  style={{ display: isOpen ? 'block' : 'none' }}
                >
                  <p>{item.a}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------- 8. CLOSING SECTION ---------- */
export function ClosingCta() {
  return (
    <section className="section yn-closing-section" aria-label="Closing invitation">
      <div className="yn-closing-grid-texture" aria-hidden="true" />
      <div className="container yn-closing-inner">
        <h2 className="yn-closing-headline">{CLOSING.headline}</h2>
        <p className="yn-closing-subcopy">{CLOSING.subcopy}</p>
        <div className="yn-closing-actions">
          <Link to={CLOSING.primary.to} className="btn-primary">
            {CLOSING.primary.label} <ArrowUpRight size={16} strokeWidth={1.75} />
          </Link>
        </div>
      </div>
    </section>
  )
}

/* Backward compatibility export */
export const FinalCta = ClosingCta

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
              <img
                src={screen.src}
                alt={screen.alt || screen.title}
                className="mc-scroll-img"
                width="576"
                height="1024"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="mc-scroll-caption">
              <strong>{screen.title}</strong>
              <span>{screen.subtitle}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
