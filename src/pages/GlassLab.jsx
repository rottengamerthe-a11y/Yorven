import React, { useState, useEffect } from 'react'
import { LiquidGlass } from '../components/LiquidGlass'
import '../components/liquid-glass.css'

export default function GlassLab() {
  const [forcedMode, setForcedMode] = useState('auto') // 'auto' | 'refract' | 'frost' | 'reduced'

  useEffect(() => {
    if (forcedMode === 'auto') {
      const isChromium = /Chrome|Chromium|Edg/.test(navigator.userAgent) && !/Safari/.test(navigator.userAgent)
      document.documentElement.setAttribute('data-glass', isChromium ? 'refract' : 'frost')
    } else if (forcedMode === 'refract') {
      document.documentElement.setAttribute('data-glass', 'refract')
    } else if (forcedMode === 'frost') {
      document.documentElement.setAttribute('data-glass', 'frost')
    }
  }, [forcedMode])

  return (
    <div className="glass-lab-page" style={{ minHeight: '100vh', padding: '120px 24px 80px', color: 'var(--text-strong)' }}>
      {/* 1. Header & Engine Mode Controller */}
      <div className="container" style={{ maxWidth: '1200px', margin: '0 auto 48px' }}>
        <p className="eyebrow" style={{ color: 'var(--accent-text)', marginBottom: '8px' }}>Experimental Optics</p>
        <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 3.8rem)', fontWeight: 800, letterSpacing: '-0.04em', margin: '0 0 16px' }}>
          Real Liquid Glass Lab
        </h1>
        <p style={{ fontSize: '18px', color: 'var(--text-body)', maxWidth: '65ch', lineHeight: 1.6, margin: '0 0 24px' }}>
          Authentic SVG displacement refraction (Chromium) alongside universal frosted blur fallbacks (Safari, Firefox, Mobile).
        </p>

        {/* Engine Mode Toggle Bar */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '14px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Simulate Browser Engine:
          </span>
          <button
            type="button"
            onClick={() => setForcedMode('auto')}
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              border: '1px solid',
              borderColor: forcedMode === 'auto' ? 'var(--lime)' : 'rgba(255,255,255,0.15)',
              background: forcedMode === 'auto' ? 'rgba(215,237,131,0.15)' : 'transparent',
              color: forcedMode === 'auto' ? 'var(--lime)' : 'var(--text-body)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            Auto Detect
          </button>
          <button
            type="button"
            onClick={() => setForcedMode('refract')}
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              border: '1px solid',
              borderColor: forcedMode === 'refract' ? '#38d9d2' : 'rgba(255,255,255,0.15)',
              background: forcedMode === 'refract' ? 'rgba(56,217,210,0.15)' : 'transparent',
              color: forcedMode === 'refract' ? '#38d9d2' : 'var(--text-body)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            Chrome / Edge (Real Refraction)
          </button>
          <button
            type="button"
            onClick={() => setForcedMode('frost')}
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              border: '1px solid',
              borderColor: forcedMode === 'frost' ? '#a78bfa' : 'rgba(255,255,255,0.15)',
              background: forcedMode === 'frost' ? 'rgba(167,139,250,0.15)' : 'transparent',
              color: forcedMode === 'frost' ? '#a78bfa' : 'var(--text-body)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            Safari / WebKit &amp; Firefox (Frosted Fallback)
          </button>
        </div>
      </div>

      {/* 2. DARK SURFACE SHOWCASE (#0A1210) */}
      <div className="container" style={{ maxWidth: '1200px', margin: '0 auto 80px' }} data-theme="dark">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Dark Surface Environment (#0A1210)</h2>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Over high-contrast background typography &amp; chromatic glows</span>
        </div>

        {/* Detailed background test canvas */}
        <div
          style={{
            position: 'relative',
            borderRadius: '24px',
            padding: '48px 36px',
            overflow: 'hidden',
            background: '#0a1210',
            border: '1px solid rgba(255,255,255,0.08)',
            minHeight: '520px'
          }}
        >
          {/* Detailed background items to refract */}
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none', zIndex: 0 }}>
            {/* Chromatic Glows */}
            <div style={{ position: 'absolute', top: '-10%', left: '15%', width: '380px', height: '380px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(10,210,160,0.22) 0%, transparent 70%)', filter: 'blur(40px)' }} />
            <div style={{ position: 'absolute', bottom: '-5%', right: '10%', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(138,147,240,0.24) 0%, transparent 70%)', filter: 'blur(50px)' }} />
            <div style={{ position: 'absolute', top: '40%', right: '35%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(215,237,131,0.18) 0%, transparent 70%)', filter: 'blur(35px)' }} />

            {/* High-density typography background for optical bending rendered as SVG graphic */}
            <svg aria-hidden="true" role="img" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18, pointerEvents: 'none' }}>
              <text x="20" y="40" fontFamily="monospace" fontSize="14" fill="#ffffff">01001001 01001110 01010100 01000101 01010010 01000001 01000011 01010100 01001001 01010110</text>
              <text x="20" y="80" fontFamily="sans-serif" fontSize="28" fontWeight="900" fill="#ffffff">YORVEN DIGITAL STUDIO CRAFT OPTICAL REFRACTION</text>
              <text x="20" y="120" fontFamily="monospace" fontSize="14" fill="#ffffff">PHYSICAL DISPLACEMENT MAP // SNELLS LAW // CHROMATIC PRISM FRINGE</text>
              <text x="20" y="160" fontFamily="sans-serif" fontSize="22" fontWeight="bold" fill="#ffffff">01 AURIX // 02 RACER'S VAULT // 03 PROOFPAY // 04 MODERN CLASSES</text>
              <text x="20" y="200" fontFamily="monospace" fontSize="14" fill="#ffffff">FEIMAGE DISPLACEMENT MAP GENERATOR // COLOR INTERPOLATION FILTERS SRGB</text>
              <text x="20" y="240" fontFamily="sans-serif" fontSize="28" fontWeight="900" fill="#d7ed83">ENGINEERED WITH RIGOROUS WCAG AA/AAA CONTRAST</text>
            </svg>
          </div>

          {/* Interactive Liquid Glass Components (Z-index 2) */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Row 1: Buttons & Pills (Refract vs Frost) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
              {/* Refract Button & Pill */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#38d9d2', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Variant: Refract (Chromium)
                </span>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <LiquidGlass variant="refract" shape="btn" className="glass-btn-demo">
                    <span style={{ fontWeight: 600 }}>Refractive Button</span>
                  </LiquidGlass>
                  <LiquidGlass variant="refract" shape="pill">
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Refract Pill</span>
                  </LiquidGlass>
                </div>
              </div>

              {/* Frost Button & Pill */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Variant: Frost (Safari / Firefox)
                </span>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <LiquidGlass variant="frost" shape="btn" className="glass-btn-demo">
                    <span style={{ fontWeight: 600 }}>Frosted Button</span>
                  </LiquidGlass>
                  <LiquidGlass variant="frost" shape="pill">
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Frosted Pill</span>
                  </LiquidGlass>
                </div>
              </div>
            </div>

            {/* Row 2: Metadata Info Bar (Refract vs Frost) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              <div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#38d9d2', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                  Metadata Bar (Refract)
                </span>
                <LiquidGlass variant="refract" shape="bar" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Role</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>Lead Engineering</strong>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Stack</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>React · WebGL · SVG</strong>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Timeline</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>6 Weeks</strong>
                  </div>
                </LiquidGlass>
              </div>

              <div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                  Metadata Bar (Frost)
                </span>
                <LiquidGlass variant="frost" shape="bar" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Role</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>Lead Engineering</strong>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Stack</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>React · WebGL · SVG</strong>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Timeline</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-strong)' }}>6 Weeks</strong>
                  </div>
                </LiquidGlass>
              </div>
            </div>

            {/* Row 3: Large Cards (Refract vs Frost) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              <LiquidGlass variant="refract" shape="card" style={{ minHeight: '220px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#38d9d2', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  01 / Optical Refraction Card
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px', color: 'var(--text-strong)' }}>
                  Physical Lens Curvature
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>
                  Observe how the background typography directly behind the outer edges of this panel physically bends and distorts with chromatic dispersion. The center remains crisp and readable.
                </p>
              </LiquidGlass>

              <LiquidGlass variant="frost" shape="card" style={{ minHeight: '220px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  02 / Universal Frosted Card
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px', color: 'var(--text-strong)' }}>
                  Calibrated Frost &amp; Specular
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>
                  Crafted for Safari, iOS, and Firefox with high-fidelity blur, chromatic saturation boost (1.6x), and identical CSS specular highlights and edge gradients.
                </p>
              </LiquidGlass>
            </div>
          </div>
        </div>
      </div>

      {/* 3. LIGHT SURFACE SHOWCASE (#F4F0E6) */}
      <div className="container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#F4F7F6' }}>
            Light Surface Environment (Cream #F4F0E6)
          </h2>
          <span style={{ fontSize: '13px', color: 'rgba(244, 247, 246, 0.68)' }}>WCAG AAA compliant tokens with white-tint refractive glass</span>
        </div>

        {/* Cream background test canvas */}
        <div
          className="surface-light"
          data-theme="light"
          style={{
            position: 'relative',
            borderRadius: '24px',
            padding: '48px 36px',
            overflow: 'hidden',
            background: '#F4F0E6',
            border: '1px solid rgba(20,32,28,0.12)',
            minHeight: '520px'
          }}
        >
          {/* Detailed background items */}
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none', zIndex: 0 }}>
            <div style={{ position: 'absolute', top: '-10%', right: '15%', width: '380px', height: '380px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(179,65,44,0.12) 0%, transparent 70%)', filter: 'blur(40px)' }} />
            <div style={{ position: 'absolute', bottom: '-5%', left: '10%', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,104,56,0.14) 0%, transparent 70%)', filter: 'blur(50px)' }} />

            {/* High-density typography background on cream rendered as SVG graphic for refraction */}
            <svg aria-hidden="true" role="img" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.14, pointerEvents: 'none' }}>
              <text x="20" y="50" fontFamily="serif" fontSize="28" fontWeight="bold" fill="#14201c">“Building a digital product shouldn’t feel like a gamble.”</text>
              <text x="20" y="90" fontFamily="sans-serif" fontSize="16" fill="#14201c">EDITORIAL CRAFT · PHYSICAL GLASS ON LIGHT SURFACES · HIGH CONTRAST RATIOS</text>
              <text x="20" y="130" fontFamily="serif" fontSize="22" fontWeight="bold" fill="#14201c">One accountable team from idea to launch · Fixed scope and price</text>
              <text x="20" y="170" fontFamily="sans-serif" fontSize="15" fill="#14201c">ACCESSIBLE CONTRAST 16.9:1 ON WHITE // 14.8:1 ON CREAM // ZERO GHOSTING</text>
              <text x="20" y="210" fontFamily="serif" fontSize="26" fontWeight="bold" fill="#14201c">Yorven Studio · Optical Lens Refraction · S-Curve Wave</text>
            </svg>
          </div>

          {/* Interactive Light Glass Components */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Buttons & Pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Light Refract (Chromium)
                </span>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <LiquidGlass variant="refract" shape="btn">
                    <span style={{ fontWeight: 600 }}>Refractive Action</span>
                  </LiquidGlass>
                  <LiquidGlass variant="refract" shape="pill">
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Refract Tag</span>
                  </LiquidGlass>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Light Frost (Safari / Firefox)
                </span>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <LiquidGlass variant="frost" shape="btn">
                    <span style={{ fontWeight: 600 }}>Frosted Action</span>
                  </LiquidGlass>
                  <LiquidGlass variant="frost" shape="pill">
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Frosted Tag</span>
                  </LiquidGlass>
                </div>
              </div>
            </div>

            {/* Large Light Problem Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              <LiquidGlass variant="refract" shape="card" style={{ minHeight: '220px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  The Cost of Overruns
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px', color: 'var(--text-strong)' }}>
                  “The final invoice looks nothing like the quote.”
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>
                  Budgets stretch, trust snaps, and you start second-guessing every decision. Glass refracts the underlying editorial typography cleanly while maintaining crisp 16:1 text contrast.
                </p>
              </LiquidGlass>

              <LiquidGlass variant="frost" shape="card" style={{ minHeight: '220px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  Launch Delay Impact
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px', color: 'var(--text-strong)' }}>
                  “It’ll be ready by the end of the month.”
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>
                  Launch dates slide. Customers, sales and momentum slide with them. Frosted glass on light surfaces combines soft blur with high-contrast hairlines.
                </p>
              </LiquidGlass>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
