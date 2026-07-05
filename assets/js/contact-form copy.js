// ============================================================
// Xsynva Global — contact form submission handler
// Loaded only on contact.html.
//
// The form posts to a Google Apps Script "Web app" endpoint tied to
// a Google Sheet, which is the whole "backend" — no server to run.
// Setup steps + the full Apps Script source live in
// /docs/google-apps-script.gs — read that first if this URL below
// still says "REPLACE_WITH_YOUR_DEPLOYED_WEB_APP_URL".
//
// Abuse protection:
//   - Cloudflare Turnstile must be solved before submit is allowed.
//     The site key lives in contact.html; the secret key lives only
//     in the Apps Script, which verifies the token server-side.
//   - The browser's public IP is looked up client-side (api.ipify.org,
//     free, no key) and sent along so the backend can cap submissions
//     at 5 per IP per 24h. This client-reported IP is NOT spoof-proof
//     by itself — a raw POST straight to the Apps Script URL could
//     fake it — but Turnstile is what actually blocks scripted/bot
//     submissions, and the two together cover real-world abuse.
// ============================================================

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzFIF2XBNcIu6_LKRvSVRMiW2YON8u1e6n8bxi6xH-BOdjy9lKT1MKfCMKHKtEU9P3bcw/exec';

// Best-effort public IP lookup. If it fails (ad-blocker, offline
// lookup service, etc.) we still submit — Turnstile is the real gate.
async function getClientIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip || 'unknown';
  } catch {
    return 'unknown';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const cf = document.getElementById('contactForm');
  if (cf) {
    cf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = cf.querySelector('button[type="submit"]');
      const original = btn.innerHTML;

      const isConfigured = GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.startsWith('REPLACE_WITH');
      if (!isConfigured) {
        console.warn(
          'Xsynva contact form: GOOGLE_SCRIPT_URL is not configured yet. ' +
          'See /docs/google-apps-script.gs for setup steps. Showing the ' +
          'success state without actually sending data anywhere.'
        );
      }

      // Block submit client-side if Turnstile hasn't been solved yet —
      // saves a round trip, though the real enforcement is server-side.
      const turnstileToken =
        typeof turnstile !== 'undefined' ? turnstile.getResponse() : '';
      if (isConfigured && !turnstileToken) {
        btn.innerHTML = 'Please complete the verification above';
        btn.style.background = '#B3261E';
        setTimeout(() => {
          btn.innerHTML = original;
          btn.style.background = '';
        }, 3200);
        return;
      }

      btn.disabled = true;
      btn.innerHTML = 'Sending…';

      const clientIp = await getClientIp();

      const payload = new URLSearchParams({
        name: cf.querySelector('#cf-name')?.value || '',
        email: cf.querySelector('#cf-email')?.value || '',
        company: cf.querySelector('#cf-company')?.value || '',
        vertical: cf.querySelector('#cf-vertical')?.value || '',
        message: cf.querySelector('#cf-message')?.value || '',
        website: cf.querySelector('#cf-website')?.value || '', // honeypot
        page: window.location.pathname.split('/').pop() || 'index.html',
        turnstileToken: turnstileToken,
        ip: clientIp,
      });

      try {
        if (isConfigured) {
          // Apps Script web apps don't return usable CORS headers for a
          // normal fetch, so this is sent with mode: 'no-cors'. We can't
          // read the response (so we can't tell in the UI whether
          // Turnstile/rate-limit checks passed server-side) — but the
          // POST still reaches the script and gets processed. If you
          // ever need that feedback surfaced in the UI, you'd need a
          // proxy (e.g. a Cloudflare Worker) in front that can return
          // real CORS + a status code.
          await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: payload,
          });
        }
        btn.innerHTML = 'Message sent';
        btn.style.background = '#0E8A5F';
        setTimeout(() => {
          btn.innerHTML = original;
          btn.style.background = '';
          btn.disabled = false;
          cf.reset();
          if (typeof turnstile !== 'undefined') turnstile.reset();
        }, 2400);
      } catch (err) {
        console.error('Xsynva contact form: submission failed', err);
        btn.innerHTML = 'Something went wrong — try WhatsApp instead';
        btn.style.background = '#B3261E';
        setTimeout(() => {
          btn.innerHTML = original;
          btn.style.background = '';
          btn.disabled = false;
          if (typeof turnstile !== 'undefined') turnstile.reset();
        }, 3200);
      }
    });
  }

  // "Chat with our assistant" quick action on this page — same
  // placeholder behavior as the floating chat launcher in main.js.
  const chatBtn2 = document.getElementById('chatLauncher2');
  if (chatBtn2) {
    chatBtn2.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Live chat is coming soon. In the meantime, message us on WhatsApp or email contact@xsynva.com.');
    });
  }
});