import React from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Info, AlertTriangle, CheckCircle2 } from 'lucide-react'

/**
 * Safe structured editorial content renderer
 * 
 * Invariants:
 * - Strictly zero raw inner-HTML injection (JSX nodes only)
 * - ZERO execution of arbitrary strings or script injection
 * - Accessible semantic HTML hierarchy (h2, h3, p, ul, ol, blockquote, pre)
 * - Explicit image dimensions and lazy loading
 * - Safe external link attributes (rel="noopener noreferrer")
 */

function renderBlock(block, index) {
  if (typeof block === 'string') {
    return <p key={index} className="prose-p">{block}</p>
  }

  if (!block || typeof block !== 'object') {
    return null
  }

  switch (block.type) {
    case 'paragraph':
    default:
      if (Array.isArray(block.tokens)) {
        return (
          <p key={index} className="prose-p">
            {block.tokens.map((token, tIdx) => {
              if (typeof token === 'string') return token
              if (token.type === 'link') {
                if (token.internal) {
                  return <Link key={tIdx} to={token.href} className="prose-link">{token.text}</Link>
                }
                return (
                  <a key={tIdx} href={token.href} target="_blank" rel="noopener noreferrer" className="prose-link ext-link">
                    <span>{token.text}</span>
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )
              }
              if (token.type === 'code') {
                return <code key={tIdx} className="prose-inline-code">{token.text}</code>
              }
              if (token.type === 'strong') {
                return <strong key={tIdx}>{token.text}</strong>
              }
              if (token.type === 'em') {
                return <em key={tIdx}>{token.text}</em>
              }
              return token.text || ''
            })}
          </p>
        )
      }
      return <p key={index} className="prose-p">{block.text}</p>

    case 'h2':
      return <h2 key={index} id={block.id} className="prose-h2">{block.text}</h2>

    case 'h3':
      return <h3 key={index} id={block.id} className="prose-h3">{block.text}</h3>

    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul'
      return (
        <ListTag key={index} className={`prose-list ${block.ordered ? 'ordered' : 'unordered'}`}>
          {(block.items || []).map((item, iIdx) => (
            <li key={iIdx}>{typeof item === 'string' ? item : item.text}</li>
          ))}
        </ListTag>
      )
    }

    case 'blockquote':
      return (
        <blockquote key={index} className="prose-quote">
          <p>{block.quote || block.text}</p>
          {block.attribution && <cite>— {block.attribution}</cite>}
        </blockquote>
      )

    case 'code':
      return (
        <div key={index} className="prose-code-wrapper">
          {block.filename && <div className="prose-code-header">{block.filename}</div>}
          <pre className="prose-code-block" data-lang={block.language || 'text'}>
            <code>{block.code}</code>
          </pre>
        </div>
      )

    case 'callout': {
      const tone = block.tone || 'note'
      const Icon = tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
      return (
        <aside key={index} className={`prose-callout tone-${tone}`} role="note">
          <div className="prose-callout-header">
            <Icon size={16} className="prose-callout-icon" aria-hidden="true" />
            <strong className="prose-callout-title">{block.title || 'Note'}</strong>
          </div>
          <p className="prose-callout-body">{block.text}</p>
        </aside>
      )
    }

    case 'image':
      return (
        <figure key={index} className="prose-figure">
          <img
            src={block.src}
            alt={block.alt || ''}
            width={block.width || 800}
            height={block.height || 450}
            loading="lazy"
            decoding="async"
            className="prose-img"
          />
          {block.caption && <figcaption className="prose-caption">{block.caption}</figcaption>}
        </figure>
      )
  }
}

export function ArticleProse({ sections }) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return null
  }

  return (
    <div className="insight-prose">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="prose-section">
          {section.heading && (
            <h2 className="prose-section-h2">
              <a href={`#${section.id}`} className="prose-anchor-link" aria-label={`Link to section: ${section.heading}`}>
                #
              </a>
              <span>{section.heading}</span>
            </h2>
          )}
          <div className="prose-section-body">
            {(section.content || []).map((block, bIdx) => renderBlock(block, bIdx))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default ArticleProse
