import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Clock, User } from 'lucide-react'
import { calculateReadingTime } from '../../data/insights.js'

export function InsightCard({ article, featured = false, headingLevel = 'h2' }) {
  if (!article) return null

  const HeadingTag = headingLevel === 'h3' ? 'h3' : 'h2'
  const readingTime = calculateReadingTime(article.sections)

  return (
    <article className={`insight-card ${featured ? 'is-featured' : ''}`}>
      <div className="ic-header">
        <div className="ic-meta-row">
          <span className="cs-meta-pill tag-category">{article.category}</span>
          <span className="cs-meta-pill tag-time">
            <Clock size={11} aria-hidden="true" />
            <span>{readingTime}</span>
          </span>
          {article.publishedAt && (
            <time dateTime={article.publishedAt} className="cs-meta-pill tag-date">
              {article.publishedAt}
            </time>
          )}
        </div>
      </div>

      <HeadingTag className="ic-title">
        <Link to={`/insights/${article.slug}`} className="ic-title-link">
          {article.title}
        </Link>
      </HeadingTag>

      <p className="ic-excerpt">{article.excerpt}</p>

      {Array.isArray(article.tags) && article.tags.length > 0 && (
        <div className="ic-tags">
          {article.tags.map((tag) => (
            <span key={tag} className="ic-tag">#{tag}</span>
          ))}
        </div>
      )}

      <div className="ic-footer">
        {article.author && article.author.name && (
          <span className="ic-author">
            <User size={13} aria-hidden="true" />
            <span>{article.author.name}</span>
          </span>
        )}
        <Link to={`/insights/${article.slug}`} className="ic-read-btn">
          <span>Read insight</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

export default InsightCard
