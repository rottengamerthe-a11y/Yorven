import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import contactHandler from './api/contact.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Set server-side environment variables in process.env for contactHandler
  if (env.DISCORD_WEBHOOK_URL) process.env.DISCORD_WEBHOOK_URL = env.DISCORD_WEBHOOK_URL
  if (env.WEB3FORMS_ACCESS_KEY) process.env.WEB3FORMS_ACCESS_KEY = env.WEB3FORMS_ACCESS_KEY

  return {
    plugins: [
      react(),
      {
        name: 'api-contact-middleware',
        configureServer(server) {
          server.middlewares.use('/api/contact', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })

            req.on('end', async () => {
              try {
                const parsedBody = body ? JSON.parse(body) : {}
                const mockReq = { method: req.method, body: parsedBody, headers: req.headers }
                const mockRes = {
                  status(code) {
                    res.statusCode = code
                    return this
                  },
                  json(data) {
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(data))
                    return this
                  }
                }
                await contactHandler(mockReq, mockRes)
              } catch (err) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: err.message }))
              }
            })
          })
        }
      }
    ]
  }
})
