import { Code2, Layers3, Zap } from 'lucide-react'

export const services = [
  { icon: Code2, number: '01', title: 'Websites', text: 'Fast, expressive sites that make a sharp first impression and turn attention into momentum.', deliverables: 'Strategy, content structure, design system, responsive build', timeline: '4–8 weeks', tech: 'React, Vite, CMS-ready components', tags: ['Strategy', 'Design systems', 'Development'] },
  { icon: Layers3, number: '02', title: 'Digital products', text: 'Web and mobile applications shaped around the people who use them and the business behind them.', deliverables: 'Product framing, UX flows, interface design, front-end engineering', timeline: '8–16 weeks', tech: 'React, APIs, accessible component systems', tags: ['Product thinking', 'UX/UI', 'Engineering'] },
  { icon: Zap, number: '03', title: 'Systems & scale', text: 'The quiet, dependable infrastructure that connects teams, tools and ambitious ideas.', deliverables: 'Technical direction, automation, integrations, platform foundations', timeline: '6–12 weeks', tech: 'TypeScript, APIs, cloud services', tags: ['SaaS', 'Automation', 'APIs'] }
]

export const work = [
  { slug: 'northstar', label: 'Concept project', title: 'Northstar', type: 'Product strategy · SaaS', className: 'work-northstar', description: 'A calmer operating system for modern teams.', problem: 'Teams were losing momentum across disconnected tools and noisy handoffs.', approach: 'A focused workspace that turns priorities into a clear shared rhythm.', screens: ['Command centre', 'Team priorities', 'Weekly rhythm'], stack: 'React · Product systems · Interaction design' },
  { slug: 'lumen', label: 'Concept project', title: 'Lumen', type: 'Mobile experience · Fintech', className: 'work-lumen', description: 'Making the everyday money decision feel simple.', problem: 'People needed a calmer way to understand everyday financial decisions.', approach: 'A mobile experience that makes context and next steps visible at a glance.', screens: ['Balance overview', 'Decision detail', 'Activity trail'], stack: 'Mobile UX · Interface design · Prototyping' },
  { slug: 'arc-01', label: 'Concept project', title: 'Arc / 01', type: 'Brand platform · Culture', className: 'work-arc', description: 'A digital home for a new kind of collective.', problem: 'A new cultural collective needed a home with energy and editorial clarity.', approach: 'A flexible brand platform built around people, stories and shared momentum.', screens: ['Editorial index', 'Story detail', 'Member rhythm'], stack: 'Brand platform · Art direction · Web design' }
]

export const heroWords = ['Your', 'next', 'big', 'idea', 'deserves', 'better', 'engineering']

export const pageMeta = {
  '/': ['Yorven — Built for what’s next.', 'Yorven is a digital product studio for ambitious ideas.'],
  '/work': ['Work — Yorven', 'Concept product work spanning strategy, design and engineering.'],
  '/about': ['About — Yorven', 'Yorven is an independent digital product studio.'],
  '/contact': ['Contact — Yorven', 'Start a thoughtful conversation about your next digital product.'],
  '/privacy': ['Privacy policy — Yorven', 'Privacy policy structure for Yorven, pending approved legal text.'],
  '/terms': ['Terms of use — Yorven', 'Terms of use structure for Yorven, pending approved legal text.']
}
