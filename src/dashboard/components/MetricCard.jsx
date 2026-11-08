import React from 'react';

/**
 * MetricCard component for displaying key SEO performance indicators.
 * Handles null/undefined data safely without crashing or fabricating values.
 */
export function MetricCard({
  title,
  value,
  formattedValue,
  unit = '',
  subtitle = null,
  icon: Icon = null,
  disclaimer = null,
  badge = null,
  badgeType = 'default', // 'default' | 'success' | 'warning' | 'info'
  isLoading = false
}) {
  const displayValue = () => {
    if (isLoading) return '...';
    if (formattedValue !== undefined && formattedValue !== null) return formattedValue;
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    return String(value);
  };

  const getBadgeClass = () => {
    switch (badgeType) {
      case 'success':
        return 'badge-success';
      case 'warning':
        return 'badge-warning';
      case 'info':
        return 'badge-info';
      default:
        return 'badge-default';
    }
  };

  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        {Icon && <Icon className="metric-icon" size={18} aria-hidden="true" />}
      </div>

      <div className="metric-value-row">
        <span className="metric-value">
          {displayValue()}
          {unit && <span className="metric-unit">{unit}</span>}
        </span>
        {badge && <span className={`metric-badge ${getBadgeClass()}`}>{badge}</span>}
      </div>

      {subtitle && <div className="metric-subtitle">{subtitle}</div>}
      {disclaimer && <div className="metric-disclaimer">{disclaimer}</div>}
    </div>
  );
}
