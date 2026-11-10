/**
 * Canonical SEO Metadata & Schema.org Structured Data
 * All public routes for Yorven (https://yorven.in)
 */

import { getPublishedInsights } from './insights.js'

export const SITE_URL = 'https://yorven.in'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/yorven-wordmark.svg`

export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Yorven',
  url: SITE_URL,
  logo: DEFAULT_OG_IMAGE,
  email: 'projects@yorven.in',
  description: 'Independent digital product studio building websites, SaaS applications, and mobile products with fixed scopes and weekly working demos.',
  sameAs: [
    'https://x.com/YORVENin?s=20',
    'https://www.instagram.com/yorven.in/'
  ]
}

export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Yorven',
  url: SITE_URL
}

export const seoRoutes = {
  '/': {
    title: 'Yorven — Digital Product Studio | Web, Mobile & SaaS Engineering',
    description: 'Yorven is an independent digital product studio. We engineer custom websites, SaaS platforms, and mobile apps with fixed-scope delivery and client code ownership.',
    canonical: `${SITE_URL}/`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      organizationSchema,
      websiteSchema
    ]
  },
  '/services': {
    title: 'Engineering Services & Digital Product Capabilities — Yorven',
    description: 'Explore Yorven’s core engineering disciplines: high-performance websites, web and mobile digital products, and resilient cloud systems built with weekly working demos.',
    canonical: `${SITE_URL}/services`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Engineering Services & Capabilities — Yorven',
        description: 'Explore Yorven’s core engineering disciplines: high-performance websites, web and mobile digital products, and resilient cloud systems.',
        url: `${SITE_URL}/services`,
        isPartOf: websiteSchema
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Services', item: `${SITE_URL}/services` }
        ]
      }
    ]
  },
  '/services/websites': {
    title: 'Custom Website Design & Front-End Engineering — Yorven',
    description: 'We design and build fast, expressive marketing websites and design systems with React and Vite. Focused on responsiveness, semantic accessibility, and clean code.',
    canonical: `${SITE_URL}/services/websites`,
    ogType: 'article',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: 'Website Design & Front-End Engineering',
        serviceType: 'Web Development',
        provider: organizationSchema,
        description: 'Custom marketing sites, interactive brand experiences, and accessible design systems built with React and Vite.',
        url: `${SITE_URL}/services/websites`,
        termsOfService: `${SITE_URL}/terms`
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Services', item: `${SITE_URL}/services` },
          { '@type': 'ListItem', position: 3, name: 'Websites', item: `${SITE_URL}/services/websites` }
        ]
      }
    ]
  },
  '/services/digital-products': {
    title: 'Web & Mobile Application Engineering (SaaS, iOS & Android) — Yorven',
    description: 'Full-stack engineering for web applications, SaaS platforms, and mobile apps (iOS & Android). Shipped with weekly working demos, backed by ProofPay, Racers Vault, and Modern Classes.',
    canonical: `${SITE_URL}/services/digital-products`,
    ogType: 'article',
    ogImage: `${SITE_URL}/projects/payper-ai-live.png`,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: 'Web & Mobile Application Engineering',
        serviceType: 'Software Engineering',
        provider: organizationSchema,
        description: 'Full-stack software engineering for SaaS platforms, web applications, and mobile products on iOS and Android.',
        url: `${SITE_URL}/services/digital-products`,
        termsOfService: `${SITE_URL}/terms`
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Services', item: `${SITE_URL}/services` },
          { '@type': 'ListItem', position: 3, name: 'Digital Products', item: `${SITE_URL}/services/digital-products` }
        ]
      }
    ]
  },
  '/services/systems': {
    title: 'Systems Architecture, Custom Infrastructure & Automation — Yorven',
    description: 'Quiet, dependable infrastructure for scale: high-throughput bot platforms, Redis event loops, API integrations, and database architecture. Proven by Aurix.',
    canonical: `${SITE_URL}/services/systems`,
    ogType: 'article',
    ogImage: `${SITE_URL}/projects/aurix/aurix-spin-complete.png`,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: 'Systems Architecture, Custom Infrastructure & Automation',
        serviceType: 'Cloud & Systems Infrastructure',
        provider: organizationSchema,
        description: 'High-throughput backend architectures, real-time event engines, bot platforms, and automated cloud workflows.',
        url: `${SITE_URL}/services/systems`,
        termsOfService: `${SITE_URL}/terms`
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Services', item: `${SITE_URL}/services` },
          { '@type': 'ListItem', position: 3, name: 'Systems & Scale', item: `${SITE_URL}/services/systems` }
        ]
      }
    ]
  },
  '/work': {
    title: 'Selected Work & Engineering Case Studies — Yorven',
    description: 'Explore production digital products, mobile experiences, and software systems designed and engineered end-to-end by Yorven.',
    canonical: `${SITE_URL}/work`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Selected Work & Engineering Case Studies',
        description: 'Production digital products, mobile experiences, and software systems designed and engineered by Yorven.',
        url: `${SITE_URL}/work`,
        isPartOf: websiteSchema
      }
    ]
  },
  '/work/payper-ai': {
    title: 'PayperAI Case Study — Receivables Intelligence & Cash Flow Engine | Yorven',
    description: 'How Yorven architected a full-stack receivables intelligence platform and automated invoicing ledger to eliminate overdue cash flow delays.',
    canonical: `${SITE_URL}/work/payper-ai`,
    ogType: 'article',
    ogImage: `${SITE_URL}/projects/payper-ai-live.png`,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: 'PayperAI Receivables Intelligence Platform',
        headline: 'PayperAI — Receivables Intelligence & Automated Cash Flow',
        description: 'Receivables intelligence and automated invoice tracking that helps businesses eliminate overdue payments and optimize cash flow.',
        url: `${SITE_URL}/work/payper-ai`,
        image: `${SITE_URL}/projects/payper-ai-live.png`,
        creator: {
          '@type': 'Organization',
          name: 'Yorven',
          url: SITE_URL
        }
      }
    ]
  },
  '/work/racers-vault': {
    title: 'Racers Vault Case Study — Multimodal AI Supercar Radar & Digital Garage | Yorven',
    description: 'How Yorven engineered a camera-first mobile experience with multimodal computer vision and GPS-locked supercar spotting telemetry.',
    canonical: `${SITE_URL}/work/racers-vault`,
    ogType: 'article',
    ogImage: `${SITE_URL}/projects/racers-vault/porsche-gt3r-grello.jpg`,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: 'Racers Vault Mobile Experience',
        headline: 'Racers Vault — Supercar Spotting Platform & Collectible Garage',
        description: 'A camera-first mobile app that identifies exotic supercars on the street in real time using multimodal AI, giving automotive enthusiasts a collectible digital garage.',
        url: `${SITE_URL}/work/racers-vault`,
        image: `${SITE_URL}/projects/racers-vault/porsche-gt3r-grello.jpg`,
        creator: {
          '@type': 'Organization',
          name: 'Yorven',
          url: SITE_URL
        }
      }
    ]
  },
  '/work/aurix': {
    title: 'Aurix Case Study — High-Throughput Discord Bot & Real-Time Economy | Yorven',
    description: 'How Yorven engineered an event-driven Discord gaming platform with 16-shard clustering, dynamic economy curves, and sub-85ms latency.',
    canonical: `${SITE_URL}/work/aurix`,
    ogType: 'article',
    ogImage: `${SITE_URL}/projects/aurix/aurix-spin-complete.png`,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: 'Aurix Discord Platform',
        headline: 'Aurix — High-Throughput Discord Gaming & Economy Platform',
        description: 'An event-driven Discord gaming and server economy platform featuring dynamic wealth balancing, cooperative raids, and interactive embeds.',
        url: `${SITE_URL}/work/aurix`,
        image: `${SITE_URL}/projects/aurix/aurix-spin-complete.png`,
        creator: {
          '@type': 'Organization',
          name: 'Yorven',
          url: SITE_URL
        }
      }
    ]
  },
  '/work/modern-classes': {
    title: 'Modern Classes — a learning app for board & competitive exams | Yorven',
    description: 'How Yorven engineered an end-to-end Android learning application on Google Play for Modern Classes coaching institute, featuring live classes and automated mock tests.',
    canonical: `${SITE_URL}/work/modern-classes`,
    ogType: 'article',
    ogImage: `${SITE_URL}/modern-classes-logo.jpg`,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: 'Modern Classes — a learning app for board & competitive exams',
        headline: 'Modern Classes — a learning app for board & competitive exams',
        description: 'A comprehensive Android learning platform for Modern Classes coaching institute, delivering live classroom broadcasts, automated mock test evaluation, bilingual notes, and a student doubts desk.',
        url: `${SITE_URL}/work/modern-classes`,
        image: `${SITE_URL}/modern-classes-logo.jpg`,
        creator: {
          '@type': 'Organization',
          name: 'Yorven',
          url: SITE_URL
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: SITE_URL
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Work',
            item: `${SITE_URL}/work`
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'Modern Classes Patna',
            item: `${SITE_URL}/work/modern-classes`
          }
        ]
      }
    ]
  },
  '/about': {
    title: 'About — Engineering-Led Digital Product Studio | Yorven',
    description: 'Yorven builds software products with fixed scopes, weekly working demos, and client code ownership. Discover our philosophy and team standards.',
    canonical: `${SITE_URL}/about`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'About Yorven',
        description: 'Yorven builds software products with fixed scopes, weekly working demos, and client code ownership.',
        url: `${SITE_URL}/about`,
        isPartOf: websiteSchema
      }
    ]
  },
  '/contact': {
    title: 'Start a Project — Book a Free Discovery Call | Yorven',
    description: 'Schedule a free technical discovery consultation to discuss your web application, mobile product, or system architecture with Yorven.',
    canonical: `${SITE_URL}/contact`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: 'Start a Project with Yorven',
        description: 'Schedule a free technical discovery consultation to discuss your web application, mobile product, or system architecture.',
        url: `${SITE_URL}/contact`,
        isPartOf: websiteSchema
      }
    ]
  },
  '/privacy': {
    title: 'Privacy Policy — Yorven',
    description: 'Privacy policy and data governance practices for Yorven digital product studio.',
    canonical: `${SITE_URL}/privacy`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Privacy Policy',
        url: `${SITE_URL}/privacy`
      }
    ]
  },
  '/terms': {
    title: 'Terms of Service — Yorven',
    description: 'Terms and conditions governing the use of Yorven website and development services.',
    canonical: `${SITE_URL}/terms`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Terms of Service',
        url: `${SITE_URL}/terms`
      }
    ]
  },
  '/cookies': {
    title: 'Cookie Policy — Yorven',
    description: 'Information on functional cookies, browser web storage, and zero-tracking practices on yorven.in.',
    canonical: `${SITE_URL}/cookies`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Cookie Policy',
        url: `${SITE_URL}/cookies`
      }
    ]
  },
  '/insights': {
    title: 'Engineering Insights & Architectural Perspectives — Yorven',
    description: 'Perspectives, architecture teardowns, and engineering notes on building resilient web applications, mobile platforms, and high-scale systems.',
    canonical: `${SITE_URL}/insights`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Yorven Insights',
        description: 'Perspectives, architecture teardowns, and engineering notes from the Yorven digital product studio.',
        url: `${SITE_URL}/insights`,
        isPartOf: websiteSchema
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Insights', item: `${SITE_URL}/insights` }
        ]
      }
    ]
  }
}

// Dynamically register published article routes
try {
  getPublishedInsights().forEach(article => {
    seoRoutes[`/insights/${article.slug}`] = {
      title: `${article.title} — Yorven Insights`,
      description: article.excerpt,
      canonical: `${SITE_URL}/insights/${article.slug}`,
      ogType: 'article',
      ogImage: article.coverImage ? (article.coverImage.startsWith('http') ? article.coverImage : `${SITE_URL}${article.coverImage}`) : DEFAULT_OG_IMAGE,
      robots: 'index, follow',
      schema: [
        {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: article.title,
          description: article.excerpt,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt || article.publishedAt,
          mainEntityOfPage: `${SITE_URL}/insights/${article.slug}`,
          url: `${SITE_URL}/insights/${article.slug}`,
          author: {
            '@type': 'Organization',
            name: (article.author && article.author.name) || 'Yorven',
            url: SITE_URL
          },
          publisher: organizationSchema
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
            { '@type': 'ListItem', position: 2, name: 'Insights', item: `${SITE_URL}/insights` },
            { '@type': 'ListItem', position: 3, name: article.title, item: `${SITE_URL}/insights/${article.slug}` }
          ]
        }
      ]
    }
  })
} catch (e) {
  // Graceful fallback during early bootstrap
}

export function getRouteMeta(pathname) {
  // Normalize trailing slashes for lookup (except root '/')
  const cleanPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return seoRoutes[cleanPath] || {
    title: 'Yorven — Built for what’s next.',
    description: 'Thoughtful digital products that turn ambitious ideas into useful momentum.',
    canonical: `${SITE_URL}${cleanPath}`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'noindex, nofollow',
    schema: []
  }
}
