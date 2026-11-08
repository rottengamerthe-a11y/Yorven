import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from './main.jsx'

export function render(url) {
  const html = renderToString(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes />
    </MemoryRouter>
  )
  return { html }
}
