/**
 * Serverless Contact Handler: /api/contact
 * Handles studio alert dispatch (Discord Webhook) exclusively on the server side.
 * Server credentials remain strictly private and are never exposed to clients.
 */

// In-memory rate limiting: ip -> array of timestamps
const ipRateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 5

function isRateLimited(ip) {
  if (!ip) return false
  const now = Date.now()
  const timestamps = (ipRateLimitMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true
  }
  timestamps.push(now)
  ipRateLimitMap.set(ip, timestamps)
  return false
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Client IP determination
  const forwarded = req.headers?.['x-forwarded-for']
  const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown'

  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a few minutes before trying again.' })
  }

  const { name, business, email, type, budget, timeline, description, website } = req.body || {}

  // 1. Honeypot check for automated spam bots
  if (website) {
    return res.status(200).json({ success: true, message: 'Filtered' })
  }

  // 2. Required fields validation
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' })
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' })
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' })
  }

  const cleanName = name.trim()
  const cleanEmail = email.trim()
  const cleanDesc = description.trim()
  const cleanBusiness = (business || '').trim()
  const cleanType = (type || 'Custom Software').trim()
  const cleanBudget = (budget || 'Not specified').trim()
  const cleanTimeline = (timeline || 'Not specified').trim()

  // 3. Format and length bounds
  if (!EMAIL_REGEX.test(cleanEmail)) {
    return res.status(400).json({ error: 'Invalid email address format' })
  }
  if (cleanName.length > 100) {
    return res.status(400).json({ error: 'Name exceeds maximum length of 100 characters' })
  }
  if (cleanEmail.length > 120) {
    return res.status(400).json({ error: 'Email exceeds maximum length of 120 characters' })
  }
  if (cleanBusiness.length > 100) {
    return res.status(400).json({ error: 'Business name exceeds maximum length of 100 characters' })
  }
  if (cleanDesc.length > 5000) {
    return res.status(400).json({ error: 'Description exceeds maximum length of 5000 characters' })
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL

  if (!discordUrl) {
    console.warn('[Contact API] DISCORD_WEBHOOK_URL not configured on server.')
    return res.status(500).json({ error: 'Studio alert integration not configured. Please email projects@yorven.in.' })
  }

  try {
    const discordPayload = {
      username: 'Yorven Studio Leads',
      content: '🚨 **New Lead Alert: Call Request Received!**',
      embeds: [
        {
          title: `New Project Booking: ${cleanName}`,
          description: cleanDesc,
          color: 556104, // #087c48
          fields: [
            { name: '👤 Client Name', value: cleanName, inline: true },
            { name: '🏢 Venture / Business', value: cleanBusiness || 'Not specified', inline: true },
            { name: '✉️ Work Email', value: `[${cleanEmail}](mailto:${cleanEmail})`, inline: true },
            { name: '🛠️ Project Focus', value: cleanType, inline: true },
            { name: '💰 Budget Bracket', value: cleanBudget, inline: true },
            { name: '⏱️ Target Timeline', value: cleanTimeline, inline: true }
          ],
          footer: { text: 'Yorven Client Intake • yorven.in' },
          timestamp: new Date().toISOString()
        }
      ]
    }

    const discordRes = await fetch(discordUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    })

    if (discordRes.ok || discordRes.status === 204) {
      return res.status(200).json({ success: true, message: 'Studio notification recorded' })
    }

    console.error('[Contact API] Discord webhook returned non-OK status:', discordRes.status)
    return res.status(502).json({ error: 'Studio notification delivery failed.' })
  } catch (err) {
    // Safe logging: Never log raw URL or credential tokens
    console.error('[Contact API] Discord dispatch network error:', err.message)
    return res.status(500).json({ error: 'Network error connecting to studio notification channel.' })
  }
}
