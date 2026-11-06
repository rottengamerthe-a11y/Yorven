/**
 * Vercel Serverless Function: /api/contact
 * Handles lead submission on the server side:
 * 1. Validates honeypot & required fields
 * 2. Forwards to Discord Webhook
 * 3. Forwards to Web3Forms / Email
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, business, email, type, budget, timeline, description, website } = req.body || {};

  // Honeypot check for bots
  if (website) {
    return res.status(200).json({ success: true, message: 'Filtered' });
  }

  if (!name || !email || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL || process.env.VITE_DISCORD_WEBHOOK_URL;
  const web3FormsKey = process.env.WEB3FORMS_ACCESS_KEY || process.env.VITE_WEB3FORMS_ACCESS_KEY;

  const tasks = [];

  // 1. Discord Webhook
  if (discordUrl) {
    const discordPayload = {
      username: 'Yorven Studio Leads',
      content: '🚨 **New Lead Alert: Call Request Received!**',
      embeds: [
        {
          title: `New Project Booking: ${name}`,
          description: description,
          color: 556104, // #087c48
          fields: [
            { name: '👤 Client Name', value: name, inline: true },
            { name: '🏢 Venture / Business', value: business || 'Not specified', inline: true },
            { name: '✉️ Work Email', value: `[${email}](mailto:${email})`, inline: true },
            { name: '🛠️ Project Focus', value: type || 'Custom Software', inline: true },
            { name: '💰 Budget Bracket', value: budget || 'Not specified', inline: true },
            { name: '⏱️ Target Timeline', value: timeline || 'Not specified', inline: true }
          ],
          footer: { text: 'Yorven Client Intake • yorven.in' },
          timestamp: new Date().toISOString()
        }
      ]
    };

    tasks.push(
      fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
      }).catch(err => console.error('Discord error:', err))
    );
  }

  // 2. Web3Forms Email
  if (web3FormsKey) {
    const web3Payload = {
      access_key: web3FormsKey,
      subject: `🔥 New Lead: ${name} (${business || 'New Project'})`,
      from_name: 'Yorven Client Intake',
      to: 'projects@yorven.in',
      replyto: email,
      name,
      business: business || 'N/A',
      email,
      project_type: type,
      budget_range: budget,
      timeline,
      description,
      submitted_at: new Date().toLocaleString()
    };

    tasks.push(
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(web3Payload)
      }).catch(err => console.error('Web3Forms error:', err))
    );
  }

  await Promise.allSettled(tasks);

  return res.status(200).json({ success: true, message: 'Lead recorded' });
}
