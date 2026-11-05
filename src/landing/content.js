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
 * Put REAL client results here and delete the sample ones. Never publish invented numbers.
 * Entries with  sample: true  are only shown while you run `npm run dev`; they are hidden in the
 * production build, so a placeholder can never go live by accident.
 */
export const PROOF = [
  { sample: true, stat: '00%', statLabel: 'Describe the real result, e.g. faster page loads', who: 'Client name · Industry', quote: 'A short, real quote from this client about working with you.', person: 'Their name, role' },
  { sample: true, stat: '0×', statLabel: 'Another real result, e.g. more enquiries', who: 'Client name · Industry', quote: 'A short, real quote from this client about working with you.', person: 'Their name, role' },
  { sample: true, stat: '0 wks', statLabel: 'A real result, e.g. time from kickoff to launch', who: 'Client name · Industry', quote: 'A short, real quote from this client about working with you.', person: 'Their name, role' }
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
    { q: 'How much will it cost?', a: 'It depends on what you’re building. Every project gets a written, fixed quote before we start, so you know the number up front. The enquiry form has INR budget ranges to help us point you in the right direction.' }, // CONFIRM
    { q: 'How long does it take?', a: 'It depends on scope: a focused website is much quicker than a full product. Your plan includes a timeline broken into weekly milestones, so you know what to expect before you commit.' },
    { q: 'I don’t know exactly what I need. Can I still start?', a: 'Yes, most people don’t at the beginning. Tell us the problem you’re trying to solve and we’ll help shape the scope in your plan.' },
    { q: 'Who owns the code and designs?', a: 'You do. Everything we build is handed over to you at launch.' }, // CONFIRM
    { q: 'What if I’m not happy part-way through?', a: 'We work in milestones and you approve each one before the next begins, so you can steer, pause or stop at a milestone instead of finding out at the end.' }, // CONFIRM
    { q: 'Do you work with clients outside India?', a: 'Yes. We work with teams in India and abroad, and keep in touch over email, WhatsApp and video calls.' },
    { q: 'What happens after launch?', a: 'We hand everything over, and can stay on for fixes and improvements if you’d like us to.' }, // CONFIRM
    { q: 'Who will I actually talk to?', a: 'The people building your product. There’s no account-manager layer between you and the team.' } // CONFIRM
  ]
}

/* 7. FINAL CTA ----------------------------------------------------------------------------- */
export const CTA = {
  title: ['Get your product live,', 'without the guesswork.'],
  text: 'Tell us what you’re building and get a clear plan, timeline and fixed price.', // CONFIRM
  button: { label: 'Start a project', to: '/contact' },
  note: 'No commitment until you approve the plan.' // CONFIRM
}
