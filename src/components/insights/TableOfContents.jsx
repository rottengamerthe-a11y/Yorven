import React, { useState } from 'react'
import { ChevronDown, List } from 'lucide-react'

export function TableOfContents({ items = [] }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!Array.isArray(items) || items.length === 0) {
    return null
  }

  function handleLinkClick(e, id) {
    e.preventDefault()
    setMobileOpen(false)
    const target = document.getElementById(id)
    if (!target) return

    if (window.location.hash !== `#${id}`) {
      window.history.pushState(null, '', `#${id}`)
    }

    if (window.__lenis) {
      window.__lenis.scrollTo(target, { offset: -96, duration: 1.0 })
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <>
      {/* Mobile Collapsible Drawer/Accordion */}
      <div className="insight-toc-mobile-wrap">
        <button
          type="button"
          className="insight-toc-mobile-toggle"
          aria-expanded={mobileOpen}
          aria-controls="mobile-toc-list"
          onClick={() => setMobileOpen(prev => !prev)}
        >
          <span className="itmt-left">
            <List size={15} aria-hidden="true" />
            <span>Table of contents ({items.length})</span>
          </span>
          <ChevronDown
            size={16}
            className={`itmt-chevron ${mobileOpen ? 'open' : ''}`}
            aria-hidden="true"
          />
        </button>

        {mobileOpen && (
          <nav id="mobile-toc-list" className="insight-toc-mobile-panel" aria-label="Table of contents">
            <ol className="it-list">
              {items.map((item) => (
                <li key={item.id} className={`it-item level-${item.level || 2}`}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => handleLinkClick(e, item.id)}
                    className="it-link"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>

      {/* Desktop Sticky Sidebar Navigation */}
      <nav className="insight-toc-desktop" aria-label="Table of contents">
        <span className="it-heading">On this page</span>
        <ol className="it-list">
          {items.map((item) => (
            <li key={item.id} className={`it-item level-${item.level || 2}`}>
              <a
                href={`#${item.id}`}
                onClick={(e) => handleLinkClick(e, item.id)}
                className="it-link"
              >
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  )
}

export default TableOfContents
