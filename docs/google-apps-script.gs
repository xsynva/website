/**
 * Xsynva Global — Contact Form → Google Sheets backend
 * ============================================================
 * This is the ENTIRE "backend" for the contact form on xsynva.com.
 * It is not a server you maintain — it's a small script that lives
 * inside a Google Sheet you own, running on Google's infrastructure.
 *
 * WHAT IT DOES
 *   1. Verifies the Cloudflare Turnstile token sent from the form.
 *   2. Enforces a max-5-submissions-per-IP-per-24h limit.
 *   3. Appends a row to this Sheet (one submission per row).
 *   4. Sends a notification email — as a readable HTML table, a
 *      copy-pasteable CSV block, and an attached .csv file.
 *
 * ---------------------------------------------------------------
 * ONE-TIME SETUP (do this signed in as xsynvaglobal@gmail.com)
 * ---------------------------------------------------------------
 *   1. Sheet columns (A1:J1): Timestamp | Name | Email | Phone |
 *      Country | Company | Interested In | Message | Source Page |
 *      IP Address
 *
 *      MIGRATING AN EXISTING SHEET: your columns are currently
 *      Timestamp | Name | Email | Company | Interested In | Message |
 *      Source Page | IP Address (no Phone/Country yet). In the Sheet:
 *      select column D ("Company") → right-click → "Insert 2 columns
 *      left" → relabel the two new D1/E1 headers "Phone" and
 *      "Country". Existing rows will just show those cells blank,
 *      which is fine — only new submissions populate them.
 *   2. Extensions → Apps Script → paste this whole file in.
 *   3. Set TURNSTILE_SECRET_KEY below to your Cloudflare secret key
 *      (from the Turnstile dashboard, same site as the site key
 *      used in contact.html's data-sitekey).
 *   4. Deploy → New deployment → Web app → Execute as "Me" →
 *      Access "Anyone" → Deploy. Copy the Web app URL into
 *      GOOGLE_SCRIPT_URL in assets/js/contact-form.js.
 *   5. Any future edit to this file needs Deploy → Manage
 *      deployments → Edit → New version to actually go live.
 *
 * ---------------------------------------------------------------
 * SECURITY NOTES
 * ---------------------------------------------------------------
 *   - This URL is public once deployed; the script only ever
 *     appends a row / sends a notification email, so a direct POST
 *     can't read/modify/delete anything else in your account.
 *   - Turnstile verification is the primary abuse gate — it blocks
 *     scripted/bot submissions almost entirely, since solving the
 *     challenge isn't scriptable.
 *   - The per-IP limiter (isIpRateLimited_) trusts an IP the
 *     BROWSER reports, not one Apps Script observed itself (Apps
 *     Script has no way to see the real caller IP). Combined with
 *     Turnstile this stops real-world repeat-submission abuse; it
 *     is not a cryptographic guarantee against a crafted raw POST
 *     with a faked IP. If you ever need that, put a Cloudflare
 *     Worker/Pages Function in front that reads the true client IP.
 *   - Submitted values are sanitized before being written to the
 *     Sheet (sanitizeForSheet_) to prevent formula injection.
 *   - The honeypot field (id="cf-website") silently absorbs basic
 *     bots that don't run JS/Turnstile at all.
 *   - Gmail consumer accounts cap MailApp.sendEmail at ~100/day.
 *     The Sheet has no such cap, so leads are never lost even if
 *     an abuse spike delays notification emails — Turnstile + the
 *     IP limiter should keep you well under that cap regardless.
 * ============================================================
 */

// Where new-lead notification emails are sent.
const NOTIFY_EMAIL = 'xsynvaglobal@gmail.com';

// From the Cloudflare Turnstile dashboard — keep TURNSTILE_SECRET_KEY secret, it
// is configured in Apps Scripts project settings

// Per-email limit — a quick speed bump on top of the IP limit,
// catches someone retrying the same address from different IPs.
const RATE_LIMIT_WINDOW_SECONDS = 600; // 10 minutes
const RATE_LIMIT_MAX_PER_WINDOW = 5;

// Per-IP limit — the one you asked for: max 5 submissions per IP
// per rolling 24h window, auto-resets as old entries age out.
const IP_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const IP_RATE_LIMIT_MAX = 5;

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const p = (e && e.parameter) || {};

    // Honeypot: accept silently (bot thinks it worked) but do nothing.
    if ((p.website || '').toString().trim() !== '') {
      return jsonResponse({ ok: true });
    }

    const name = (p.name || '').toString().trim();
    const email = (p.email || '').toString().trim();
    const phone = (p.phone || '').toString().trim();
    const country = (p.country || '').toString().trim();
    const company = (p.company || '').toString().trim();
    const vertical = (p.vertical || '').toString().trim();
    const message = (p.message || '').toString().trim();
    const sourcePage = (p.page || '').toString().trim();
    const turnstileToken = (p.turnstileToken || '').toString().trim();
    const clientIp = (p.ip || '').toString().trim() || 'unknown';

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name || !email || !emailPattern.test(email)) {
      return jsonResponse({ ok: false, error: 'Missing or invalid required fields' });
    }

    // Phone is optional, but if present must already be in "+<code><digits>"
    // form (the browser builds it this way from the country picker + digits
    // field). Rejects anything malformed from a direct POST that skipped
    // the page's own validation.
    if (phone && !/^\+\d{7,15}$/.test(phone)) {
      return jsonResponse({ ok: false, error: 'Invalid phone number format' });
    }

    if (!verifyTurnstile_(turnstileToken, clientIp)) {
      return jsonResponse({ ok: false, error: 'Verification failed — please retry the challenge' });
    }

    if (isRateLimited_(email)) {
      return jsonResponse({ ok: false, error: 'Too many submissions — please try again later' });
    }

    if (isIpRateLimited_(clientIp)) {
      return jsonResponse({ ok: false, error: 'Too many submissions from this network — please try again tomorrow' });
    }

    sheet.appendRow([
      new Date(),
      sanitizeForSheet_(name),
      sanitizeForSheet_(email),
      sanitizeForSheet_(phone),
      sanitizeForSheet_(country),
      sanitizeForSheet_(company),
      sanitizeForSheet_(vertical),
      sanitizeForSheet_(message),
      sanitizeForSheet_(sourcePage),
      sanitizeForSheet_(clientIp),
    ]);

    if (NOTIFY_EMAIL) {
      const fields = { name, email, phone, country, company, vertical, message, sourcePage, ip: clientIp };
      const csv = buildCsv_(fields);
      const stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd-HHmmss');
      const csvBlob = Utilities.newBlob(csv, 'text/csv', `enquiry-${stamp}.csv`);

      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: `New enquiry — ${vertical || '—'} | ${company || '—'}`,
        body:
          `New contact form submission from xsynva.com\n\n` +
          `Full Name: ${name}\nEmail: ${email}\nPhone: ${phone || '—'}\nCountry: ${country || '—'}\nCompany: ${company || '—'}\n` +
          `Interested in: ${vertical || '—'}\nPage: ${sourcePage || '—'}\nIP: ${clientIp}\n\n` +
          `Message:\n${message || '—'}\n`,
        htmlBody: buildHtmlEmailBody_(fields, csv),
        attachments: [csvBlob],
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// --- Turnstile ---------------------------------------------------

function verifyTurnstile_(token, ip) {
  const secretKey = PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET_KEY');
  if (!secretKey) {
    Logger.log('Turnstile secret key not configured — rejecting submission.');
    return false;
  }
  if (!token) return false;

  const payload = { secret: secretKey, response: token };
  if (ip && ip !== 'unknown') payload.remoteip = ip;

  try {
    const response = UrlFetchApp.fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'post', payload, muteHttpExceptions: true }
    );
    const result = JSON.parse(response.getContentText());
    return !!result.success;
  } catch (err) {
    Logger.log('Turnstile verification error: ' + err.message);
    return false;
  }
}

// --- Rate limiting -------------------------------------------------

// Per-email: blocks more than RATE_LIMIT_MAX_PER_WINDOW submissions
// from the same address within RATE_LIMIT_WINDOW_SECONDS.
function isRateLimited_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + email.toLowerCase();
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), RATE_LIMIT_WINDOW_SECONDS);
  return count > RATE_LIMIT_MAX_PER_WINDOW;
}

// Per-IP: max IP_RATE_LIMIT_MAX submissions per rolling 24h window.
// CacheService tops out at 6h, so this uses PropertiesService instead,
// storing a pruned list of submission timestamps per IP.
function isIpRateLimited_(ip) {
  if (!ip || ip === 'unknown') return false; // nothing to gate on
  const props = PropertiesService.getScriptProperties();
  const key = 'ip_' + ip;
  const now = Date.now();

  let timestamps = [];
  const raw = props.getProperty(key);
  if (raw) {
    try {
      timestamps = JSON.parse(raw);
    } catch (e) {
      timestamps = [];
    }
  }

  // Drop anything outside the 24h window so the limit auto-resets.
  timestamps = timestamps.filter((t) => now - t < IP_RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= IP_RATE_LIMIT_MAX) {
    props.setProperty(key, JSON.stringify(timestamps)); // still prune+save
    return true;
  }

  timestamps.push(now);
  props.setProperty(key, JSON.stringify(timestamps));
  return false;
}

// --- Email formatting ----------------------------------------------

// Gmail (and most webmail) strips <script>/onclick from incoming mail,
// so a real click-to-clipboard button won't fire once it lands in the
// inbox. Instead: a proper HTML table, a select-all CSV block, and an
// actual .csv attachment — that combination is copy/paste-usable and
// spreadsheet-openable everywhere, reliably.
function buildHtmlEmailBody_(fields, csv) {
  const rows = [
    ['Timestamp', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
    ['Name', fields.name],
    ['Email', fields.email],
    ['Phone', fields.phone || '—'],
    ['Country', fields.country || '—'],
    ['Company', fields.company || '—'],
    ['Interested In', fields.vertical || '—'],
    ['Message', fields.message || '—'],
    ['Source Page', fields.sourcePage || '—'],
    ['IP Address', fields.ip || '—'],
  ];

  const tableRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px; border:1px solid #ddd; background:#f5f7fa; font-weight:600; white-space:nowrap;">${escapeHtml_(label)}</td>
      <td style="padding:8px 12px; border:1px solid #ddd;">${escapeHtml_(value).replace(/\n/g, '<br>')}</td>
    </tr>`).join('');

  return `
    <div style="font-family:Arial, sans-serif; color:#0A1428;">
      
      <p style="color:#5B6B7A; margin-top:0;">Enquiry received via xsynva.com</p>
      <table style="border-collapse:collapse; width:100%; max-width:640px;">
        ${tableRows}
      </table>
      <p style="margin-top:20px; color:#5B6B7A; font-size:13px;">
        Need this as a spreadsheet row? Use the attached .csv.
      </p>
      <pre style="background:#0A1428; color:#fff; padding:12px; border-radius:6px; font-size:12px; overflow-x:auto; white-space:pre;">${escapeHtml_(csv)}</pre>
    </div>`;
}

function buildCsv_(fields) {
  const header = ['Timestamp', 'Name', 'Email', 'Phone', 'Country', 'Company', 'Interested In', 'Message', 'Source Page', 'IP Address'];
  const row = [
    new Date().toISOString(),
    fields.name,
    fields.email,
    fields.phone,
    fields.country,
    fields.company,
    fields.vertical,
    fields.message,
    fields.sourcePage,
    fields.ip,
  ];
  const csvEscape = (v) => {
    const s = (v || '').toString();
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return header.map(csvEscape).join(',') + '\n' + row.map(csvEscape).join(',');
}

function escapeHtml_(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- Utilities -------------------------------------------------------

function sanitizeForSheet_(value) {
  const str = (value || '').toString();
  return /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
}

function doGet() {
  return ContentService
    .createTextOutput('Xsynva contact form endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}