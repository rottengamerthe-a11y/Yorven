/*
 * Official landing-page copy for Yorven (yorven.in)
 * Follows DESIGN.md specifications & verified studio capabilities.
 */

/* 1. HERO ---------------------------------------------------------------------------------- */
export const HERO = {
  headline: 'Fixed-price websites and apps, with a working demo every week.',
  subcopy: 'You approve each milestone, and you own the code.',
  primary: { label: 'Start a project', to: '/contact' },
  secondary: { label: 'See selected work', href: '#work' }
}

/* 2. SELECTED WORK (Verified Shipped Products Only) ---------------------------------------- */
export const SELECTED_WORK = [
  {
    slug: 'modern-classes',
    title: 'Modern Classes',
    role: 'Mobile Engineering · Google Play',
    outcome: 'An Android learning application shipped on Google Play with live video streaming, timed mock tests, and a student doubts desk.',
    link: 'https://play.google.com/store/apps/details?id=com.modernclasses.patna.modern_classes_patna',
    linkType: 'external',
    caseStudyUrl: '/work/modern-classes',
    stack: ['Flutter', 'Android', 'Live Video', 'Test Engine'],
    image: '/projects/modern-classes/screen-1-home.webp',
    imageAlt: 'Modern Classes Android application home and lecture interface'
  },
  {
    slug: 'racers-vault',
    title: 'Racers Vault',
    role: 'Mobile Experience · Automotive Social',
    outcome: 'A camera-first supercar spotting platform and collectible digital garage with photo identification and vehicle rarity tiers.',
    link: '/work/racers-vault',
    linkType: 'internal',
    caseStudyUrl: '/work/racers-vault',
    stack: ['Flutter', 'Firebase', 'Mobile Camera UI'],
    image: '/projects/racers-vault/porsche-gt3r-grello.webp',
    imageAlt: 'Racers Vault supercar identification and garage showcase'
  },
  {
    slug: 'aurix',
    title: 'Aurix',
    role: 'Systems Architecture · 16-Shard Engine',
    outcome: 'An event-driven Discord gaming engine supporting 16-shard clustering, dynamic in-chat economy curves, and sub-85ms response times.',
    link: '/work/aurix',
    linkType: 'internal',
    caseStudyUrl: '/work/aurix',
    stack: ['Node.js', 'Discord Engine', 'Redis Clustering'],
    image: '/projects/aurix/aurix-spin-complete.webp',
    imageAlt: 'Aurix Discord bot interactive arcade interface and economy command'
  },
  {
    slug: 'payper-ai',
    title: 'ProofPay',
    role: 'Web Application · Invoicing Intelligence',
    outcome: 'A receivables intelligence platform and automated overdue ledger helping businesses track unpaid accounts and automate payment recovery.',
    link: '/work/payper-ai',
    linkType: 'internal',
    caseStudyUrl: '/work/payper-ai',
    stack: ['React', 'Node.js', 'Invoicing Ledger'],
    image: '/projects/payper-ai-live.png',
    imageAlt: 'ProofPay receivables intelligence dashboard and payment ledger'
  }
]

/* 3. THE PROBLEM --------------------------------------------------------------------------- */
export const PROBLEM = {
  eyebrow: 'Sound familiar?',
  title: 'Building a digital product shouldn’t feel like a gamble.',
  intro: 'Most agency engagements break down at the seams between estimated costs, communication handoffs, and sliding launch dates.',
  pains: [
    {
      title: 'Sliding launch dates',
      quote: '“It’ll be ready by the end of the month.”',
      detail: 'Estimated timelines stretch indefinitely as teams get lost in revision cycles without verified working code.'
    },
    {
      title: 'Surprise invoices',
      quote: '“The final invoice looks nothing like the quote.”',
      detail: 'Ambiguous scopes create hidden hourly fees, scope creep negotiations, and strained client trust.'
    },
    {
      title: 'Lost in handoffs',
      quote: '“I’ve explained this to three different people.”',
      detail: 'Handoffs between account managers, designers, and outsourced developers dilute core business requirements.'
    },
    {
      title: 'Locked-in codebases',
      quote: '“It launched. Now nobody can touch the code.”',
      detail: 'Fragile architectures and proprietary agency lock-in turn every minor update into an expensive battle.'
    }
  ],
  calc: {
    title: 'What a delay really costs',
    valueLabel: 'What would this product earn or save your business each month once live?',
    monthsLabel: 'How many months have past agency or freelance projects run late?',
    resultLabel: 'Lost opportunity left on the table'
  }
}

/* 4. HOW WE WORK (One Large Feature + Compact List) ---------------------------------------- */
export const HOW_WE_WORK = {
  eyebrow: 'How we work',
  title: 'A studio model built on accountability, not billable hours.',
  feature: {
    title: 'Fixed scope and guaranteed price before writing a single line of code.',
    desc: 'We define exact deliverables, milestones, technical parameters, and delivery windows upfront. You sign off on a fixed USD budget—no surprise change orders, no unapproved invoices, and no sliding launch windows.'
  },
  principles: [
    {
      title: 'A working demo every week',
      desc: 'You receive clickable, working software every seven days to review on your own screen—never static slide decks or status reports.'
    },
    {
      title: 'You approve each milestone',
      desc: 'Progress is split into clearly defined stages. You test and approve each build before releasing payment for the next.'
    },
    {
      title: '100% code and asset ownership',
      desc: 'All source code repositories, design files, and cloud accounts are transferred to you in full. No lock-in, ever.'
    }
  ]
}

/* 5. SERVICES (Websites, Digital products, Systems & scale) -------------------------------- */
export const SERVICES = [
  {
    slug: 'websites',
    title: 'Websites',
    timeline: '4–8 weeks',
    tagline: 'High-performance marketing platforms engineered for speed, crisp visual identity, and effortless conversion.',
    deliverables: ['Information architecture & content structure', 'Custom responsive React component system', 'Asset, font & media optimization (0 CLS)', 'Metadata, analytics & technical SEO foundation'],
    videoPoster: '/projects/payper-ai-live.png',
    link: '/services/websites'
  },
  {
    slug: 'digital-products',
    title: 'Digital products',
    timeline: '8–16 weeks',
    tagline: 'Full-stack software engineering for SaaS platforms, web applications, and verified Android mobile experiences.',
    deliverables: ['User journey mapping & core workflows', 'Full-stack React & Node.js application architecture', 'Android mobile engineering (Flutter / Play Store)', 'Secure authentication & role-based permissions'],
    videoPoster: '/projects/modern-classes/screen-1-home.webp',
    link: '/services/digital-products'
  },
  {
    slug: 'systems',
    title: 'Systems & scale',
    timeline: '6–12 weeks',
    tagline: 'Resilient cloud backends, event-driven infrastructure, bot engines, and automated business workflows built to perform under load.',
    deliverables: ['Distributed event-loop & queuing architectures', 'High-throughput bot engines & real-time telemetry', 'Database modeling, migrations & index tuning', 'API integration & automated cloud deployments'],
    videoPoster: '/projects/aurix/aurix-spin-complete.webp',
    link: '/services/systems'
  }
]

/* 6. WEEK-BY-WEEK PLAN --------------------------------------------------------------------- */
export const WEEK_PLAN = {
  eyebrow: 'Week-by-week plan',
  title: 'Real milestones. Working software demonstrated every seven days.',
  stages: [
    {
      period: 'Week 1',
      title: 'Architecture & technical foundation',
      deliverable: 'Agreed technical specification, data schema, Figma component primitives, and deployment environments locked down.'
    },
    {
      period: 'Weeks 2–4',
      title: 'Core workflows & weekly demo builds',
      deliverable: 'Primary user journeys, authentication, interactive screens, and database integrations delivered in verified weekly increments.'
    },
    {
      period: 'Weeks 5–8',
      title: 'Full integration & production launch (Websites window)',
      deliverable: 'End-to-end integration, performance profiling, responsive cross-browser audits, and production launch on your domain.'
    },
    {
      period: 'Weeks 9–16',
      title: 'Scale telemetry & application release (Digital products window)',
      deliverable: 'High-scale edge optimizations, automated mock/testing routines, Google Play store submission, and production handover.'
    }
  ]
}

/* 7. FAQ ACCORDION ------------------------------------------------------------------------- */
export const FAQ = {
  eyebrow: 'FAQ',
  title: 'Everything you need to know before we build.',
  items: [
    {
      q: 'How long does an engagement take to launch?',
      a: 'Websites launch in 4 to 8 weeks. Digital products and web/mobile applications launch in 8 to 16 weeks, and custom systems and scale infrastructure deploy in 6 to 12 weeks—all delivered in verified weekly working demos.'
    },
    {
      q: 'How much does a typical project cost?',
      a: 'Every project receives a fixed-price USD proposal before work begins. Focused websites typically range between $4,000 and $12,000, while comprehensive MVPs, mobile applications, and high-scale systems range between $15,000 and $35,000. You know the exact number upfront—no hidden overages or surprise hourly billing.'
    },
    {
      q: 'How do milestone approvals and payments work?',
      a: 'We work in weekly increments. You test each working build and approve each milestone before the next stage begins. Invoices are in USD, settled securely via Stripe (major credit cards) or international wire transfer (ACH / SWIFT).'
    },
    {
      q: 'Who owns the intellectual property and code?',
      a: 'You own 100% of everything we build. All GitHub repositories, design systems, cloud infrastructure, and production assets are transferred to your company upon launch.'
    },
    {
      q: 'What happens after the product launches?',
      a: 'Every launch includes a 30-day post-launch warranty covering bug fixes and performance tuning. Afterwards, we offer flexible monthly engineering retainer support or a clean handoff to your internal team.'
    },
    {
      q: 'Who will actually engineer our product?',
      a: 'Senior product designers and full-stack software engineers actively writing your code. You communicate directly with the builders—no junior account managers or sales middlemen in between.'
    }
  ]
}

/* 8. CLOSING SECTION ----------------------------------------------------------------------- */
export const CLOSING = {
  headline: 'Ready to build with certainty?',
  subcopy: 'Tell us what you’re planning and get a fixed-price proposal, clear milestone plan, and confirmed delivery window within 24 hours.',
  primary: { label: 'Start a project', to: '/contact' }
}
