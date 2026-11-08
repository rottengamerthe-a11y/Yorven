/**
 * Canonical SEO Metadata & Schema.org Structured Data
 * All public routes for Yorven (https://yorven.in)
 */

export const SITE_URL = 'https://yorven.in'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/yorven-wordmark.svg`

export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Yorven',
  alternateName: 'Yorven Technologies',
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
    ogImage: `${SITE_URL}/projects/racers-vault/pagani-huayra-spot.jpg`,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: 'Racers Vault Mobile Experience',
        headline: 'Racers Vault — Supercar Spotting Platform & Collectible Garage',
        description: 'A camera-first mobile app that identifies exotic supercars on the street in real time using multimodal AI, giving automotive enthusiasts a collectible digital garage.',
        url: `${SITE_URL}/work/racers-vault`,
        image: `${SITE_URL}/projects/racers-vault/pagani-huayra-spot.jpg`,
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
    title: 'Privacy Policy — Yorven Technologies',
    description: 'Privacy policy and data governance practices for Yorven Technologies.',
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
    title: 'Terms of Use — Yorven Technologies',
    description: 'Terms and conditions governing the use of the Yorven Technologies website and services.',
    canonical: `${SITE_URL}/terms`,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    robots: 'index, follow',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Terms of Use',
        url: `${SITE_URL}/terms`
      }
    ]
  }
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
