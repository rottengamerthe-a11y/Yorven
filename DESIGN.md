# Yorven Design System (DESIGN.md)

This document establishes the official design system, token architecture, component specifications, and UX guidelines for the Yorven digital product studio website ([yorven.in](https://yorven.in)).

---

## 1. Brand Identity & Principles

* **Identity:** Yorven is an engineering and product studio building digital products, platforms, and high-performance software for founders and growing companies.
* **Aesthetic:** Luxury industrial precision, technical confidence, and restrained utilitarian clarity.
* **Core Rule (Anti-Slop):** No filler badges, no redundant "You get" labels, no random italic words, no glowing shadows, no purple/multi-color gradients, no glassmorphism, no emojis as UI icons, no stat banners, and no identical-card grids.
* **Color Palette:** Deep dark green backdrop with exactly **one** lime accent for primary calls-to-action and critical emphasis.

---

## 2. Color System (OKLCH)

All colors are specified in perceptually uniform `oklch()` space with equivalent hex fallbacks. Surfaces create depth by stepping up in lightness with neutral alpha borders—never glowing box-shadows.

### Semantic Tokens

```css
:root {
  /* Surface Layers (Dark Theme) */
  --bg-app: oklch(0.272 0.041 192.4);         /* #082d2c: Canvas ground */
  --surface-raised: oklch(0.318 0.048 188.6); /* #0d3a37: Level 1 cards & panels */
  --surface-overlay: oklch(0.355 0.052 188.0);/* #124541: Level 2 dialogs & hover states */
  --surface-sunken: oklch(0.207 0.030 187.5); /* #051c1a: Inputs & code insets */
  --surface-nav: oklch(0.250 0.038 192.0);    /* #072625: Solid non-glass header bar */

  /* Neutral Alpha Borders (Concentric depth, no colored borders) */
  --border-subtle: oklch(1 0 0 / 0.08);       /* Default dividers and hairline borders */
  --border-medium: oklch(1 0 0 / 0.14);       /* Card perimeter */
  --border-strong: oklch(1 0 0 / 0.24);       /* Interactive borders on focus/hover */

  /* Single Accent: Yorven Lime */
  --accent: oklch(0.907 0.134 118.8);         /* #d7ed83: Primary CTA & key emphasis only */
  --accent-hover: oklch(0.850 0.145 118.8);   /* Darker, richer lime on hover */
  --accent-active: oklch(0.800 0.150 118.8);  /* Deep active press state */
  --accent-contrast: oklch(0.180 0.035 192.0);/* Deep dark green text over lime CTA */

  /* Typography / Foreground Colors */
  --text-primary: oklch(0.955 0.014 88.7);    /* #f4f0e6: High-contrast primary headings & body */
  --text-secondary: oklch(0.820 0.025 155.0);  /* #c8dacd: Supporting descriptions */
  --text-tertiary: oklch(0.680 0.025 160.0);   /* #8fa897: Meta tags, captions, timestamps */
  --text-disabled: oklch(0.480 0.020 170.0);   /* Disabled element labels */

  /* Status Colors */
  --status-error: oklch(0.65 0.22 28.0);       /* Form validation error */
  --status-success: oklch(0.85 0.16 142.0);    /* Shipped / verified live */
}
```

---

## 3. Typography System

* **Display Face:** *Manrope* (700 Bold / 800 ExtraBold) — crisp, geometric, confident sans-serif.
* **Body / Text Face:** *Manrope* (400 Regular / 500 Medium / 600 SemiBold) — excellent legibility down to 12px.
* **Monospace Face:** *DM Mono* (400 / 500) — reserved **only** where it earns its place: code, pricing figures, technical specs, and tags.
* **Rules:**
  * Headings: `text-wrap: balance; font-feature-settings: "cv02", "cv03", "cv04", "cv11";`
  * Body: `text-wrap: pretty; line-height: 1.6;`
  * Figures, dates, and metrics: `font-variant-numeric: tabular-nums;`

### Type Scale

| Role | Font Size (clamp) | Line Height | Tracking | Weight | Font Family |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Display** | `clamp(40px, 5.8vw, 76px)` | 1.05 | `-0.04em` | 800 | Display |
| **Section H1/H2** | `clamp(28px, 3.6vw, 48px)` | 1.15 | `-0.03em` | 700 | Display |
| **Card / Project H3** | `clamp(22px, 2.2vw, 32px)` | 1.25 | `-0.025em`| 700 | Display |
| **Subheading / Lede** | `clamp(18px, 1.8vw, 24px)` | 1.45 | `-0.015em`| 500 | Body |
| **Body Large** | `17px` | 1.6 | `-0.01em` | 400 | Body |
| **Body Regular** | `15px` | 1.6 | `0em` | 400 | Body |
| **UI Action / Button**| `15px` | 1.0 | `0.01em` | 600 | Body |
| **Mono Metric / Spec**| `clamp(14px, 1.4vw, 18px)`| 1.3 | `-0.01em` | 500 | Mono (`tabular-nums`) |
| **Caption / Fine Meta**| `12px` | 1.4 | `0.02em` | 500 | Body / Mono |

---

## 4. Spacing Scale

Strict 4px baseline grid ensuring proportional rhythm and optical balance.

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  --space-32: 128px;

  /* Section Padding */
  --section-padding-y: clamp(64px, 9vw, 128px);
  --container-max-width: 1280px;
  --container-px: clamp(20px, 4vw, 48px);
}
```

---

## 5. Concentric Radius Scale

Outer cards and inner elements must maintain visual geometric alignment according to the concentric radius formula:
$$\mathbf{R_{\text{inner}} = R_{\text{outer}} - \text{Padding}}$$

```css
:root {
  --radius-sm: 4px;   /* Badges, tags, micro-controls */
  --radius-md: 8px;   /* Buttons, inputs, small cards */
  --radius-lg: 14px;  /* Medium cards, dialog panels */
  --radius-xl: 20px;  /* Outer project blocks, hero panels */
  --radius-full: 9999px; /* Pill buttons, status chips */
}
```

*Example:* An outer project block with `border-radius: 20px` (`--radius-xl`) and internal padding of `12px` contains an image viewport with `border-radius: 8px` ($20px - 12px = 8px$).

---

## 6. Elevation & Depth (No Glows)

* **Level 0 (Base Canvas):** Background `var(--bg-app)` with optional masked blueprint square-dot texture.
* **Level 1 (Cards & Blocks):** Surface `var(--surface-raised)` with `border: 1px solid var(--border-medium)`. Shadow: `0 12px 32px oklch(0 0 0 / 0.35)`.
* **Level 2 (Hover & Elevated Active):** Surface `var(--surface-overlay)` with `border: 1px solid var(--border-strong)`. Shadow: `0 20px 48px oklch(0 0 0 / 0.45)`.
* **Level 3 (Modal / Floating Overlays):** Surface `var(--surface-overlay)`, border `var(--border-strong)`, shadow: `0 32px 64px oklch(0 0 0 / 0.6)`.

---

## 7. Component Specifications

### 7.1 Primary CTA Button
* **Appearance:** Solid lime background (`var(--accent)`), deep dark green text (`var(--accent-contrast)`), height minimum 48px (Fitts's Law), font-weight 600, `border-radius: var(--radius-md)`.
* **States:**
  * *Default:* `background: var(--accent); color: var(--accent-contrast); transform: none;`
  * *Hover:* `background: var(--accent-hover); transform: translateY(-1px);`
  * *Active:* `background: var(--accent-active); transform: scale(0.97);`
  * *Focus-Visible:* `outline: 2px solid var(--text-primary); outline-offset: 3px;`
  * *Disabled:* `opacity: 0.4; pointer-events: none;`
  * *Loading:* Inline 16px SVG spinner, text dimmed, pointer-events none.

### 7.2 Secondary / Ghost Link
* **Appearance:** Transparent background, `var(--text-primary)` label, hairline underline with 4px gap, optical arrow `ArrowUpRight` (15px, stroke 1.75).
* **States:**
  * *Hover:* Underline transitions to `var(--accent)`, text shifts 2px diagonally.
  * *Focus-Visible:* `outline: 2px solid var(--accent); outline-offset: 2px;`

### 7.3 Navigation Bar
* **Structure:** Solid background (`var(--surface-nav)`), no glassmorphism or backdrop blur.
* **Layout:** Logo on far left linking home; links (Work, Services, About, Insights) centered/grouped; single primary CTA ("Start a project") on the far right.
* **Target Size:** All links have hit targets $\ge 44\text{px}$.

### 7.4 Form Inputs & Range Sliders (Cost Calculator & Contact)
* **Input Fields:**
  * Surface: `var(--surface-sunken)` with border `var(--border-medium)`.
  * Text: 16px (prevents iOS auto-zoom on focus).
  * Focus: `border-color: var(--accent); outline: none; box-shadow: 0 0 0 1px var(--accent);`
  * Error State: Shake animation (`translateX(±4px)` for 350ms), border `var(--status-error)`.
  * Postel's Law: Automatically trims whitespace and gracefully handles varying phone/URL inputs.
* **Range Slider:** Custom webkit/moz thumb with `44px` invisible hit area, track in `var(--surface-raised)` with filled segment in `var(--accent)`.

### 7.5 Project Showcase Blocks (Selected Work)
* **Layout:** 4 large full-bleed blocks with alternating 2-column orientation (Media left / Editorial right, then Media right / Editorial left).
* **Content:** Real project title, 1-line verified outcome, live link, tech stack chips in mono.
* **Media:** Edge-to-edge container with concentric radius, lazy-loaded WebP screenshot, contain/cover fit without cropping interface critical details.

### 7.6 Accordion (FAQ)
* **Appearance:** Neutral alpha borders between rows. Clean expand indicator (`Plus` / `Minus` Lucide icon, rotating 45° or swapping with blur).
* **States:** Smooth `grid-template-rows: 0fr -> 1fr` transition under 300ms. No emoji or colored borders.

### 7.7 Footer
* **Appearance:** Solid dark background, organized into concise columns (Explore, Contact, Legal).
* **Legal Links:** Working links to `/terms`, `/privacy`, `/cookies`, and accessible cookie choices.
* **Motion Toggle:** Explicitly renders current state ("Motion reduced" / "Reduce motion") with active visual indicator. Never covered by the mobile sticky CTA.

---

## 8. Iconography & Optical Alignment

* **Icon Set:** `lucide-react` exclusively.
* **Stroke Weight:** Exactly `1.75px` across all icons for complete optical weight unity.
* **Alignment Rule:** When placed inline with text, icons must be placed in a flex wrapper with `align-items: center` and optical offset `transform: translateY(0.5px)` to align with the font cap height.
* **Strict Rule:** **Zero emojis** anywhere in production UI.

---

## 9. Imagery & Media Rules

* **Integrity:** Use only verified assets from real projects: Modern Classes, ProofPay, Racers Vault, Aurix. Never use placeholder agency graphics or stock mockups.
* **Formats:** All images served in WebP with explicit `width`, `height`, and `aspect-ratio` to ensure **CLS = 0**.
* **Video:** Lazy-loaded, muted, `playsInline`, `preload="none"` or `"metadata"`, with static poster fallback.

---

## 10. Motion Tokens & UX Rules

Motion is bold in **three places only**:
1. **Hero Entrance:** Crisp staggered rise (`translateY(24px -> 0)` with `opacity: 0 -> 1` over 600ms, `cubic-bezier(0.16, 1, 0.3, 1)`).
2. **Work Blocks:** Subtle parallax and scroll-linked reveal for the 4 project blocks.
3. **Closing CTA:** Punchy typography entrance into the blueprint grid section.

Everywhere else uses functional micro-feedback:
* **Tap / Press Feedback:** `transform: scale(0.97)` on `:active`.
* **Enter Animation:** Scale from `0.97` to `1.0` (never from `0`).
* **Directional Slides:** Page and drawer transitions slide along the user's navigational axis.
* **Timing:** Feedback delivered under **300ms** (well within the Doherty threshold).
* **Reduced Motion:** When `prefers-reduced-motion` is active or the site toggle is on, all transitions are instant or opacity-only (0 duration transform).
