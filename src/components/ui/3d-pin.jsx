import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'

/**
 * Pin3D / PinContainer
 * Selective 3D perspective pin effect for featured case studies.
 * - Leans card backwards on hover/focus
 * - Light beam rising from the center
 * - Concentric expanding rings at the base
 * - Floating project badge
 * - Entire component functions as an accessible link
 * - Respects prefers-reduced-motion
 */
export function Pin3D({
  children,
  title = 'Explore Case Study',
  to,
  href,
  as = null,
  className = '',
  containerClassName = '',
  ...props
}) {
  const [isHovered, setIsHovered] = useState(false)
  const isRouter = Boolean(to)

  const handleMouseEnter = () => setIsHovered(true)
  const handleMouseLeave = () => setIsHovered(false)
  const handleFocus = () => setIsHovered(true)
  const handleBlur = () => setIsHovered(false)

  const Tag = as || (isRouter ? Link : href ? 'a' : 'div')
  const linkProps = Tag === Link ? { to } : Tag === 'a' ? { href } : {}

  return (
    <Tag
      {...linkProps}
      className={`pin-3d-root group relative block ${containerClassName}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      data-slot="3d-pin"
      aria-label={typeof title === 'string' ? title : 'View featured project'}
      {...props}
    >
      {/* 3D Perspective Canvas Container */}
      <div
        className="pin-3d-perspective relative transition-transform duration-500 ease-out"
        style={{
          perspective: '1000px',
        }}
      >
        {/* Tilting card body */}
        <div
          className={`pin-3d-card relative transition-all duration-500 ease-out ${
            isHovered
              ? 'pin-card-tilted shadow-2xl'
              : 'shadow-lg'
          } ${className}`}
        >
          {children}

          {/* Concentric rings at base on hover */}
          <div
            className={`pin-rings-wrap absolute inset-0 pointer-events-none flex items-center justify-center transition-opacity duration-300 ${
              isHovered ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden="true"
          >
            <div className="pin-ring ring-1" />
            <div className="pin-ring ring-2" />
            <div className="pin-ring ring-3" />
          </div>
        </div>

        {/* 3D Rising Beam & Floating Badge */}
        <div
          className={`pin-beam-stage pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center transition-opacity duration-300 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ height: '100%' }}
          aria-hidden="true"
        >
          {/* Floating Pill Label */}
          {to && Tag === 'div' ? (
            <Link
              to={to}
              className="pin-floating-badge pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#082D2C]/95 border border-[#D7ED83]/60 text-[#D7ED83] hover:text-[#082D2C] hover:bg-[#D7ED83] font-mono text-[12px] tracking-wide shadow-xl backdrop-blur-md transition-colors"
            >
              <span>{title}</span>
              <ArrowUpRight size={13} />
            </Link>
          ) : (
            <div className="pin-floating-badge flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#082D2C]/95 border border-[#D7ED83]/60 text-[#D7ED83] font-mono text-[12px] tracking-wide shadow-xl backdrop-blur-md">
              <span>{title}</span>
              <ArrowUpRight size={13} className="text-[#D7ED83]" />
            </div>
          )}

          {/* Light Beam Line */}
          <div className="pin-light-beam w-[2px] flex-1 bg-gradient-to-b from-[#D7ED83] via-[#087C48] to-transparent my-1" />

          {/* Center Glow Point */}
          <div className="pin-glow-dot w-2 h-2 rounded-full bg-[#D7ED83] shadow-[0_0_12px_#D7ED83]" />
        </div>
      </div>
    </Tag>
  )
}

// Alias for Aceternity-style compatibility
export const PinContainer = Pin3D
