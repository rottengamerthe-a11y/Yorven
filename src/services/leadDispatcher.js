/**
 * Client Lead Dispatcher
 * Manages dual-channel lead delivery:
 * 1. Web3Forms (browser-side submission to projects@yorven.in inbox via public access key)
 * 2. Discord Webhook (server-side studio alert via internal /api/contact endpoint)
 *
 * In-flight lock and per-submission cache prevent duplicate submissions and duplicate emails on retry.
 */

// Public Web3Forms client access key (Web3Forms documentation standard)
export const WEB3FORMS_ACCESS_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WEB3FORMS_ACCESS_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_WEB3FORMS_ACCESS_KEY) ||
  '61ced345-d76c-437a-92fd-906464491705'

// In-flight locking guard
let isSubmitting = false

// Map of submission fingerprint -> { emailSent: boolean, discordSent: boolean }
const deliveryStateCache = new Map()

function getFingerprint(formData) {
  return `${(formData.email || '').trim().toLowerCase()}|${(formData.name || '').trim().toLowerCase()}`
}

function getStoredState(fingerprint) {
  if (deliveryStateCache.has(fingerprint)) {
    return deliveryStateCache.get(fingerprint)
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const raw = window.sessionStorage.getItem(`yorven_lead_${fingerprint}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        deliveryStateCache.set(fingerprint, parsed)
        return parsed
      }
    } catch {
      // Ignore sessionStorage errors (e.g. storage disabled)
    }
  }
  return { emailSent: false, discordSent: false }
}

function setStoredState(fingerprint, state) {
  deliveryStateCache.set(fingerprint, state)
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(`yorven_lead_${fingerprint}`, JSON.stringify(state))
    } catch {
      // Ignore quota or security errors
    }
  }
}

/**
 * Dispatches a lead across Web3Forms and internal /api/contact
 * Returns: { ok: boolean, emailSent: boolean, discordSent: boolean, error?: string }
 */
export async function dispatchLead(formData) {
  if (isSubmitting) {
    return { ok: false, error: 'A submission is already in progress. Please wait.' }
  }

  isSubmitting = true
  const fingerprint = getFingerprint(formData)
  const state = getStoredState(fingerprint)

  try {
    let emailSuccess = state.emailSent
    let emailErrorMsg = null

    // 1. Channel A: Direct Browser Web3Forms Submission (Email to projects@yorven.in)
    if (!emailSuccess && WEB3FORMS_ACCESS_KEY) {
      try {
        const fd = new FormData()
        fd.append('access_key', WEB3FORMS_ACCESS_KEY)
        fd.append('name', formData.name)
        fd.append('email', formData.email)
        fd.append('business', formData.business || 'N/A')
        fd.append('project_type', formData.type || 'Custom Software')
        fd.append('budget_range', formData.budget || 'Not specified')
        fd.append('timeline', formData.timeline || 'Not specified')
        fd.append('description', formData.description)
        fd.append('subject', `🔥 New Lead: ${formData.name} (${formData.business || 'New Project'})`)
        fd.append('from_name', 'Yorven Client Intake')

        const web3Res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          body: fd
        })

        const web3Data = await web3Res.json().catch(() => null)
        if (web3Res.ok && web3Data?.success !== false) {
          emailSuccess = true
          state.emailSent = true
        } else {
          emailErrorMsg = web3Data?.message || `Web3Forms returned status ${web3Res.status}`
        }
      } catch (err) {
        emailErrorMsg = err?.message || 'Network error reaching email intake provider'
      }
    }

    // 2. Channel B: Server-Side Studio Alert via Internal Endpoint (/api/contact -> Discord)
    let discordSuccess = state.discordSent
    let discordErrorMsg = null

    if (!discordSuccess) {
      try {
        const contactRes = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(formData)
        })

        const contactData = await contactRes.json().catch(() => null)
        if (contactRes.ok && contactData?.success) {
          discordSuccess = true
          state.discordSent = true
        } else {
          discordErrorMsg = contactData?.error || `Contact endpoint returned status ${contactRes.status}`
        }
      } catch (err) {
        discordErrorMsg = err?.message || 'Network error reaching internal contact endpoint'
      }
    }

    // Update state cache for this submission
    setStoredState(fingerprint, state)

    // Evaluate Result
    if (emailSuccess && discordSuccess) {
      return { ok: true, emailSent: true, discordSent: true }
    }

    if (!emailSuccess && discordSuccess) {
      // Discord alerted team, but email confirmation failed
      return {
        ok: false,
        partial: true,
        emailSent: false,
        discordSent: true,
        error: `Your request was alerted to our team, but confirmation email delivery failed (${emailErrorMsg || 'provider unavailable'}). Please email projects@yorven.in directly.`
      }
    }

    if (emailSuccess && !discordSuccess) {
      // Email reached inbox, but internal studio alert failed
      return {
        ok: false,
        partial: true,
        emailSent: true,
        discordSent: false,
        error: `Your booking was emailed, but studio dispatch encountered an issue (${discordErrorMsg || 'channel error'}). Our team will check the inbox.`
      }
    }

    // Both failed
    return {
      ok: false,
      partial: false,
      emailSent: false,
      discordSent: false,
      error: 'We could not submit your booking at this time. Please email projects@yorven.in directly.'
    }
  } finally {
    isSubmitting = false
  }
}
