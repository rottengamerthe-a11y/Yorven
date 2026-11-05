import http from 'node:http'
import { createCanvas, joinSession } from '@github/copilot-sdk/extension'

const instances = new Map()
const defaultUrl = 'http://127.0.0.1:5173/'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function page(url) {
  const safeUrl = escapeHtml(url)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Yorven design review</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #061b1d; color: #f4f0e6; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; grid-template-rows: auto 1fr; background: radial-gradient(circle at 85% 0%, #17443b, transparent 38%), #061b1d; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 22px; border-bottom: 1px solid #315650; }
    h1 { margin: 0; font-size: 15px; letter-spacing: -.02em; }
    form { display: flex; gap: 8px; }
    input { width: min(42vw, 440px); border: 1px solid #41675f; background: #0c2b2a; color: #f4f0e6; border-radius: 4px; padding: 9px 10px; }
    button { border: 0; border-radius: 4px; padding: 9px 13px; background: #17b86b; color: #062d2b; font-weight: 700; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 2px solid #e5f58f; outline-offset: 3px; }
    main { padding: 18px; min-height: 0; }
    iframe { display: block; width: 100%; height: 100%; min-height: calc(100vh - 92px); border: 1px solid #315650; border-radius: 8px; background: #f4f0e6; }
    @media (max-width: 700px) { header { align-items: flex-start; flex-direction: column; } form, input { width: 100%; } }
  </style>
</head>
<body>
  <header>
    <h1>Yorven / live design review</h1>
    <form id="preview-form" aria-label="Preview URL">
      <label class="sr-only" for="preview-url">Preview URL</label>
      <input id="preview-url" type="url" required value="${safeUrl}" aria-describedby="preview-status">
      <button type="submit">Load preview</button>
    </form>
    <span id="preview-status" role="status">Preview ready</span>
  </header>
  <main><iframe id="preview" title="Yorven website preview" src="${safeUrl}"></iframe></main>
  <script>
    const form = document.querySelector('#preview-form')
    const input = document.querySelector('#preview-url')
    const frame = document.querySelector('#preview')
    const status = document.querySelector('#preview-status')
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (!input.reportValidity()) return
      frame.src = input.value
      status.textContent = 'Preview loaded'
    })
  </script>
</body>
</html>`
}

function startServer(url) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.method !== 'GET' || request.url !== '/') {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Not found')
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(page(url))
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, url: `http://127.0.0.1:${address.port}/` })
    })
  })
}

await joinSession({
  canvases: [
    createCanvas({
      id: 'yorven-design-review',
      displayName: 'Yorven design review',
      description: 'Preview the Yorven website while reviewing its responsive design and motion.',
      inputSchema: {
        type: 'object',
        properties: { previewUrl: { type: 'string', format: 'uri', default: defaultUrl } },
        additionalProperties: false
      },
      open: async ({ instanceId, input = {} }) => {
        const previewUrl = typeof input.previewUrl === 'string' && /^https?:\/\//.test(input.previewUrl) ? input.previewUrl : defaultUrl
        const current = instances.get(instanceId)
        if (current) {
          current.url = previewUrl
          return { title: 'Yorven design review', url: current.canvasUrl }
        }
        const running = await startServer(previewUrl)
        instances.set(instanceId, { ...running, canvasUrl: running.url })
        return { title: 'Yorven design review', url: running.url }
      },
      onClose: async (instanceId) => {
        const current = instances.get(instanceId)
        if (!current) return
        await new Promise((resolve) => current.server.close(resolve))
        instances.delete(instanceId)
      }
    })
  ]
})
