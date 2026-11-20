import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ArrowRight, ArrowDownRight } from 'lucide-react'

/**
 * ButtonRounded
 * Studio pill-shaped call-to-action button.
 * - Fully rounded ends (rounded-full)
 * - Directional arrow micro-interaction
 * - Primary, secondary (outline), and accent (lime) variants
 * - Handles both router Link and native button/anchor
 */
export function ButtonRounded({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'accent' | 'ghost'
  size = 'md', // 'sm' | 'md' | 'lg'
  arrow = 'up-right', // 'up-right' | 'right' | 'down-right' | 'none'
  to,
  href,
  onClick,
  className = '',
  disabled = false,
  type = 'button',
  icon: CustomIcon = null,
  ...props
}) {
  const isRouterLink = Boolean(to)
  const isAnchor = Boolean(href && !to)

  const sizeClasses = {
    sm: 'h-10 px-5 text-[13px] gap-2.5',
    md: 'h-12 px-6 text-[14px] sm:text-[15px] gap-3',
    lg: 'h-14 px-8 text-[15px] sm:text-[16px] gap-3.5',
  }[size] || 'h-12 px-6 text-[15px] gap-3'

  const variantClasses = {
    primary:
      'btn-rounded-primary bg-[#082D2C] text-[#F4F0E6] hover:bg-[#0d3a37] border border-[rgba(244,240,230,0.18)] shadow-sm',
    accent:
      'btn-rounded-accent bg-[#D7ED83] text-[#082D2C] font-bold hover:bg-[#c9eba0] border border-[#D7ED83] shadow-md shadow-[#d7ed83]/10',
    secondary:
      'btn-rounded-secondary bg-transparent text-[#F4F0E6] border border-[rgba(244,240,230,0.25)] hover:border-[#D7ED83] hover:text-[#D7ED83] hover:bg-[rgba(215,237,131,0.04)]',
    ghost:
      'btn-rounded-ghost bg-transparent text-[#F4F0E6] hover:text-[#D7ED83] hover:bg-[rgba(244,240,230,0.06)]',
  }[variant] || ''

  const ArrowIcon =
    arrow === 'up-right'
      ? ArrowUpRight
      : arrow === 'right'
      ? ArrowRight
      : arrow === 'down-right'
      ? ArrowDownRight
      : null

  const arrowMotionClass = {
    'up-right': 'group-hover:translate-x-0.5 group-hover:-translate-y-0.5',
    'right': 'group-hover:translate-x-1',
    'down-right': 'group-hover:translate-x-0.5 group-hover:translate-y-0.5',
  }[arrow] || ''

  const baseClasses = `btn-rounded btn-rounded-${variant} btn-rounded-${size} ${className}`.trim()

  const content = (
    <>
      <span className="btn-label flex items-center leading-none">{children}</span>
      {(CustomIcon || ArrowIcon) && (
        <span
          className={`btn-arrow-circle flex items-center justify-center transition-transform duration-200 ${arrowMotionClass}`}
          aria-hidden="true"
        >
          {CustomIcon ? (
            <CustomIcon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} strokeWidth={2} />
          ) : (
            <ArrowIcon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} strokeWidth={2} />
          )}
        </span>
      )}
    </>
  )

  if (isRouterLink) {
    return (
      <Link to={to} className={baseClasses} onClick={onClick} {...props}>
        {content}
      </Link>
    )
  }

  if (isAnchor) {
    return (
      <a href={href} className={baseClasses} onClick={onClick} {...props}>
        {content}
      </a>
    )
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={baseClasses}
      onClick={onClick}
      {...props}
    >
      {content}
    </button>
  )
}
