import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

const MotionHighlightContext = createContext(null)

/**
 * MotionHighlight
 * Provides a single shared sliding background indicator across sibling items.
 * Handles both pointer hover and keyboard focus with smooth layout animation.
 * Respects prefers-reduced-motion.
 */
export function MotionHighlight({
  children,
  className = '',
  indicatorClassName = '',
  activeValue = null,
  hover = true,
  ...props
}) {
  const containerRef = useRef(null)
  const [highlightRect, setHighlightRect] = useState(null)
  const [isHovered, setIsHovered] = useState(false)
  const itemRefs = useRef(new Map())

  const registerItem = useCallback((value, node) => {
    if (node) {
      itemRefs.current.set(value, node)
    } else {
      itemRefs.current.delete(value)
    }
  }, [])

  const updateRectForElement = useCallback((node) => {
    if (!containerRef.current || !node) {
      setHighlightRect(null)
      return
    }
    const containerRect = containerRef.current.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()

    setHighlightRect({
      left: nodeRect.left - containerRect.left,
      top: nodeRect.top - containerRect.top,
      width: nodeRect.width,
      height: nodeRect.height,
    })
  }, [])

  const highlightItem = useCallback((value) => {
    const node = itemRefs.current.get(value)
    if (node) {
      setIsHovered(true)
      updateRectForElement(node)
    }
  }, [updateRectForElement])

  const clearHighlight = useCallback(() => {
    setIsHovered(false)
    if (activeValue && itemRefs.current.has(activeValue)) {
      updateRectForElement(itemRefs.current.get(activeValue))
    } else {
      setHighlightRect(null)
    }
  }, [activeValue, updateRectForElement])

  // Initial and activeValue alignment
  useEffect(() => {
    if (activeValue && itemRefs.current.has(activeValue)) {
      updateRectForElement(itemRefs.current.get(activeValue))
    }
  }, [activeValue, updateRectForElement])

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => {
      if (activeValue && itemRefs.current.has(activeValue)) {
        updateRectForElement(itemRefs.current.get(activeValue))
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeValue, updateRectForElement])

  return (
    <MotionHighlightContext.Provider
      value={{
        registerItem,
        highlightItem,
        clearHighlight,
        activeValue,
      }}
    >
      <div
        ref={containerRef}
        data-slot="motion-highlight"
        className={`relative inline-flex items-center ${className}`}
        onPointerLeave={clearHighlight}
        {...props}
      >
        {highlightRect && (
          <span
            aria-hidden="true"
            data-slot="motion-highlight-indicator"
            className={`motion-highlight-pill pointer-events-none absolute ${indicatorClassName}`}
            style={{
              transform: `translate3d(${highlightRect.left}px, ${highlightRect.top}px, 0)`,
              width: `${highlightRect.width}px`,
              height: `${highlightRect.height}px`,
              opacity: isHovered || activeValue ? 1 : 0,
            }}
          />
        )}
        {children}
      </div>
    </MotionHighlightContext.Provider>
  )
}

/**
 * MotionHighlightItem
 * Individual interactive child wrapper.
 */
export function MotionHighlightItem({
  value,
  children,
  className = '',
  active = false,
  onClick,
  ...props
}) {
  const ctx = useContext(MotionHighlightContext)
  const itemRef = useRef(null)

  useEffect(() => {
    if (ctx && value) {
      ctx.registerItem(value, itemRef.current)
      return () => ctx.registerItem(value, null)
    }
  }, [ctx, value])

  const isCurrent = active || (ctx && ctx.activeValue === value)

  const handlePointerEnter = () => {
    if (ctx && value) ctx.highlightItem(value)
  }

  const handleFocus = () => {
    if (ctx && value) ctx.highlightItem(value)
  }

  const handleBlur = () => {
    if (ctx) ctx.clearHighlight()
  }

  if (React.isValidElement(children)) {
    return React.cloneElement(children, {
      ref: (node) => {
        itemRef.current = node
        const { ref } = children
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      'data-slot': 'motion-highlight-item',
      'data-highlighted': isCurrent ? 'true' : undefined,
      'data-active': isCurrent ? 'true' : undefined,
      'aria-current': isCurrent ? 'page' : undefined,
      onPointerEnter: (e) => {
        handlePointerEnter()
        children.props.onPointerEnter?.(e)
      },
      onFocus: (e) => {
        handleFocus()
        children.props.onFocus?.(e)
      },
      onBlur: (e) => {
        handleBlur()
        children.props.onBlur?.(e)
      },
      onClick: (e) => {
        onClick?.(e)
        children.props.onClick?.(e)
      },
    })
  }

  return (
    <div
      ref={itemRef}
      data-slot="motion-highlight-item"
      data-highlighted={isCurrent ? 'true' : undefined}
      data-active={isCurrent ? 'true' : undefined}
      className={`relative z-10 ${className}`}
      onPointerEnter={handlePointerEnter}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  )
}
