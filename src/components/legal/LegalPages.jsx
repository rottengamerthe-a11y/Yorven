import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Shield, FileText, Cookie, CheckCircle2 } from 'lucide-react'

function LegalShell({ eyebrow, title, lastUpdated, children }) {
  return (
    <section className="page-shell container">
      <div className="legal-header">
        <Link to="/" className="legal-back-link">
          <ArrowLeft size={15} /> Back to home
        </Link>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="legal-title">{title}</h1>
        <div className="legal-meta">
          <span className="legal-badge">Effective: {lastUpdated}</span>
          <span className="legal-domain">Domain: yorven.in</span>
        </div>
      </div>
      <div className="legal-copy">{children}</div>
    </section>
  )
}

export function PrivacyPolicy() {
  return (
    <LegalShell
      eyebrow="Data Governance & Privacy"
      title="Privacy Policy"
      lastUpdated="November 10, 2026"
    >
      <div className="legal-intro-box">
        <Shield size={20} className="legal-box-icon" aria-hidden="true" />
        <div>
          <strong>Data Minimization Commitment</strong>
          <p>
            Yorven is an independent digital product studio. We design and build custom software, web platforms,
            and digital products. We do not sell personal data or operate client-side advertising trackers.
            This policy transparently explains what data is processed when you use yorven.in, how enquiries are handled,
            and your rights.
          </p>
        </div>
      </div>

      <h2>1. Who We Are</h2>
      <p>
        Yorven (“we”, “us”, or “our”) is an independent digital product studio operated in India and accessible
        online at <a href="https://yorven.in">https://yorven.in</a>. For all privacy, data handling, or commercial
        inquiries, our official contact channel is <a href="mailto:projects@yorven.in">projects@yorven.in</a>.
      </p>

      <h2>2. What Information We Process</h2>
      <p>
        We distinguish clearly between public visitors who contact us and private administrative operators of the website:
      </p>

      <h3>A. Client Enquiries (Public Contact Form)</h3>
      <p>
        When you submit a project enquiry through our contact form at <Link to="/contact">/contact</Link>, we collect
        the details you voluntarily submit:
      </p>
      <ul>
        <li><strong>Full Name:</strong> To address you personally in communications.</li>
        <li><strong>Email Address:</strong> To respond with scoping notes, estimates, or scheduling availability.</li>
        <li><strong>Venture or Business Name:</strong> To understand the organizational context of your project.</li>
        <li><strong>Project Focus:</strong> The technical discipline required (Websites, Digital Products, Systems & Scale).</li>
        <li><strong>Budget Bracket & Target Timeline:</strong> To assess feasibility, scope boundaries, and delivery schedules.</li>
        <li><strong>Project Description:</strong> Your functional scope, goals, and technical specifications.</li>
      </ul>
      <p>
        <em>Database storage clarification:</em> Enquiries submitted through yorven.in are <strong>never written to or stored in a database</strong> on our servers.
        Submissions are dispatched in real-time as described in Section 3 below.
      </p>

      <h3>B. Studio Administration (Private Dashboard Only)</h3>
      <p>
        Access to <code className="prose-inline-code">/dashboard/*</code> is restricted exclusively to authorized Yorven studio operators.
        For administrative accounts, Supabase Auth processes administrator email addresses and password credentials, with passwords securely hashed
        by the authentication provider, alongside Time-based One-Time Password (TOTP) multifactor authentication tokens. Public visitors to
        yorven.in are never prompted for passwords or account credentials.
      </p>

      <h3>C. Automated Infrastructure Metadata</h3>
      <p>
        When your browser requests pages from yorven.in, our hosting edge infrastructure (Vercel) automatically logs standard HTTP request
        metadata (client IP address, HTTP User-Agent, referrers, request paths, and timestamps) for network delivery, DDoS mitigation,
        and platform uptime. In addition, our serverless contact endpoint temporarily holds client IP addresses in execution memory
        to enforce a rate limit (maximum 5 submissions per 15 minutes) to deter automated spam. These in-memory IP records are transient and
        are never written to a database.
      </p>

      <h2>3. How Enquiries Are Dispatched</h2>
      <p>
        When you submit an enquiry, your brief is processed through two dedicated communication channels:
      </p>
      <ol className="legal-numbered-list">
        <li>
          <strong>Email Delivery via Web3Forms:</strong> Your form payload is transmitted directly from your browser to
          Web3Forms (<code className="prose-inline-code">api.web3forms.com</code>), which securely packages the submission and forwards
          it directly to our studio inbox (<code className="prose-inline-code">projects@yorven.in</code>).
        </li>
        <li>
          <strong>Internal Studio Alert (Discord Webhook):</strong> Concurrently, our serverless contact endpoint transmits a project
          summary embed to our private studio Discord notification channel over HTTPS. This alert ensures our team is notified promptly
          without exposing server credentials to the client.
        </li>
        <li>
          <strong>Duplicate Mitigation (Client SessionStorage):</strong> When supported by browser cryptographic APIs, a temporary
          pseudonymous identifier and delivery-status flags are cached in <code className="prose-inline-code">sessionStorage</code> to help reduce duplicate notifications
          if an enquiry is submitted or retried. This storage does not contain cleartext names or email addresses and normally ends when you close your browser tab.
        </li>
      </ol>

      <h2>4. Third-Party Service Providers</h2>
      <p>
        We use established, specialized infrastructure providers to operate yorven.in:
      </p>
      <ul>
        <li><strong>Web3Forms:</strong> Form intake and email delivery service forwarding submissions to our studio inbox.</li>
        <li><strong>Discord Inc.:</strong> Private notification webhook channel for incoming team alerts.</li>
        <li><strong>Vercel Inc.:</strong> Static edge hosting, CDN delivery, SSL termination, and serverless compute infrastructure.</li>
        <li><strong>Supabase Inc.:</strong> Relational database and GoTrue identity infrastructure, utilized exclusively for the private studio management dashboard.</li>
        <li><strong>Google LLC (Google Fonts):</strong> Typography stylesheets for DM Serif, Manrope, and DM Mono. Requests transmit standard HTTP headers to Google CDN nodes.</li>
        <li><strong>Search Console & GA4 (Server-side):</strong> Aggregated search performance and traffic data are queried server-to-server via backend service accounts. <strong>No client-side Google Analytics scripts or tracking cookies run in your browser.</strong></li>
      </ul>

      <h2>5. Data Retention & Deletion</h2>
      <p>
        We keep data retention strictly practical and minimal:
      </p>
      <ul>
        <li><strong>Enquiry Communications:</strong> Stored in our studio email inbox (<code className="prose-inline-code">projects@yorven.in</code>) and private Discord channel for the duration of scoping, project delivery, and subsequent communication, or until you request deletion.</li>
        <li><strong>Browser Storage:</strong> SessionStorage deduplication records expire and clear automatically when you close your browser tab.</li>
        <li><strong>Administrative Sessions:</strong> Studio operator authentication cookies (<code className="prose-inline-code">__Host-yorven-refresh</code>) expire after 90 days or immediately upon logout.</li>
      </ul>

      <h2>6. Security Safeguards</h2>
      <p>
        We implement defense-in-depth engineering practices to safeguard communications:
      </p>
      <ul>
        <li>Mandatory TLS/HTTPS encryption across all public pages and API endpoints.</li>
        <li>Honeypot spam filtering and in-memory rate limiting on our serverless contact endpoint; origin validation on administrative endpoints.</li>
        <li>Temporary administrative two-factor authentication tokens are encrypted using AES-256-GCM before issuance in cookies.</li>
        <li>Administrative access tokens exist only in transient JavaScript execution memory and are never written to localStorage or sessionStorage.</li>
        <li>Underlying cloud database infrastructure utilizes disk encryption at rest. Public enquiries are never stored in a database.</li>
      </ul>

      <h2>7. Your Rights: Access, Correction & Deletion</h2>
      <p>
        You have straightforward control over your information:
      </p>
      <ul>
        <li><strong>Access:</strong> You can request a copy of the enquiry communications or project details we have on file for you.</li>
        <li><strong>Correction:</strong> You can notify us of any updates or corrections to your contact or project details.</li>
        <li><strong>Erasure:</strong> You can ask us to permanently delete your enquiry emails and Discord notification records.</li>
      </ul>
      <p>
        To exercise any of these rights, email <a href="mailto:projects@yorven.in">projects@yorven.in</a> with the subject line
        <em>“Data Request”</em>. We verify sender identity via email reply and fulfill verified requests promptly without fee.
      </p>

      <h2>8. Children’s Privacy</h2>
      <p>
        Our website and services are intended solely for businesses, founders, and adult professionals. We do not knowingly collect personal
        information from individuals under the age of 18. If you believe a minor has submitted information through our website, please email us
        for immediate removal.
      </p>

      <h2>9. Contact Us</h2>
      <p>
        For any questions regarding this Privacy Policy or our data handling practices, please contact:
      </p>
      <div className="legal-contact-card">
        <p><strong>Yorven</strong></p>
        <p>Email: <a href="mailto:projects@yorven.in">projects@yorven.in</a></p>
        <p>Web: <a href="https://yorven.in">https://yorven.in</a></p>
      </div>
    </LegalShell>
  )
}

export function TermsOfService() {
  return (
    <LegalShell
      eyebrow="Commercial & Website Terms"
      title="Terms of Service"
      lastUpdated="November 10, 2026"
    >
      <div className="legal-intro-box">
        <FileText size={20} className="legal-box-icon" aria-hidden="true" />
        <div>
          <strong>Agreement Overview</strong>
          <p>
            These Terms govern your use of the Yorven website (https://yorven.in). Submitting an enquiry or booking a discovery call
            allows us to explore a project together, but does not form a binding contract for services. Bespoke client engagements are governed
            exclusively by separate, mutually signed project agreements.
          </p>
        </div>
      </div>

      <h2>1. About Yorven & Acceptance of Terms</h2>
      <p>
        Yorven (“we”, “us”, or “our”) is an independent digital product and software engineering studio operated in India.
        By accessing or browsing <a href="https://yorven.in">https://yorven.in</a>, you acknowledge that you have read,
        understood, and agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please discontinue use of the site.
      </p>

      <h2>2. Nature of the Website & Informational Purpose</h2>
      <p>
        This website serves as our studio portfolio, engineering showcase, technical insight publication, and prospective client intake gateway.
        All case studies, deliverables, technical notes, and project descriptions published on this site are presented for illustrative and informational
        purposes to demonstrate our capabilities and standards. Content on this website does not constitute formal legal, financial, or architectural advice.
      </p>

      <h2>3. No Binding Contract Created by Enquiries</h2>
      <p>
        Submitting a project enquiry, scheduling a discovery call, or receiving an initial roadmap, scope estimate, or technical perspective through yorven.in
        <strong> does not create a binding contract for services</strong>, a retainer relationship, or an obligation for Yorven to undertake development.
      </p>
      <p>
        Formal client engagements are established exclusively through a written, mutually signed Project Proposal, Statement of Work (SOW), or commercial contract
        detailing defined deliverables, milestones, payment schedules, intellectual property assignment, and delivery timelines.
      </p>

      <h2>4. Project Engagements: Scope, Payment, Revisions & Cancellation</h2>
      <p>
        When you engage Yorven for custom software engineering services under a separate client agreement:
      </p>
      <ul>
        <li><strong>Fixed-Scope Milestones:</strong> Projects are structured around clearly bounded milestones with regular working demonstrations.</li>
        <li><strong>Scope Changes:</strong> Work requested outside the agreed specification is evaluated and quoted separately as an addendum before implementation.</li>
        <li><strong>Payment Terms:</strong> Invoices, milestone deposits, and release payments must be settled according to the schedules stipulated in your specific contract.</li>
        <li><strong>Revisions:</strong> Iteration cycles are defined in your project agreement to maintain engineering velocity and schedule predictability.</li>
        <li><strong>Cancellation & Termination:</strong> Policies regarding project suspension, milestone sign-off, and termination fees are governed exclusively by your signed agreement.</li>
      </ul>

      <h2>5. Client Responsibilities</h2>
      <p>
        Successful software engineering requires active collaboration. In all active engagements, clients agree to:
      </p>
      <ul>
        <li>Provide prompt feedback, technical approvals, and creative direction during review cycles.</li>
        <li>Furnish necessary copy, branding assets, API credentials, and account access required for development.</li>
        <li>Ensure all materials and assets provided to Yorven are owned by the client or properly licensed.</li>
      </ul>

      <h2>6. Intellectual Property & Portfolio Rights</h2>
      <h3>A. Yorven Website Content</h3>
      <p>
        The Yorven name, wordmark (<code className="prose-inline-code">/yorven-wordmark.svg</code>), website copy, page layouts, interactive animations,
        custom styling, and branding assets are the proprietary intellectual property of Yorven. You may not scrape, reproduce, republish, or redistribute
        our proprietary website assets without prior written consent.
      </p>

      <h3>B. Client Project Deliverables</h3>
      <p>
        Ownership of bespoke code, designs, and deliverables created for clients transfers in full to the client upon receipt of complete and final payment,
        subject to standard open-source licenses governing underlying third-party libraries (such as React, Vite, or PostgreSQL).
      </p>

      <h3>C. Studio Portfolio Attribution</h3>
      <p>
        Unless explicitly agreed otherwise under a written Non-Disclosure Agreement (NDA) or contract executed prior to development, Yorven reserves the right
        to display completed, publicly accessible client websites, applications, screenshots, and anonymized architectural case studies in our studio
        portfolio, on our website, and across our professional channels.
      </p>

      <h2>7. Acceptable Website Conduct</h2>
      <p>
        You agree to use yorven.in strictly for lawful and constructive purposes. You must not:
      </p>
      <ul>
        <li>Attempt to probe, scan, test the vulnerability of, or gain unauthorized access to our serverless endpoints or administrative control room (<code className="prose-inline-code">/dashboard/*</code>).</li>
        <li>Introduce viruses, worms, Trojan horses, or other malicious code.</li>
        <li>Deploy automated scrapers, bots, or harvesting mechanisms that impose an unreasonable or disproportionately large load on our infrastructure.</li>
        <li>Bypass or attempt to circumvent rate limits, honeypot filters, or security controls.</li>
        <li>Submit fictitious, abusive, defamatory, or fraudulent project briefs through our contact form.</li>
      </ul>

      <h2>8. External Links & Third-Party Platforms</h2>
      <p>
        Our website may contain links to third-party platforms, such as Google Play store listings, social networks (X/Twitter, Instagram), client applications,
        or technical documentation. These links are provided for convenience only. Yorven has no control over external platforms and accepts no responsibility
        for their content, operational availability, terms, or privacy practices.
      </p>

      <h2>9. Disclaimer of Warranties</h2>
      <p>
        This website is provided on an “as is” and “as available” basis without warranties of any kind, whether express, implied, statutory, or otherwise,
        including warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that yorven.in will always be
        uninterrupted, timely, completely secure, or error-free.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by applicable law, in no event shall Yorven, its owner, contributors, or contractors be liable for any indirect,
        incidental, special, consequential, or punitive damages, including loss of profits, data, goodwill, or business interruption, arising out of
        your access to, reliance upon, or inability to access this website.
      </p>

      <h2>11. Termination & Suspension</h2>
      <p>
        We reserve the right to restrict, suspend, or terminate access to the website or its contact endpoints for any user who violates these Terms
        or engages in abusive behavior toward our infrastructure or team, without prior notice.
      </p>

      <h2>12. Governing Law & Dispute Resolution</h2>
      <p>
        These Terms of Service, their interpretation, and any claims arising out of or related to your use of yorven.in shall be governed by and construed
        in accordance with the laws of <strong>India</strong>, without regard to conflict of law principles. Any dispute arising out of or in connection with
        these Terms shall first be attempted to be resolved amicably through good-faith discussion between the parties.
      </p>

      <h2>13. Contact Information</h2>
      <p>
        For inquiries regarding these Terms or project agreements, please contact:
      </p>
      <div className="legal-contact-card">
        <p><strong>Yorven</strong></p>
        <p>Email: <a href="mailto:projects@yorven.in">projects@yorven.in</a></p>
        <p>Web: <a href="https://yorven.in/terms">https://yorven.in/terms</a></p>
      </div>
    </LegalShell>
  )
}

export function CookiePolicy() {
  return (
    <LegalShell
      eyebrow="Storage & Transparency"
      title="Cookie Policy"
      lastUpdated="November 10, 2026"
    >
      <div className="legal-intro-box">
        <Cookie size={20} className="legal-box-icon" aria-hidden="true" />
        <div>
          <strong>Zero-Tracking Architecture</strong>
          <p>
            Yorven respects your privacy. We do not use third-party advertising cookies, behavioural trackers, or marketing pixels.
            This policy discloses the exact functional storage keys and administrative cookies utilized across yorven.in.
          </p>
        </div>
      </div>

      <h2>1. What Are Cookies and Web Storage?</h2>
      <p>
        Cookies are small text files placed on your device by websites you visit. In modern web applications, browsers also provide
        web storage mechanisms, notably <strong>localStorage</strong> (which persists until explicitly cleared) and <strong>sessionStorage</strong>
        (which exists only for the duration of an active browser tab session).
      </p>

      <h2>2. Complete Inventory of Storage on yorven.in</h2>
      <p>
        Our technical compliance audit verified that yorven.in uses a minimal storage footprint strictly limited to functional accessibility preferences,
        enquiry deduplication, and private administrative authentication:
      </p>

      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th>Key / Name</th>
              <th>Category</th>
              <th>Storage Type</th>
              <th>Duration</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code className="prose-inline-code">yorven-motion</code></td>
              <td>Functional Preference</td>
              <td>Browser localStorage</td>
              <td>Persistent (until cleared)</td>
              <td>
                Stores your accessibility animation choice when using the Motion toggle in the site footer (<code className="prose-inline-code">reduced</code> or <code className="prose-inline-code">full</code>).
                Contains no personal data.
              </td>
            </tr>
            <tr>
              <td><code className="prose-inline-code">yorven_lead_sub_*</code></td>
              <td>Functional (Anti-Duplicate)</td>
              <td>Browser sessionStorage</td>
              <td>Tab session only</td>
              <td>
                May store a temporary pseudonymous submission identifier and delivery-status flags in sessionStorage to help reduce duplicate notifications. The identifier is derived using available browser cryptographic APIs. This storage is temporary and normally ends with the browser tab session. It does not store cleartext names or email addresses.
              </td>
            </tr>
            <tr>
              <td><code className="prose-inline-code">__Host-yorven-refresh</code></td>
              <td>Strictly Necessary (Admin Only)</td>
              <td>HTTP Cookie (HttpOnly, Secure, SameSite=Strict, Path=/)</td>
              <td>90 days</td>
              <td>
                Maintains authenticated session state for studio operators accessing the private management control room (<code className="prose-inline-code">/dashboard/*</code>).
                Never issued to public website visitors.
              </td>
            </tr>
            <tr>
              <td><code className="prose-inline-code">__Host-yorven-mfa</code></td>
              <td>Strictly Necessary (Admin Only)</td>
              <td>HTTP Cookie (HttpOnly, Secure, SameSite=Strict, Path=/)</td>
              <td>5 minutes</td>
              <td>
                Holds an AES-256-GCM encrypted temporary token during two-factor verification for studio administrators during login.
                Never issued to public visitors.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>3. No Client-Side Advertising or Tracking Scripts</h2>
      <p>
        A rigorous audit of our production codebase confirmed:
      </p>
      <ul>
        <li><CheckCircle2 size={16} className="inline-check" /> <strong>No Google Analytics client scripts (<code className="prose-inline-code">gtag.js</code> or <code className="prose-inline-code">analytics.js</code>)</strong> are installed in your browser.</li>
        <li><CheckCircle2 size={16} className="inline-check" /> <strong>No Facebook / Meta Pixels</strong> or social tracking beacons are embedded.</li>
        <li><CheckCircle2 size={16} className="inline-check" /> <strong>No third-party behavioural advertising networks</strong> receive tracking identifiers from your visit.</li>
      </ul>
      <p>
        Any aggregated performance metrics we evaluate (such as overall search queries on Google or total page views) are ingested
        server-to-server via backend APIs.
      </p>

      <h2>4. Current Consent Banner Practice</h2>
      <p>
        Yorven currently does not display a cookie-consent banner. The website uses only the functional preference and administrative storage
        mechanisms described in the inventory above, and does not deploy client-side advertising or marketing trackers. Legal requirements
        regarding cookie notices and consent mechanisms vary across jurisdictions and may change over time; we regularly review our practices
        to ensure appropriate transparency.
      </p>

      <h2>5. How You Can Control Browser Storage</h2>
      <p>
        You have full control over all storage technologies through your browser settings:
      </p>
      <ul>
        <li>You can configure your browser to block or alert you about cookies.</li>
        <li>You can delete your browsing history and localStorage at any time.</li>
        <li>
          If you clear <code className="prose-inline-code">yorven-motion</code> from localStorage, all website pages remain 100% functional;
          animations simply follow your operating system’s default reduced-motion preference.
        </li>
      </ul>

      <h2>6. Contact Us</h2>
      <p>
        If you have any questions regarding our storage practices or Cookie Policy, please write to us at:
      </p>
      <div className="legal-contact-card">
        <p><strong>Yorven</strong></p>
        <p>Email: <a href="mailto:projects@yorven.in">projects@yorven.in</a></p>
        <p>Web: <a href="https://yorven.in/cookies">https://yorven.in/cookies</a></p>
      </div>
    </LegalShell>
  )
}
