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
      searchInputRef.current.focus()
    }
  }, [isOpen])

  function handleSelect(country) {
    onChange?.(country.name)
    setIsOpen(false)
    setSearch('')
    triggerRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setIsOpen(false)
      triggerRef.current?.focus()
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
        className={`country-trigger flex items-center justify-between w-full h-12 px-4 rounded-[4px] text-left transition-all duration-200 ${
          error
            ? 'border-[#ff6b6b] bg-[#051c1a] text-[#F4F0E6] ring-1 ring-[#ff6b6b]'
            : 'border-[rgba(244,240,230,0.14)] bg-[#051c1a] text-[#F4F0E6] hover:border-[rgba(215,237,131,0.4)] focus:border-[#D7ED83] focus:ring-1 focus:ring-[#D7ED83]'
        } border`}
      >
        <span className="flex items-center gap-2 truncate">
          <Globe size={15} className="text-[#8fa897] flex-shrink-0" />
          {selectedCountry ? (
            <span className="text-[#F4F0E6] font-medium">{selectedCountry.name}</span>
          ) : (
            <span className="text-[#8fa897]/70 font-normal">Select a country</span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`text-[#8fa897] transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-[#D7ED83]' : ''
          }`}
        />
      </button>

      {/* Hidden input for standard forms */}
      <input type="hidden" name={name} value={value} />

      {/* Searchable Dropdown Popup */}
      {isOpen && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="country-dropdown absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-hidden rounded-[4px] border border-[rgba(244,240,230,0.18)] bg-[#072625] shadow-2xl backdrop-blur-xl"
        >
          {/* Search box inside dropdown */}
          <div className="search-wrap sticky top-0 z-10 flex items-center gap-2 p-2.5 border-b border-[rgba(244,240,230,0.1)] bg-[#072625]">
            <Search size={14} className="text-[#8fa897]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search countries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-[13px] text-[#F4F0E6] placeholder-[#8fa897]/60 outline-none"
            />
          </div>

          {/* Country Options list */}
          <div className="options-scroll max-h-48 overflow-y-auto py-1">
            {filteredCountries.length === 0 ? (
              <div className="p-3 text-center text-[13px] text-[#8fa897]">
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
                    className={`flex items-center justify-between w-full px-3.5 py-2 text-[13px] text-left transition-colors ${
                      isSelected
                        ? 'bg-[rgba(215,237,131,0.12)] text-[#D7ED83] font-semibold'
                        : 'text-[#c8dacd] hover:bg-[rgba(244,240,230,0.06)] hover:text-[#F4F0E6]'
                    }`}
                  >
                    <span>{c.name}</span>
                    {isSelected && <Check size={14} className="text-[#D7ED83]" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Inline Validation Error Message */}
      {error && (
        <p id={`${id}-error`} className="field-error text-[12px] text-[#ff6b6b] mt-1.5 flex items-center gap-1 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
