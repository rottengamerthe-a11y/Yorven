import React, { useState, useId } from 'react';

/**
 * Responsive, zero-dependency SVG Time-Series Chart
 * Visualizes daily SEO metrics with clear axes, date labels, and interactive tooltips.
 */
export function TimeSeriesChart({
  data = [],
  xKey = 'date',
  yKey = 'value',
  label = 'Metric',
  color = '#087c48',
  secondaryKey = null,
  secondaryLabel = null,
  secondaryColor = '#315b55',
  height = 240,
  yFormatter = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString()),
  isRate = false
}) {
  const chartId = useId();
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty-state" style={{ height }}>
        <span>No time-series data available for selected range</span>
      </div>
    );
  }

  const padding = { top: 20, right: 24, bottom: 36, left: 48 };
  const width = 800; // SVG viewBox coordinate system width
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Compute domain bounds
  const primaryValues = data.map(d => Number(d[yKey]) || 0);
  const secondaryValues = secondaryKey ? data.map(d => Number(d[secondaryKey]) || 0) : [];
  const allValues = [...primaryValues, ...secondaryValues];

  const maxVal = Math.max(1, Math.max(...allValues, 0));
  const minVal = 0;

  // Scale functions
  const getX = (index) => {
    if (data.length <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (data.length - 1)) * innerWidth;
  };

  const getY = (val) => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    const normalized = (clamped - minVal) / (maxVal - minVal);
    return padding.top + innerHeight - normalized * innerHeight;
  };

  // Generate SVG path strings
  const buildPath = (values) => {
    return values.reduce((pathStr, val, idx) => {
      const x = getX(idx);
      const y = getY(val);
      return idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${pathStr} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, '');
  };

  const primaryPath = buildPath(primaryValues);
  const secondaryPath = secondaryKey ? buildPath(secondaryValues) : null;

  // Area under curve for primary series
  const areaPath = `${primaryPath} L ${getX(data.length - 1).toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} L ${getX(0).toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} Z`;

  // Y-axis grid ticks (4 intervals)
  const yTicks = [0, 0.33, 0.66, 1].map(ratio => {
    const tickVal = isRate ? (minVal + (maxVal - minVal) * ratio) : Math.round(minVal + (maxVal - minVal) * ratio);
    return {
      value: tickVal,
      y: getY(tickVal)
    };
  });

  // X-axis date labels (show ~5-7 dates evenly spaced)
  const xStep = Math.max(1, Math.floor(data.length / 6));
  const xTicks = data
    .map((d, idx) => ({ date: d[xKey], index: idx }))
    .filter((_, idx) => idx % xStep === 0 || idx === data.length - 1);

  const activeItem = hoverIndex !== null && data[hoverIndex] ? data[hoverIndex] : null;

  return (
    <div className="time-series-container">
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-indicator" style={{ backgroundColor: color }} />
          <span className="legend-label">{label}</span>
        </div>
        {secondaryKey && (
          <div className="legend-item">
            <span className="legend-indicator" style={{ backgroundColor: secondaryColor }} />
            <span className="legend-label">{secondaryLabel || secondaryKey}</span>
          </div>
        )}
        {activeItem && (
          <div className="chart-active-tooltip-badge">
            <strong>{activeItem[xKey]}:</strong> {label} = {yFormatter(activeItem[yKey])}
            {secondaryKey && ` | ${secondaryLabel || secondaryKey} = ${yFormatter(activeItem[secondaryKey])}`}
          </div>
        )}
      </div>

      <div className="svg-wrapper" style={{ position: 'relative', width: '100%' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="time-series-svg"
          role="img"
          aria-label={`${label} time-series chart`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={`gradient-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines & Y-axis labels */}
          {yTicks.map((t, idx) => (
            <g key={`y-tick-${idx}`}>
              <line
                x1={padding.left}
                y1={t.y}
                x2={width - padding.right}
                y2={t.y}
                stroke="var(--line, #c4c9ba)"
                strokeDasharray="3 3"
                strokeWidth="1"
                opacity="0.4"
              />
              <text
                x={padding.left - 8}
                y={t.y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--teal-soft, #315b55)"
                fontFamily="var(--mono, monospace)"
              >
                {yFormatter(t.value)}
              </text>
            </g>
          ))}

          {/* Primary Area Fill */}
          <path d={areaPath} fill={`url(#gradient-${chartId})`} />

          {/* Secondary Line */}
          {secondaryPath && (
            <path
              d={secondaryPath}
              fill="none"
              stroke={secondaryColor}
              strokeWidth="2"
              strokeDasharray="4 2"
            />
          )}

          {/* Primary Line */}
          <path
            d={primaryPath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* X-axis date labels */}
          {xTicks.map((t) => (
            <text
              key={`x-tick-${t.index}`}
              x={getX(t.index)}
              y={height - 10}
              textAnchor="middle"
              fontSize="11"
              fill="var(--teal-soft, #315b55)"
              fontFamily="var(--mono, monospace)"
            >
              {t.date ? String(t.date).slice(5) : ''}
            </text>
          ))}

          {/* Interactive vertical hover marker */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={padding.top}
                x2={getX(hoverIndex)}
                y2={padding.top + innerHeight}
                stroke="var(--teal, #082d2c)"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(primaryValues[hoverIndex])}
                r="4.5"
                fill={color}
                stroke="#fff"
                strokeWidth="2"
              />
              {secondaryKey && (
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(secondaryValues[hoverIndex])}
                  r="4"
                  fill={secondaryColor}
                  stroke="#fff"
                  strokeWidth="2"
                />
              )}
            </g>
          )}

          {/* Invisible interactive hover slices */}
          {data.map((_, idx) => {
            const x = getX(idx);
            const sliceWidth = data.length > 1 ? innerWidth / data.length : innerWidth;
            return (
              <rect
                key={`slice-${idx}`}
                x={x - sliceWidth / 2}
                y={padding.top}
                width={sliceWidth}
                height={innerHeight}
                fill="transparent"
                style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setHoverIndex(idx)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
