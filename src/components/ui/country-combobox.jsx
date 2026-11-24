import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check, Globe } from 'lucide-react'
import { COUNTRIES } from '../../data/countries'

export function CountryCombobox({
  value = '',
  onChange,
  error = '',
  id = 'contact-country',
  name = 'country',
  required = true,
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const searchInputRef = useRef(null)
  const triggerRef = useRef(null)

  const selectedCountry = COUNTRIES.find((c) => c.name === value || c.code === value)

  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus({ preventScroll: true })
    }
  }, [isOpen])

  function handleSelect(country) {
    onChange?.(country.name)
    setIsOpen(false)
    setSearch('')
    triggerRef.current?.focus({ preventScroll: true })
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setIsOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    } else if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault()
      setIsOpen(true)
    }
  }

  return (
    <div
      ref={containerRef}
      className={`country-combobox-wrap relative ${className}`}
      onKeyDown={handleKeyDown}
    >
      <div className="field-header flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="field-label text-[13px] font-semibold text-[#c8dacd]">
          Country of Residence {required && <span className="text-[#D7ED83]">*</span>}
        </label>
      </div>

      <p id={`${id}-desc`} className="field-description text-[12px] text-[#8fa897] mb-2">
        Select your country of residence.
      </p>

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${id}-listbox`}
        aria-describedby={`${id}-desc ${error ? `${id}-error` : ''}`}
        aria-invalid={error ? 'true' : undefined}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`country-trigger ${error ? 'has-error' : ''}`}
      >
        <Globe size={18} className="country-trigger-globe" />
        <span className="country-trigger-label">
          {selectedCountry ? selectedCountry.name : 'Select a country'}
        </span>
        <ChevronDown
          size={14}
          className={`country-trigger-chevron ${isOpen ? 'is-open' : ''}`}
        />
      </button>

      {/* Hidden input for standard forms */}
      <input type="hidden" name={name} value={value} />

      {/* Searchable Dropdown Popup */}
      {isOpen && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          data-lenis-prevent="true"
          className="country-dropdown"
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Search box inside dropdown */}
          <div className="country-search-wrap">
            <Search size={15} className="country-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search countries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="country-search-input"
            />
          </div>

          {/* Country Options list */}
          <div className="country-options-scroll" data-lenis-prevent="true">
            {filteredCountries.length === 0 ? (
              <div className="country-no-results">
                No country found matching "{search}"
              </div>
            ) : (
              filteredCountries.map((c) => {
                const isSelected = c.name === value
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(c)}
                    className={`country-option-item ${isSelected ? 'selected' : ''}`}
                  >
                    <span>{c.name}</span>
                    {isSelected && <Check size={15} className="country-option-check" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Scoped CSS for dropdown panel, search input, and option items */}
      <style>{`
        .country-combobox-wrap {
          position: relative;
          width: 100%;
        }
        .country-trigger {
          display: flex !important;
          width: 100% !important;
          align-items: center !important;
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
        .country-trigger:hover {
          border-color: rgba(215, 237, 131, 0.4);
        }
        .country-trigger:focus-visible {
          outline: none;
          border-color: #D7ED83;
          box-shadow: 0 0 0 1px #D7ED83;
        }
        .country-trigger.has-error {
          border-color: #ff6b6b;
          box-shadow: 0 0 0 1px #ff6b6b;
        }
        .country-trigger-globe {
          width: 18px !important;
          height: 18px !important;
          flex-shrink: 0 !important;
          color: #8fa897;
          display: block;
        }
        .country-trigger-label {
          flex: 1 !important;
          min-width: 0 !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          line-height: 1 !important;
          font-size: 14px;
          color: #F4F7F6 !important;
        }
        .country-trigger-chevron {
          width: 14px !important;
          height: 14px !important;
          flex-shrink: 0 !important;
          margin-left: auto !important;
          color: #F4F7F6 !important;
          display: block;
          transition: transform 0.2s ease;
        }
        .country-trigger-chevron.is-open {
          transform: rotate(180deg);
        }
        .country-dropdown {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 6px);
          z-index: 100;
          max-height: 320px;
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
        }
        .country-search-wrap {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          padding: 10px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(10, 30, 28, 0.96);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
        .country-search-icon {
          position: absolute;
          left: 26px;
          top: 50%;
          transform: translateY(-50%);
          color: #8fa897;
          pointer-events: none;
          z-index: 3;
        }
        .country-search-input {
          display: block;
          width: 100%;
          padding: 8px 12px 8px 40px !important;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #F4F7F6;
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
        }
        .country-search-input:focus {
          border-color: #D7ED83;
          background: rgba(255, 255, 255, 0.10);
        }
        .country-search-input::placeholder {
          color: rgba(244, 247, 246, 0.45);
        }
        .country-options-scroll {
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .country-option-item {
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
          font-size: 13px;
          line-height: 1.4;
          box-sizing: border-box !important;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .country-option-item:hover,
        .country-option-item.selected {
          background: rgba(255, 255, 255, 0.10) !important;
          color: #FFFFFF !important;
        }
        .country-option-item.selected {
          font-weight: 600;
        }
        .country-option-check {
          color: #D7ED83;
          flex-shrink: 0;
        }
        .country-no-results {
          padding: 14px;
          text-align: center;
          font-size: 13px;
          color: rgba(244, 247, 246, 0.6);
        }
      `}</style>

      {/* Inline Validation Error Message */}
      {error && (
        <p id={`${id}-error`} className="field-error text-[12px] text-[#ff6b6b] mt-1.5 flex items-center gap-1 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
