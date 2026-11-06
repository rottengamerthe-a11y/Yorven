/**
 * Lead Dispatcher for Yorven Client Intake
 * Delivers new leads to:
 * 1. Discord Webhook (instant live ping with rich card)
 * 2. Web3Forms (delivers formatted lead email directly to projects@yorven.in)
 * 3. Optional custom endpoint (Vercel Serverless /api/contact)
 */

export async function dispatchLead(formData) {
  const discordUrl = import.meta.env.VITE_DISCORD_WEBHOOK_URL;
  const web3FormsKey = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY;
  const customEndpoint = import.meta.env.VITE_CONTACT_ENDPOINT;

  const results = {
    discord: null,
    email: null,
    custom: null
  };

  // 1. Send to custom endpoint if defined (e.g. /api/contact)
  if (customEndpoint) {
    try {
      const res = await fetch(customEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      results.custom = res.ok;
    } catch (err) {
      console.error('Custom contact endpoint failed:', err);
    }
  }

  // 2. Send instant Discord Webhook with rich embed
  if (discordUrl) {
    try {
      const discordPayload = {
        username: 'Yorven Studio Leads',
        avatar_url: 'https://yorven.in/yorven-symbol.png',
        content: '🚨 **New Lead Alert: Call Request Received!**',
        embeds: [
          {
            title: `New Project Booking: ${formData.name}`,
            description: formData.description || '*No description provided*',
            color: 556104, // Yorven Deep Green #087c48
            fields: [
              { name: '👤 Client Name', value: formData.name, inline: true },
              { name: '🏢 Venture / Business', value: formData.business || 'Not specified', inline: true },
              { name: '✉️ Work Email', value: `[${formData.email}](mailto:${formData.email})`, inline: true },
              { name: '🛠️ Project Focus', value: formData.type || 'Custom Software', inline: true },
              { name: '💰 Budget Bracket', value: formData.budget || 'Not specified', inline: true },
              { name: '⏱️ Target Timeline', value: formData.timeline || 'Not specified', inline: true }
            ],
            footer: {
              text: 'Yorven Client Intake • yorven.in'
            },
            timestamp: new Date().toISOString()
          }
        ]
      };

      const res = await fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
      });
      results.discord = res.ok;
    } catch (err) {
      console.error('Discord webhook dispatch error:', err);
    }
  }

  // 3. Send Email to projects@yorven.in via Web3Forms
  if (web3FormsKey) {
    try {
      const web3Payload = {
        access_key: web3FormsKey,
        subject: `🔥 New Lead: ${formData.name} (${formData.business || 'New Project'})`,
        from_name: 'Yorven Client Intake',
        to: 'projects@yorven.in',
        replyto: formData.email,
        name: formData.name,
        business: formData.business || 'N/A',
        email: formData.email,
        project_type: formData.type,
        budget_range: formData.budget,
        timeline: formData.timeline,
        description: formData.description,
        submitted_at: new Date().toLocaleString()
      };

      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(web3Payload)
      });
      const data = await res.json().catch(() => null);
      if (data && data.success) {
        results.email = true;
      } else {
        console.warn('Web3Forms dispatch status:', res.status, data?.message || res.statusText);
      }
    } catch (err) {
      console.warn('Web3Forms dispatch warning:', err?.message || err);
    }
  }

  // If running in development without any configured keys, log to console
  if (!discordUrl && !web3FormsKey && !customEndpoint) {
    console.warn('[LeadDispatcher] No delivery keys configured in .env. Form submission payload:', formData);
    // Return true for local testing simulation so development isn't blocked
    return true;
  }

  // Return true if at least one delivery channel succeeded
  return results.discord || results.email || results.custom;
}
