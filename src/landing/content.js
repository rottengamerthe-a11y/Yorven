/*
 * ALL landing-page copy lives in this file. Edit the text here; no need to touch the components.
 *
 * Anything marked  // CONFIRM  is a promise about how Yorven works. I don't know your real terms,
 * so check each one is true before the site goes live, or change the wording to match reality.
 */

/* 1. HERO ---------------------------------------------------------------------------------- */
export const HERO = {
  // End result + the thing they fear, as three short lines (the words animate in one by one).
  lines: [['Launch', 'your', 'product'], ['without', 'the', 'delays,'], ['overruns', 'or', 'guesswork']],
  highlight: 'without',
  lede: 'Yorven designs and builds websites, apps and systems for founders and growing businesses, with the scope, price and timeline agreed before we write a line of code.',
  primary: { label: 'Start a project', to: '/contact' },
  secondary: { label: 'See how it works', href: '#how' },
  // CONFIRM: each of these three is a promise
  trust: ['Fixed scope and price before we start', 'Working progress shown every week', 'You own everything we build']
}

/* 2. SOCIAL PROOF -------------------------------------------------------------------------- */
/*
 * Real shipped work only. Never publish invented numbers or quotes.
 * Entries with  sample: true  are a dev-only preview (hidden in the production build).
 *
 * A card can have: stat + statLabel, summary, points (chips), quote + person, who, link.
 * Everything except stat, statLabel and who is optional.
 */
export const PROOF = [
  {
    stat: 'Live',
    statLabel: 'on Google Play, built end to end',
    summary: 'A learning app for Modern Classes Patna, a coaching institute: live classes and recorded lectures, mock tests with automated evaluation, Hindi and English notes, a doubts desk and a student dashboard.',
    points: ['Live classes', 'Mock tests', 'Bilingual notes', 'Doubts desk'],
    who: 'Modern Classes Patna · Coaching institute',
    link: { label: 'View on Google Play', href: 'https://play.google.com/store/apps/details?id=com.modernclasses.patna.modern_classes_patna' }
  }

  /* Template for the next one (add a real quote only with the client's permission):
  { stat: '2.4×', statLabel: 'more enquiries in 3 months', quote: 'What the client said, in their words.', person: 'Name, Role', who: 'Business · Industry' },
  */
]

/* 3. PROBLEM ------------------------------------------------------------------------------- */
export const PROBLEM = {
  eyebrow: 'Sound familiar?',
  title: ['Building a digital product', 'shouldn’t feel like a gamble.'],
  intro: 'If you’ve hired a developer or an agency before, you probably know how this goes.',
  pains: [
    { quote: '“It’ll be ready by the end of the month.”', cost: 'Launch dates slide. Customers, sales and momentum slide with them.' },
    { quote: '“The final invoice looks nothing like the quote.”', cost: 'Budgets stretch, trust snaps, and you start second-guessing every decision.' },
    { quote: '“I’ve explained this to three different people.”', cost: 'Every handoff between strategy, design and code loses the details that mattered.' },
    { quote: '“It launched. Now nobody can change anything.”', cost: 'Fragile code turns every small update into a negotiation and another invoice.' }
  ],
  calc: {
    title: 'What a delay really costs',
    valueLabel: 'What would this product earn or save you each month once it’s live?',
    monthsLabel: 'How many months late have your past projects run?',
    resultLabel: 'left on the table',
    footnote: 'That’s before the budget overrun, and before the hours you spend chasing updates.'
  }
}

/* 4. SOLUTION ------------------------------------------------------------------------------ */
export const SOLUTION = {
  eyebrow: 'A better way to build',
  title: ['One accountable team,', 'from idea to launch.'],
  intro: 'Yorven replaces the usual patchwork of freelancers, handoffs and status meetings with a single team that stays on the hook for the result.',
  features: [
    { visual: 'quote', title: 'Fixed scope and price', text: 'We agree what gets built, when, and for how much before work begins.', benefit: 'You know the number on day one, and it doesn’t change.' }, // CONFIRM
    { visual: 'weekly', title: 'A working demo every week', text: 'You get something real to click through, not a status report.', benefit: 'You always know where the project stands, while changes are still cheap.' }, // CONFIRM
    { visual: 'team', title: 'One team, no handoffs', text: 'Strategy, design and engineering sit in the same room from the start.', benefit: 'You explain it once, and it’s understood.' },
    { visual: 'design', title: 'Design and engineering together', text: 'What gets designed is what gets built, checked as we go.', benefit: 'It looks right and works right the first time.' },
    { visual: 'own', title: 'You own what we build', text: 'Code, designs and accounts are handed over in full.', benefit: 'No lock-in. You can take it anywhere, any time.' }, // CONFIRM
    { visual: 'last', title: 'Built to last', text: 'Clean, documented code on dependable foundations.', benefit: 'Small changes stay small, and the product grows with your business.' }
  ],
  servicesEyebrow: 'Where we put it to work'
}

/* 5. HOW IT WORKS -------------------------------------------------------------------------- */
export const HOW = {
  eyebrow: 'How it works',
  title: ['Four steps.', 'No commitment until you’re ready.'],
  steps: [
    { n: '01', title: 'Tell us what you need', text: 'Send a short enquiry or message us on WhatsApp. No documents, no jargon.', tag: 'Commitment: none' },
    { n: '02', title: 'Get a clear plan', text: 'We reply with a written plan: scope, timeline and a fixed price. Not convinced? Walk away, nothing owed.', tag: 'Commitment: none' }, // CONFIRM
    { n: '03', title: 'Approve, then we build', text: 'We work in weekly steps. You see it working and approve each milestone before the next begins.', tag: 'One milestone at a time' }, // CONFIRM
    { n: '04', title: 'Launch and keep everything', text: 'We hand over the code, designs and accounts. What happens next is your call.', tag: 'You own it' } // CONFIRM
  ],
  reassure: ['No lock-in contracts', 'Pay per milestone', 'Steer or pause between milestones'] // CONFIRM
}

/* 6. FAQ ----------------------------------------------------------------------------------- */
export const FAQ = {
  eyebrow: 'Questions',
  title: ['Things people ask', 'before they start.'],
  items: [
    {
      q: 'How much does a project cost?',
      a: 'Every project receives a fixed-price USD proposal with clear milestone deliverables and guaranteed timelines before work begins. Focused marketing sites and web apps typically range between $4,000 and $12,000, while comprehensive MVPs, mobile applications, and high-scale systems range between $15,000 and $35,000. You know the exact number upfront—no hidden overages or surprise hourly billing.'
    },
    {
      q: 'How do international payments and contracts work?',
      a: 'We partner with founders and product teams globally across the US, UK, Europe, Australia, and worldwide. Contracts and invoices are in USD, and payments are settled securely via Stripe (major credit cards) or international wire transfer (SWIFT / ACH). You review and approve each weekly milestone build before releasing payment for the next stage.'
    },
    {
      q: 'How do you handle time zones and communication?',
      a: 'We support global clients smoothly with dedicated Slack or Discord channels, regular async video walkthroughs (Loom), and weekly working demos scheduled during overlapping hours that suit your local time zone.'
    },
    {
      q: 'How long does an engagement typically take?',
      a: 'A focused website, interactive landing page, or redesign typically takes 2 to 3 weeks. A full custom MVP, SaaS platform, or mobile application launches in 4 to 8 weeks, shipped in verified weekly milestone builds.'
    },
    {
      q: 'I don’t have a complete specification. Can we still start?',
      a: 'Yes—most founders come to us with a vision and business goals rather than a technical spec. We run a rapid scoping process to define user journeys, system architecture, and core features, turning them into a concrete, fixed-price launch plan.'
    },
    {
      q: 'Who owns the intellectual property, code, and designs?',
      a: 'You do, 100%. All source code (GitHub/GitLab repositories), Figma design files, cloud infrastructure accounts, and production assets are transferred to your company upon launch. We never hold back code or lock you in.'
    },
    {
      q: 'What if I want to adjust scope or pause part-way through?',
      a: 'Because we work in weekly milestones and you approve each one before the next begins, you can easily steer priorities, refine features, or pause the engagement between milestones without penalty.'
    },
    {
      q: 'What happens after launch?',
      a: 'Every build includes a 30-day post-launch warranty for bug fixes and performance tuning. Afterwards, we offer flexible monthly engineering retainer support or a clean handoff to your internal team.'
    },
    {
      q: 'Who will I actually be working with?',
      a: 'Senior product designers and full-stack software engineers actively writing your code. You communicate directly with the builders—no junior account managers or sales middlemen in between.'
    }
  ]
}

/* 7. FINAL CTA ----------------------------------------------------------------------------- */
export const CTA = {
  title: ['Get your product live,', 'without the guesswork.'],
  text: 'Tell us what you’re building and get a clear plan, timeline and fixed price.', // CONFIRM
  button: { label: 'Start a project', to: '/contact' },
  note: 'No commitment until you approve the plan.' // CONFIRM
}
