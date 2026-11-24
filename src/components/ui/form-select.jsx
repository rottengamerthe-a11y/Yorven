import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export function FormSelect({
  id,
  name,
  value = '',
  onChange,
  options = [],
  placeholder = 'Select an option',
  required = false,
  disabled = false,
  error = '',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const listboxRef = useRef(null)

  // Normalize options to [{ value, label }]
  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  )

  const selectedOption = normalizedOptions.find((opt) => opt.value === value)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-scroll to focused option
  useEffect(() => {
    if (isOpen && listboxRef.current && focusedIndex >= 0) {
      const items = listboxRef.current.querySelectorAll('.custom-select-option')
      if (items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [isOpen, focusedIndex])

  function handleSelect(val) {
    onChange?.(val)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (disabled) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        const curIdx = normalizedOptions.findIndex((opt) => opt.value === value)
        setFocusedIndex(curIdx >= 0 ? curIdx : 0)
      } else {
        setFocusedIndex((prev) => (prev + 1) % normalizedOptions.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        const curIdx = normalizedOptions.findIndex((opt) => opt.value === value)
        setFocusedIndex(curIdx >= 0 ? curIdx : normalizedOptions.length - 1)
      } else {
        setFocusedIndex((prev) => (prev - 1 + normalizedOptions.length) % normalizedOptions.length)
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (isOpen && focusedIndex >= 0 && normalizedOptions[focusedIndex]) {
        e.preventDefault()
        handleSelect(normalizedOptions[focusedIndex].value)
      } else if (!isOpen) {
        e.preventDefault()
        setIsOpen(true)
        const curIdx = normalizedOptions.findIndex((opt) => opt.value === value)
        setFocusedIndex(curIdx >= 0 ? curIdx : 0)
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault()
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`custom-select-wrap ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${id}-listbox`}
        aria-invalid={error ? 'true' : undefined}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev)
            if (!isOpen) {
              const curIdx = normalizedOptions.findIndex((opt) => opt.value === value)
              setFocusedIndex(curIdx >= 0 ? curIdx : 0)
            }
          }
        }}
        className={`custom-select-trigger ${error ? 'has-error' : ''} ${!selectedOption ? 'is-placeholder' : ''}`}
      >
        <span className="custom-select-label">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`custom-select-chevron ${isOpen ? 'is-open' : ''}`}
        />
      </button>

      {/* Hidden input for form submission */}
      {name && <input type="hidden" name={name} value={value} required={required} />}

      {/* Custom Dropdown Popup (Role listbox, fully themed) */}
      {isOpen && (
        <div
          ref={listboxRef}
          id={`${id}-listbox`}
          role="listbox"
          data-lenis-prevent="true"
          className="custom-select-dropdown"
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="custom-select-options-scroll" data-lenis-prevent="true">
            {normalizedOptions.map((opt, idx) => {
              const isSelected = opt.value === value
              const isFocused = idx === focusedIndex
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  className={`custom-select-option ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                >
                  <span className="custom-select-option-text">{opt.label}</span>
                  {isSelected && <Check size={15} className="custom-select-check" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Scoped CSS for custom select dropdown */}
      <style>{`
        .custom-select-wrap {
          position: relative;
          width: 100%;
        }
        .custom-select-trigger {
          display: flex !important;
          width: 100% !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 10px !important;
          padding: 0 14px !important;
          min-height: 48px !important;
          height: 48px;
          border-radius: 8px;
          text-align: left;
          background: #051c1a;
          color: #F4F7F6;
          border: 1px solid rgba(244, 240, 230, 0.14);
          cursor: pointer;
          box-sizing: border-box;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          overflow: hidden;
        }
        .custom-select-trigger.is-placeholder .custom-select-label {
          color: rgba(244, 247, 246, 0.65) !important;
        }
        .custom-select-trigger:hover {
          border-color: rgba(215, 237, 131, 0.4);
        }
        .custom-select-trigger:focus-visible {
          outline: none;
          border-color: #D7ED83;
          box-shadow: 0 0 0 1px #D7ED83;
        }
        .custom-select-trigger.has-error {
          border-color: #ff6b6b;
          box-shadow: 0 0 0 1px #ff6b6b;
        }
        .custom-select-label {
          flex: 1 !important;
          min-width: 0 !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          line-height: 1 !important;
          font-size: 14px;
          color: #F4F7F6;
        }
        .custom-select-chevron {
          width: 14px !important;
          height: 14px !important;
          flex-shrink: 0 !important;
          margin-left: auto !important;
          color: #F4F7F6 !important;
          display: block;
          transition: transform 0.2s ease;
        }
        .custom-select-chevron.is-open {
          transform: rotate(180deg);
        }
        .custom-select-dropdown {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 6px);
          z-index: 100;
          max-height: 280px;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          border-radius: 16px;
          background: rgba(10, 30, 28, 0.94);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
          box-sizing: border-box;
          padding: 6px;
        }
        .custom-select-options-scroll {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .custom-select-option {
          display: flex !important;
          align-items: center;
          justify-content: space-between;
          width: 100% !important;
          text-align: left !important;
          background: transparent !important;
          color: #F4F7F6 !important;
          padding: 10px 14px !important;
          border: none !important;
          border-radius: 8px !important;
          cursor: pointer;
          font-size: 14px;
          line-height: 1.4;
          box-sizing: border-box !important;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .custom-select-option:hover,
        .custom-select-option.focused,
        .custom-select-option.selected {
          background: rgba(255, 255, 255, 0.10) !important;
          color: #FFFFFF !important;
        }
        .custom-select-option.selected {
          font-weight: 600;
        }
        .custom-select-option-text {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .custom-select-check {
          color: #D7ED83;
          flex-shrink: 0;
          margin-left: 8px;
        }
      `}</style>
    </div>
  )
}
