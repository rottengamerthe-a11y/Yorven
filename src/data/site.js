import { Code2, Layers3, Zap } from 'lucide-react'

export const services = [
  { icon: Code2, number: '01', title: 'Websites', text: 'Fast, expressive sites that make a sharp first impression and turn attention into momentum.', deliverables: 'Strategy, content structure, design system, responsive build', timeline: '4–8 weeks', tech: 'React, Vite, CMS-ready components', tags: ['Strategy', 'Design systems', 'Development'] },
  { icon: Layers3, number: '02', title: 'Digital products', text: 'Web and mobile applications shaped around the people who use them and the business behind them.', deliverables: 'Product framing, UX flows, interface design, front-end engineering', timeline: '8–16 weeks', tech: 'React, APIs, accessible component systems', tags: ['Product thinking', 'UX/UI', 'Engineering'] },
  { icon: Zap, number: '03', title: 'Systems & scale', text: 'The quiet, dependable infrastructure that connects teams, tools and ambitious ideas.', deliverables: 'Technical direction, automation, integrations, platform foundations', timeline: '6–12 weeks', tech: 'TypeScript, APIs, cloud services', tags: ['SaaS', 'Automation', 'APIs'] }
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
    image: '/projects/racers-vault/pagani-huayra-spot.jpg',
    metrics: [
      { label: 'Recognition Latency', val: '<780ms', note: 'AI multimodal vehicle ID' },
      { label: 'Rarity Tiers', val: '4 Classes', note: 'Mythic, Legendary, Ultra, Rare' },
      { label: 'Spotting Accuracy', val: '99.1%', note: 'Anti-spoof GPS + EXIF check' },
      { label: 'Community Spots', val: '12,400+', note: 'Supercar spot database' }
    ],
    detailedScreens: [
      {
        id: 'pagani',
        name: 'Pagani Huayra BC',
        tier: 'Mythic',
        category: 'Hypercars',
        location: 'Hamburg, Germany',
        xp: '+1,500 XP',
        caption: 'NATO-olive green aero package with exposed carbon fiber and active aero flaps sitting curbside.',
        src: '/projects/racers-vault/pagani-huayra-spot.jpg'
      },
      {
        id: 'porsche',
        name: 'Porsche 911 GT3 R "Grello"',
        tier: 'Mythic',
        category: 'Track Monsters',
        location: 'Nürburg, Germany',
        xp: '+1,850 XP',
        caption: 'The legendary Manthey Racing "Grello" 911 GT3 R in person. Iconic yellow-green fluorescent livery.',
        src: '/projects/racers-vault/porsche-gt3r-grello.jpg'
      },
      {
        id: 'amg',
        name: 'Mercedes-AMG GT 63 Coupe',
        tier: 'Legendary',
        category: 'Supercars',
        location: 'Hamburg, Germany',
        xp: '+950 XP',
        caption: 'New-gen AMG GT Coupe sitting pretty curbside in High-Tech Silver. Twin-turbo V8 coupe.',
        src: '/projects/racers-vault/amg-gt63-coupe.jpg'
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
        src: '/projects/aurix/aurix-spin-complete.png',
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
        src: '/projects/aurix/aurix-champion-signal.png',
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
        src: '/projects/aurix/aurix-arcade-flip.png',
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
        src: '/projects/aurix/aurix-balance.png',
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
        src: '/projects/aurix/aurix-pvp-duel.png',
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

export const heroWords = ['Your', 'next', 'big', 'idea', 'deserves', 'better', 'engineering']

export const pageMeta = {
  '/': ['Yorven — Built for what’s next.', 'Yorven is a digital product studio for ambitious ideas.'],
  '/work': ['Products & Work — Yorven', 'Actual products, applications and platforms built by Yorven.'],
  '/about': ['About — Yorven', 'Yorven is an independent digital product studio.'],
  '/contact': ['Contact — Yorven', 'Start a thoughtful conversation about your next digital product.'],
  '/privacy': ['Privacy policy — Yorven', 'Privacy policy structure for Yorven, pending approved legal text.'],
  '/terms': ['Terms of use — Yorven', 'Terms of use structure for Yorven, pending approved legal text.']
}
