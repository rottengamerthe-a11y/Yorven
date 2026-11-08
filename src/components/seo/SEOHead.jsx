import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getRouteMeta } from '../../data/seoData'

function setOrCreateMeta(selector, attribute, value) {
  let element = document.querySelector(selector)
  if (!element) {
    element = document.createElement('meta')
    if (selector.startsWith('meta[name="')) {
      const name = selector.match(/meta\[name="([^"]+)"\]/)[1]
      element.setAttribute('name', name)
    } else if (selector.startsWith('meta[property="')) {
      const prop = selector.match(/meta\[property="([^"]+)"\]/)[1]
      element.setAttribute('property', prop)
    }
    document.head.appendChild(element)
  }
  element.setAttribute(attribute, value)
}

function setOrCreateLink(selector, rel, href) {
  let element = document.querySelector(selector)
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    document.head.appendChild(element)
  }
  element.setAttribute('href', href)
}

export function SEOHead() {
  const { pathname } = useLocation()

  useEffect(() => {
    const meta = getRouteMeta(pathname)

    // Document Title
    document.title = meta.title

    // Standard SEO Meta
    setOrCreateMeta('meta[name="description"]', 'content', meta.description)
    setOrCreateMeta('meta[name="robots"]', 'content', meta.robots || 'index, follow')
    setOrCreateLink('link[rel="canonical"]', 'canonical', meta.canonical)

    // Open Graph
    setOrCreateMeta('meta[property="og:title"]', 'content', meta.title)
    setOrCreateMeta('meta[property="og:description"]', 'content', meta.description)
    setOrCreateMeta('meta[property="og:url"]', 'content', meta.canonical)
    setOrCreateMeta('meta[property="og:type"]', 'content', meta.ogType || 'website')
    setOrCreateMeta('meta[property="og:image"]', 'content', meta.ogImage)
    setOrCreateMeta('meta[property="og:site_name"]', 'content', 'Yorven')

    // Twitter Card
    setOrCreateMeta('meta[name="twitter:card"]', 'content', 'summary_large_image')
    setOrCreateMeta('meta[name="twitter:title"]', 'content', meta.title)
    setOrCreateMeta('meta[name="twitter:description"]', 'content', meta.description)
    setOrCreateMeta('meta[name="twitter:image"]', 'content', meta.ogImage)

    // JSON-LD Structured Data
    let jsonLdScript = document.getElementById('yorven-page-jsonld')
    if (!jsonLdScript) {
      jsonLdScript = document.createElement('script')
      jsonLdScript.id = 'yorven-page-jsonld'
      jsonLdScript.type = 'application/ld+json'
      document.head.appendChild(jsonLdScript)
    }

    if (meta.schema && meta.schema.length > 0) {
      jsonLdScript.textContent = JSON.stringify(
        meta.schema.length === 1 ? meta.schema[0] : meta.schema
      )
    } else {
      jsonLdScript.textContent = ''
    }
  }, [pathname])

  return null
}

export default SEOHead
