/**
 * Yorven Insights & Engineering Content System
 * Git-backed structured JavaScript content model
 * 
 * Initial Production State: 0 published articles (strictly per Phase 3A Task 3 instructions)
 */

import { services, work } from './site.js'

export const INSIGHT_CATEGORIES = [
  'Engineering',
  'Architecture',
  'Product Thinking',
  'Design Systems'
]

/**
 * Calculate reading time from actual textual content using a documented
 * assumption of 200 words per minute (WPM).
 * Does not rely on manually maintained reading-time strings.
 * 
 * @param {Array|string} sectionsOrContent 
 * @returns {string} Formatted reading time, e.g. "5 min read"
 */
export function calculateReadingTime(sectionsOrContent) {
  let text = ''

  if (typeof sectionsOrContent === 'string') {
    text = sectionsOrContent
  } else if (Array.isArray(sectionsOrContent)) {
    text = sectionsOrContent.map(section => {
      let secText = (section.heading || '') + ' '
      if (Array.isArray(section.content)) {
        secText += section.content.map(block => {
          if (typeof block === 'string') return block
          if (block.text) return block.text
          if (Array.isArray(block.items)) return block.items.join(' ')
          if (block.code) return block.code
          return ''
        }).join(' ')
      }
      return secText
    }).join(' ')
  }

  const words = text.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.ceil(words / 200))
  return `${minutes} min read`
}

/**
 * Validate an article collection against strict integrity rules.
 * Throws an explicit error identifying the article and offending field.
 * 
 * @param {Array} articleList 
 * @param {Object} context Optional lookup context { services, work, now }
 */
export function validateArticles(articleList, context = {}) {
  const errors = []
  const throwOnError = context.throwOnError !== false

  function recordError(msg) {
    errors.push(msg)
  }

  if (!Array.isArray(articleList)) {
    const msg = '[Insights Validation] Article collection must be an array.'
    if (throwOnError) throw new Error(msg)
    return [msg]
  }

  const validServiceSlugs = new Set((context.services || services || []).map(s => s.slug))
  const validCaseStudySlugs = new Set((context.work || work || []).map(w => w.slug))
  const seenSlugs = new Set()
  let featuredCount = 0
  const now = context.now ? new Date(context.now) : new Date()

  articleList.forEach((article, idx) => {
    const id = article.slug || `index_${idx}`

    // Slug validation
    if (!article.slug || typeof article.slug !== 'string') {
      recordError(`[Insights Validation] Article "${id}": missing or non-string slug.`)
    } else {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) {
        recordError(`[Insights Validation] Article "${id}": slug must be lowercase alphanumeric with hyphens (received: "${article.slug}").`)
      }
      if (seenSlugs.has(article.slug)) {
        recordError(`[Insights Validation] Article "${id}": duplicate slug "${article.slug}".`)
      }
      seenSlugs.add(article.slug)
    }

    // Required fields
    if (!article.title || typeof article.title !== 'string' || !article.title.trim()) {
      recordError(`[Insights Validation] Article "${id}": missing or empty title.`)
    }
    if (!article.excerpt || typeof article.excerpt !== 'string' || !article.excerpt.trim()) {
      recordError(`[Insights Validation] Article "${id}": missing or empty excerpt.`)
    }
    if (!INSIGHT_CATEGORIES.includes(article.category)) {
      recordError(`[Insights Validation] Article "${id}": invalid category "${article.category}". Must be one of: ${INSIGHT_CATEGORIES.join(', ')}.`)
    }
    if (!Array.isArray(article.tags)) {
      recordError(`[Insights Validation] Article "${id}": tags must be an array.`)
    }
    if (typeof article.published !== 'boolean') {
      recordError(`[Insights Validation] Article "${id}": published flag must be boolean.`)
    }

    // Published article rules
    if (article.published === true) {
      if (!article.publishedAt || !/^\d{4}-\d{2}-\d{2}$/.test(article.publishedAt)) {
        recordError(`[Insights Validation] Published article "${id}": publishedAt must be valid ISO date string YYYY-MM-DD (received: "${article.publishedAt}").`)
      } else {
        const pubDate = new Date(article.publishedAt + 'T00:00:00Z')
        if (isNaN(pubDate.getTime())) {
          recordError(`[Insights Validation] Published article "${id}": publishedAt is not a real calendar date.`)
        } else {
          const todayIso = now.toISOString().slice(0, 10)
          if (article.publishedAt > todayIso) {
            recordError(`[Insights Validation] Published article "${id}": publishedAt "${article.publishedAt}" cannot be in the future (today: "${todayIso}").`)
          }
        }
      }

      if (article.updatedAt) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(article.updatedAt)) {
          recordError(`[Insights Validation] Published article "${id}": updatedAt must be valid ISO date string YYYY-MM-DD.`)
        } else if (article.updatedAt < article.publishedAt) {
          recordError(`[Insights Validation] Published article "${id}": updatedAt cannot be earlier than publishedAt.`)
        }
      }

      // Content sections validation
      if (!Array.isArray(article.sections) || article.sections.length === 0) {
        recordError(`[Insights Validation] Published article "${id}": must contain at least one meaningful section.`)
      } else {
        const headingIds = new Set()
        article.sections.forEach((sec, sIdx) => {
          if (!sec.heading || typeof sec.heading !== 'string' || !sec.heading.trim()) {
            recordError(`[Insights Validation] Published article "${id}": section ${sIdx} missing heading text.`)
          }
          if (!sec.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sec.id)) {
            recordError(`[Insights Validation] Published article "${id}": section "${sec.heading}" has invalid or missing anchor id "${sec.id}".`)
          } else if (headingIds.has(sec.id)) {
            recordError(`[Insights Validation] Published article "${id}": duplicate heading anchor id "${sec.id}".`)
          } else {
            headingIds.add(sec.id)
          }

          if (!Array.isArray(sec.content) || sec.content.length === 0) {
            recordError(`[Insights Validation] Published article "${id}": section "${sec.heading}" has empty content blocks.`)
          } else {
            sec.content.forEach((block) => {
              if (block && typeof block === 'object' && (block.type === 'h2' || block.type === 'h3')) {
                if (!block.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(block.id)) {
                  recordError(`[Insights Validation] Published article "${id}": nested heading "${block.text}" has invalid anchor id "${block.id}".`)
                } else if (headingIds.has(block.id)) {
                  recordError(`[Insights Validation] Published article "${id}": duplicate nested heading anchor id "${block.id}".`)
                } else {
                  headingIds.add(block.id)
                }
              }
            })
          }
        })
      }

      // Featured check
      if (article.featured === true) {
        featuredCount++
        if (featuredCount > 1) {
          recordError(`[Insights Validation] Multiple published articles marked as featured. At most 1 article may be featured.`)
        }
      }

      // Reference integrity
      if (Array.isArray(article.relatedServiceSlugs)) {
        article.relatedServiceSlugs.forEach(sSlug => {
          if (!validServiceSlugs.has(sSlug)) {
            recordError(`[Insights Validation] Published article "${id}": relatedServiceSlugs references nonexistent service "${sSlug}".`)
          }
        })
      }
      if (Array.isArray(article.relatedCaseStudySlugs)) {
        article.relatedCaseStudySlugs.forEach(csSlug => {
          if (!validCaseStudySlugs.has(csSlug)) {
            recordError(`[Insights Validation] Published article "${id}": relatedCaseStudySlugs references nonexistent case study "${csSlug}".`)
          }
        })
      }
    }
  })

  if (throwOnError && errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  return errors
}

/**
 * Dynamically generate Table of Contents from an article's actual sections and headings.
 * Guarantees TOC matches actual headings with zero manual duplication.
 * 
 * @param {Object} article 
 * @returns {Array<{ id: string, title: string, level: number }>}
 */
export function extractTableOfContents(article) {
  if (!article || !Array.isArray(article.sections)) return []
  const items = []
  for (const section of article.sections) {
    if (section.heading && section.id) {
      items.push({
        id: section.id,
        title: section.heading,
        level: section.level || 2
      })
    }
    if (Array.isArray(section.content)) {
      for (const block of section.content) {
        if (block && typeof block === 'object') {
          if (block.type === 'h2') {
            items.push({
              id: block.id,
              title: block.text || block.heading,
              level: 2
            })
          } else if (block.type === 'h3') {
            items.push({
              id: block.id,
              title: block.text || block.heading,
              level: 3
            })
          }
        }
      }
    }
  }
  return items
}

// ----------------------------------------------------------------------------
// Initial Production Collection: Zero Published Articles
// As mandated by user instruction, no example or fabricated articles are published.
// ----------------------------------------------------------------------------
export const insights = []

// Validate initial collection on module load
validateArticles(insights)

/**
 * Retrieve all published articles, sorted by publication date descending.
 * Drafts (published !== true) are strictly excluded.
 */
export function getPublishedInsights() {
  return insights
    .filter(article => article.published === true)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
}

/**
 * Retrieve a published article by slug.
 * Returns null if the article does not exist or is unpublished (draft).
 */
export function getInsightBySlug(slug) {
  if (!slug) return null
  const article = insights.find(a => a.slug === slug)
  if (!article || article.published !== true) return null
  return article
}
