import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ArrowRight, ArrowDownRight, ArrowLeft } from 'lucide-react'

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
      'btn-rounded-primary glass-btn text-[#F4F7F6] border border-white/10 shadow-sm',
    accent:
      'btn-rounded-accent bg-[#D7ED83] text-[#0a1210] font-bold hover:bg-[#dff294] border border-[#D7ED83] shadow-md shadow-[#d7ed83]/20',
    secondary:
      'btn-rounded-secondary glass-btn text-[#F4F7F6] border border-white/10 hover:border-white/20',
    ghost:
      'btn-rounded-ghost bg-transparent text-[#F4F7F6] hover:text-[#D7ED83] hover:bg-white/[0.06]',
  }[variant] || ''

  const ArrowIcon =
    arrow === 'up-right'
      ? ArrowUpRight
      : arrow === 'right'
      ? ArrowRight
      : arrow === 'down-right'
      ? ArrowDownRight
      : arrow === 'left'
      ? ArrowLeft
      : null

  const isLeft = arrow === 'left'

  const arrowMotionClass = {
    'up-right': 'group-hover:translate-x-0.5 group-hover:-translate-y-0.5',
    'right': 'group-hover:translate-x-1',
    'down-right': 'group-hover:translate-x-0.5 group-hover:translate-y-0.5',
    'left': 'group-hover:-translate-x-1',
  }[arrow] || ''

  const baseClasses = `btn-rounded btn-rounded-${variant} btn-rounded-${size} ${isLeft ? 'btn-rounded-has-left-arrow' : ''} group ${className}`.trim()

  const arrowNode = (CustomIcon || ArrowIcon) && (
    <span
      className={`btn-arrow-icon ${isLeft ? 'btn-arrow-left' : 'btn-arrow-circle'} inline-flex items-center justify-center transition-transform duration-200 ${arrowMotionClass}`}
      aria-hidden="true"
    >
      {CustomIcon ? (
        <CustomIcon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} strokeWidth={2} />
      ) : (
        <ArrowIcon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} strokeWidth={2} />
      )}
    </span>
  )

  const content = (
    <>
      {isLeft && arrowNode}
      <span className="btn-label inline-flex items-center leading-none">{children}</span>
      {!isLeft && arrowNode}
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
