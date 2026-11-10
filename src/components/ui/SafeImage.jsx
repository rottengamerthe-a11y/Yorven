import { useState, useEffect } from 'react'

/**
 * SafeImage: Renders an <img> with fixed aspect ratio box and an onError
 * fallback tile ("Preview unavailable") to guarantee layout stability if an asset fails.
 */
export function SafeImage({
  src,
  alt = '',
  className = '',
  width,
  height,
  aspectRatio,
  fallbackText = 'Preview unavailable',
  loading,
  decoding,
  onError,
  style = {},
  fallbackClassName = '',
  fallbackStyle = {},
  ...rest
}) {
  const [hasError, setHasError] = useState(false)

  // Reset error state when the src changes (e.g. carousel slide change)
  useEffect(() => {
    setHasError(false)
  }, [src])

  const computedAspect = aspectRatio || (width && height ? `${width} / ${height}` : undefined)

  if (hasError) {
    return (
      <div
        className={`img-fallback-tile ${fallbackClassName} ${className}`.trim()}
        style={{
          aspectRatio: computedAspect,
          ...fallbackStyle,
          ...style
        }}
        role="img"
        aria-label={`${alt || 'Image'} (${fallbackText})`}
      >
        <div className="img-fallback-inner">
          <span className="img-fallback-icon" aria-hidden="true">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </span>
          <span className="img-fallback-text">{fallbackText}</span>
        </div>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      style={{
        aspectRatio: computedAspect,
        ...style
      }}
      onError={(e) => {
        setHasError(true)
        if (typeof onError === 'function') {
          onError(e)
        }
      }}
      {...rest}
    />
  )
}

export default SafeImage
