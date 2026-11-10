import { Code2, Layers3, Zap } from 'lucide-react'

export const services = [
  {
    slug: 'websites',
    icon: Code2,
    number: '01',
    title: 'Websites',
    contactType: 'Website / Marketing Platform',
    heroTitle: 'Websites engineered for clarity, speed, and lasting impression',
    heroSub: 'Fast, expressive sites that make a sharp first impression and turn attention into momentum. Built with accessible component systems and dependable foundations.',
    text: 'Fast, expressive sites that make a sharp first impression and turn attention into momentum.',
    deliverables: 'Strategy, content structure, design system, responsive build',
    timeline: '4–8 weeks',
    tech: 'React, Vite, CMS-ready components',
    tags: ['Strategy', 'Design systems', 'Development'],
    challenge: 'Many marketing websites suffer from bloated dependencies, slow initial load times, and fragile templates that become difficult to maintain after launch. Updates turn into negotiations, and site speed degrades over time.',
    approach: 'We build websites using clean, modern front-end engineering with React and Vite. Design and code are developed together without handoff friction, ensuring responsive layouts, semantic accessibility, and clean component systems that your team can confidently own and evolve.',
    deliverableList: [
      'Information architecture, sitemap, and content structure',
      'Custom responsive design system and typography tokens',
      'Semantic, accessible React components with clean code structure',
      'Asset, font, and media optimization for fast page loads',
      'Interactive motion and scroll animations with reduced-motion support',
      'Clean production build, metadata headers, and deployment setup'
    ],
    caseStudySlugs: []
  },
  {
    slug: 'digital-products',
    icon: Layers3,
    number: '02',
    title: 'Digital products',
    contactType: 'Web Application / SaaS MVP',
    heroTitle: 'Web and mobile applications shaped around real users',
    heroSub: 'Full-stack software engineering for SaaS platforms, web applications, and mobile products. Designed for intuitive workflows, responsive performance, and dependable scale.',
    text: 'Web and mobile applications shaped around the people who use them and the business behind them.',
    deliverables: 'Product framing, UX flows, interface design, front-end engineering',
    timeline: '8–16 weeks',
    tech: 'React, APIs, accessible component systems',
    tags: ['Product thinking', 'UX/UI', 'Engineering'],
    challenge: 'Product teams often struggle with fragmented handoffs between UI design and backend implementation. Early-stage products end up with fragile state management, insecure session lifecycles, and technical debt that slows down iteration after launch.',
    approach: 'We engineer digital products from foundational user flows through full-stack implementation. We build with clean API contracts, secure authentication, reactive state, and verified weekly milestones—bringing software to life through working builds rather than static mockups.',
    deliverableList: [
      'Product framing, user journey mapping, and core workflow specifications',
      'Full-stack web application development (React, Node.js, relational databases)',
      'Native and cross-platform mobile application development (iOS & Android)',
      'Secure authentication, session handling, and role-based permissions',
      'Reactive user interfaces, API integration, and telemetry instrumentation',
      'Automated testing, continuous deployment, and app store release workflows'
    ],
    caseStudySlugs: ['payper-ai', 'racers-vault']
  },
  {
    slug: 'systems',
    icon: Zap,
    number: '03',
    title: 'Systems & scale',
    contactType: 'Systems & Custom Infrastructure',
    heroTitle: 'Quiet, dependable infrastructure that connects teams and tools',
    heroSub: 'High-throughput backend architectures, real-time event engines, bot platforms, and automated cloud workflows built to operate smoothly under load.',
    text: 'The quiet, dependable infrastructure that connects teams, tools and ambitious ideas.',
    deliverables: 'Technical direction, automation, integrations, platform foundations',
    timeline: '6–12 weeks',
    tech: 'TypeScript, APIs, cloud services',
    tags: ['SaaS', 'Automation', 'APIs'],
    challenge: 'As user volume and transactional frequency grow, monolithic backends and uncoordinated background jobs cause latency spikes, database lockups, and unrecoverable state desynchronization.',
    approach: 'We design resilient, event-driven infrastructure with clear bounded contexts. From distributed sharded event loops and atomic queue processing to hardened database migrations and telemetry pipelines, our systems maintain integrity, sub-second response times, and high uptime.',
    deliverableList: [
      'Systems architecture, data modeling, and distributed event-loop design',
      'High-throughput bot platforms and real-time interaction engines',
      'Redis caching layers, distributed locks, and atomic state synchronization',
      'Database schema design, index optimization, and row-level security policies',
      'Background job runners, rate limiting, and failure-compensation state machines',
      'API integration, automated monitoring, and production deployment'
    ],
    caseStudySlugs: ['aurix']
  }
]

export const work = [
  {
    slug: 'payper-ai',
    label: 'Web Application',
    title: 'PayperAI',
    subtitle: 'Receivables intelligence and automated cash flow operating system',
    type: 'Receivables AI · SaaS & Fintech',
    tagline: 'Eliminate overdue receivables with predictive default risk scoring and automated recovery',
    badge: 'Live in Production',
    liveUrl: 'http://localhost:5174/',
    timeline: 'Q1 2026',
    client: 'Fintech & B2B SaaS',
    role: 'Product Strategy · Design System · Full-Stack React Architecture',
    className: 'work-payper',
    demoType: 'web-app',
    metrics: [
      { label: 'Payment Recovery', val: '94.2%', note: 'Automated on-time resolution' },
      { label: 'DSO Reduction', val: '-28%', note: 'Average days sales outstanding' },
      { label: 'Ledger Automation', val: '100%', note: 'Zero manual reconciliation' },
      { label: 'Risk Accuracy', val: '98.5%', note: 'Predictive default heuristics' }
    ],
    description: 'Receivables intelligence and automated invoice tracking that helps businesses eliminate overdue payments and optimize cash flow.',
    problem: 'Growing businesses lose control over unpaid invoices, manual follow-ups, and sudden cash-flow dips. Overdue accounts often linger 45+ days due to fragmented spreadsheets, manual email reminders, and missing bank reconciliation.',
    approach: 'We architected a unified receivables operating cockpit that continuously ingests invoices, calculates risk scores, triggers graduated automated escalations, and syncs payments in real time.',
    screens: [
      'Receivables intelligence dashboard',
      'Automated overdue ledger',
      'Cash flow & payment reconciliation',
      'Debtor risk telemetry matrix'
    ],
    stack: 'React 19 · Node.js · Supabase · Invoicing Engine · Lenis',
    liveScreenshot: '/projects/payper-ai-live.png'
  },
  {
    slug: 'racers-vault',
    label: 'Mobile Application',
    title: 'Racers Vault',
    subtitle: 'The real-world supercar spotting platform & collectible digital garage',
    type: 'Mobile Experience · AI & Automotive',
    tagline: 'Computer vision vehicle recognition, GPS radar & collectible rarity vault',
    badge: 'Live on Mobile',
    timeline: 'Q4 2025 – Present',
    client: 'Automotive & Consumer Social',
    role: 'Mobile UI/UX Design · Flutter Engineering · Multimodal AI Pipeline',
    className: 'work-racers',
    demoType: 'mobile-app',
    image: '/projects/racers-vault/porsche-gt3r-grello.webp',
    metrics: [
      { label: 'Recognition Latency', val: '<780ms', note: 'AI multimodal vehicle ID' },
      { label: 'Rarity Tiers', val: '4 Classes', note: 'Mythic, Legendary, Ultra, Rare' },
      { label: 'Spotting Accuracy', val: '99.1%', note: 'Anti-spoof GPS + EXIF check' },
      { label: 'Community Spots', val: '12,400+', note: 'Supercar spot database' }
    ],
    detailedScreens: [
      {
        id: 'porsche',
        name: 'Porsche 911 GT3 R "Grello"',
        tier: 'Mythic',
        category: 'Track Monsters',
        location: 'Nürburg, Germany',
        xp: '+1,850 XP',
        caption: 'The legendary Manthey Racing "Grello" 911 GT3 R in person. Iconic yellow-green fluorescent livery.',
        src: '/projects/racers-vault/porsche-gt3r-grello.webp'
      },
      {
        id: 'amg',
        name: 'Mercedes-AMG GT 63 Coupe',
        tier: 'Legendary',
        category: 'Supercars',
        location: 'Hamburg, Germany',
        xp: '+950 XP',
        caption: 'New-gen AMG GT Coupe sitting pretty curbside in High-Tech Silver. Twin-turbo V8 coupe.',
        src: '/projects/racers-vault/amg-gt63-coupe.webp'
      },
      {
        id: 'yamaha',
        name: 'Yamaha YZF-R7 Chameleon',
        tier: 'Ultra Rare',
        category: 'Superbikes',
        location: 'Hamburg, Germany',
        xp: '+1,150 XP',
        caption: 'Deep purple chameleon wrap catching the evening light. Track-focused ergonomics and custom aero levers.',
        src: '/projects/racers-vault/yamaha-yzf-r7.webp'
      }
    ],
    description: 'A camera-first mobile app that identifies exotic supercars on the street in real time using multimodal AI, giving automotive enthusiasts a collectible digital garage.',
    problem: 'Car spotters capture rare vehicles but have no unified digital home to verify spots, compete on rarity leaderboards, or catalogue sightings with verified GPS and time telemetry.',
    approach: 'We designed and built a mobile application powered by on-device computer vision and GPS-locked verification. Spotters point their camera to identify vehicles, unlock rarity tiers, and build a collectible profile.',
    screens: [
      'Multimodal vehicle camera scanner',
      'Rarity tier verification matrix',
      'GPS supercar radar map',
      'Spotter XP and collectible garage'
    ],
    stack: 'Flutter · Dart · Gemini Multimodal Vision · Firebase · Mapbox'
  },
  {
    slug: 'aurix',
    label: 'Discord Platform',
    title: 'Aurix',
    subtitle: 'Event-driven Discord bot platform with real-time economy & interactive combat',
    type: 'Discord Bot · Systems & Gaming',
    tagline: 'High-throughput Discord bot: interactive PvP duels, dynamic wealth curves & raid alerts',
    badge: 'Live in 40+ Communities',
    timeline: 'Q3 2025 – Present',
    client: 'Gaming Communities & Creator Guilds',
    role: 'System Architecture · Node.js Sharding · Interactive UI Engine',
    className: 'work-aurix',
    demoType: 'discord-bot',
    metrics: [
      { label: 'Command Latency', val: '<85ms', note: 'Interactive component response' },
      { label: 'Shard Cluster', val: '16 Shards', note: 'Distributed Redis event loop' },
      { label: 'Daily Interactions', val: '240,000+', note: 'Player transactions & battles' },
      { label: 'Uptime SLA', val: '99.98%', note: 'Zero game state desynchronization' }
    ],
    detailedScreens: [
      {
        id: 'spin',
        cmd: '/spin',
        category: 'ARCADE',
        name: 'Arcade Wheel Progression',
        desc: 'High-speed arcade loops with aura payouts, rank progression, and quick-navigation Discord action rows.',
        src: '/projects/aurix/aurix-spin-complete.webp',
        buttons: [
          { label: 'Rank', style: 'secondary' },
          { label: 'Collection', style: 'secondary' },
          { label: 'Quests', style: 'secondary' }
        ]
      },
      {
        id: 'event',
        cmd: '/event claim',
        category: 'RAIDS',
        name: 'Server-Wide Champion Signal',
        desc: 'Timed cooperative combat broadcast delivering rare crate loot and community participation incentives.',
        src: '/projects/aurix/aurix-champion-signal.webp',
        buttons: [
          { label: 'Claim Loot', style: 'primary' },
          { label: 'Raid Log', style: 'secondary' }
        ]
      },
      {
        id: 'flip',
        cmd: '/flip',
        category: 'SINKS',
        name: 'Currency Sinks & Anti-Inflation',
        desc: 'Capped coin flip mechanics calibrated to dynamically absorb excess server liquidity.',
        src: '/projects/aurix/aurix-arcade-flip.webp',
        buttons: [
          { label: 'Heads', style: 'secondary' },
          { label: 'Tails', style: 'secondary' }
        ]
      },
      {
        id: 'balance',
        cmd: '/vault balance',
        category: 'ECONOMY',
        name: 'Dynamic Vault & Wallet',
        desc: 'Real-time aura balances, passive vault yield calculations, and server liquidity controls.',
        src: '/projects/aurix/aurix-balance.webp',
        buttons: [
          { label: 'Deposit', style: 'secondary' },
          { label: 'Withdraw', style: 'secondary' },
          { label: 'Yield Curve', style: 'secondary' }
        ]
      },
      {
        id: 'duel',
        cmd: '/duel invite',
        category: 'COMBAT',
        name: 'PvP Turn-Based Duel Engine',
        desc: 'Interactive duel invites with environmental hazard modifiers and responsive Discord component buttons.',
        src: '/projects/aurix/aurix-pvp-duel.webp',
        buttons: [
          { label: 'Accept', style: 'success' },
          { label: 'Decline', style: 'danger' },
          { label: 'Cancel', style: 'secondary' }
        ]
      }
    ],
    description: 'An event-driven Discord gaming and server economy platform featuring dynamic wealth balancing, cooperative raids, and interactive embeds.',
    problem: 'Online communities struggle to maintain long-term player engagement and balanced economies with repetitive, static bot commands that offer no tactical or visual depth.',
    approach: 'We built a high-throughput event engine using Discord.js, Redis, and MongoDB. The system features dynamic yield curves, multi-button interactive duel boards, server raid alerts, and algorithmic currency sinks.',
    screens: [
      'Dynamic economy & vault balances',
      'Interactive PvP duel invites',
      'Server-wide champion signal events',
      'Arcade game loops & anti-inflation sinks'
    ],
    stack: 'Discord.js · Node.js · MongoDB · Redis Sharding · EventBus'
  }
]

export const modernClasses = {
  slug: 'modern-classes',
  label: 'Mobile Application',
  title: 'Modern Classes — a learning app for board & competitive exams',
  displayTitle: 'Modern Classes',
  headlineAccent: 'a learning app for board & competitive exams',
  subtitle: 'A unified mobile learning platform built for Modern Classes coaching institute, delivering live classroom streaming, interactive weekly mock tests, academic doubts desk, and enrolled batch management for 10th/12th boards and state competitive exams.',
  type: 'Mobile Learning · EdTech',
  tagline: 'Live classroom streaming, interactive mock tests & academic doubts desk',
  badge: 'Live on Google Play',
  liveUrl: 'https://play.google.com/store/apps/details?id=com.modernclasses.patna.modern_classes_patna',
  qrCode: '/projects/modern-classes-qr.svg',
  timeline: '2025 – 2026',
  client: 'Modern Classes Coaching Institute',
  role: 'Mobile UI/UX Design · Flutter Engineering · Media & Testing Engine',
  className: 'work-modern',
  demoType: 'mobile-app',
  image: '/modern-classes-logo.webp',
  // 5 Real App Screenshots uploaded from production Android build
  carouselScreens: [
    {
      id: 'home',
      title: 'Academic Center',
      subtitle: 'Resume Learning & Workspaces',
      src: '/projects/modern-classes/screen-1-home.webp',
      alt: 'Modern Classes Student Academic Center and Resume Learning'
    },
    {
      id: 'courses',
      title: 'Courses & Catalog',
      subtitle: 'Board & Competitive Batches',
      src: '/projects/modern-classes/screen-2-courses.webp',
      alt: 'Academic Workspaces and Featured Batches'
    },
    {
      id: 'batches',
      title: 'My Batches',
      subtitle: 'Enrolled Schedules & Notes',
      src: '/projects/modern-classes/screen-3-batches.webp',
      alt: 'My Enrolled Batches and Curriculum Progress'
    },
    {
      id: 'test',
      title: 'Weekly Mock Test',
      subtitle: 'Timed Single-Choice Engine',
      src: '/projects/modern-classes/screen-4-test.webp',
      alt: 'Science Weekly Test with timer and single-choice questions'
    },
    {
      id: 'doubts',
      title: 'Doubts Desk',
      subtitle: 'Academic Inquiries & Review',
      src: '/projects/modern-classes/screen-5-doubts.webp',
      alt: 'Academic Doubts and Inquiries pending review'
    }
  ],
  // Truthful Case Study Narrative
  narrative: {
    problem: 'Coaching institutes struggle to manage remote students through scattered messaging channels. Sending PDFs across chats causes loss of context, manual paper-based tests delay feedback for days, and students have no structured way to submit academic doubts.',
    solution: 'We engineered a dedicated Android application for Modern Classes using Flutter. The app centralizes live classroom broadcasts, an interactive timed test engine, student doubt inquiries, and enrolled batch curriculum management in a clean mobile interface.',
    result: 'Students manage their daily learning routine in one verified app. Weekly mock tests are answered and timed digitally, doubts are logged directly with faculty, and batch schedules are accessible on Android with zero operational friction.'
  },
  // ROLE & STACK BREAKDOWN (Requirement 9)
  roleDetails: [
    {
      title: 'Mobile UI/UX Design',
      desc: 'High-contrast, distraction-free Android interfaces optimized for long study sessions across varying phone viewports.'
    },
    {
      title: 'Flutter & Dart Engineering',
      desc: 'Resilient client architecture featuring offline-first lecture caching, smooth 60fps animations, and responsive interactions.'
    },
    {
      title: 'Low-Latency Media Pipeline',
      desc: 'Adaptive-bitrate video streaming ensuring uninterrupted lecture playback even on constrained 4G mobile networks.'
    },
    {
      title: 'Automated Grading Engine',
      desc: 'Constructed an instant evaluation algorithm scoring complex multiple-choice tests with negative marking precision.'
    }
  ],
  stackItems: [
    { name: 'Flutter & Dart', category: 'Cross-platform Mobile Client' },
    { name: 'Firebase & Cloud Firestore', category: 'Realtime Data & Auth' },
    { name: 'Cloudflare Stream', category: 'Low-Latency Video Pipeline' },
    { name: 'REST APIs & Node.js', category: 'Instant Evaluation Backend' },
    { name: 'Google Play Console', category: 'Production Android Release' }
  ],
  description: 'A unified mobile learning platform built for Modern Classes coaching institute, delivering live classroom streaming, interactive weekly mock tests, academic doubts desk, and enrolled batch management for 10th/12th boards and state competitive exams.',
  problem: 'Traditional coaching institutes face significant drop-off when transitioning students to remote preparation. Fragmented messaging groups for distributing PDFs, manual test grading, and unreliable video links create friction for students and faculty alike.',
  approach: 'We architected and built a dedicated Android learning application for Modern Classes Patna from the ground up. The platform unifies live classroom streaming, a searchable lecture archive, an automated practice mock test engine with instant evaluation and bilingual solutions, structured PDF study material distribution, and a dedicated student doubts desk directly on Google Play.',
  screens: [
    'Live classroom video streaming',
    'Automated practice mock test engine',
    'Bilingual lecture notes vault (Hindi & English)',
    'Integrated student doubts desk',
    'Student telemetry dashboard'
  ],
  stack: 'Android · Flutter · Cloud Video Streaming · Automated Evaluation · REST APIs'
}

export const allProjects = [...work, modernClasses]

export const heroWords = ['Your', 'next', 'big', 'idea', 'deserves', 'better', 'engineering']

export const pageMeta = {
  '/': ['Yorven — Built for what’s next.', 'Yorven is a digital product studio for ambitious ideas.'],
  '/services': ['Engineering Services & Capabilities — Yorven', 'Core engineering disciplines: websites, digital products, and systems.'],
  '/services/websites': ['Website Design & Front-End Engineering — Yorven', 'Fast, expressive sites and design systems with React and Vite.'],
  '/services/digital-products': ['Web & Mobile Application Engineering — Yorven', 'Full-stack engineering for web applications, SaaS platforms, and mobile apps.'],
  '/services/systems': ['Systems Architecture & Infrastructure — Yorven', 'Quiet, dependable infrastructure, event engines, and automated workflows.'],
  '/work': ['Featured Products & Platforms — Yorven', 'Featured products and platforms engineered by Yorven.'],
  '/work/modern-classes': ['Modern Classes Patna Case Study — Yorven', 'A learning app for Modern Classes Patna: live classes, mock tests, and bilingual notes.'],
  '/about': ['About — Yorven', 'Yorven is an independent digital product studio.'],
  '/contact': ['Contact — Yorven', 'Start a thoughtful conversation about your next digital product.'],
  '/privacy': ['Privacy Policy — Yorven', 'Privacy practices and data governance for Yorven digital product studio.'],
  '/terms': ['Terms of Service — Yorven', 'Terms and conditions governing the use of Yorven website and development services.'],
  '/cookies': ['Cookie Policy — Yorven', 'Information on cookies and storage technologies used on yorven.in.']
}
