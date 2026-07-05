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

// Regional-indicator flag emoji from an ISO 3166-1 alpha-2 code, e.g. "IN" -> 🇮🇳.
// No image assets needed; renders natively wherever emoji are supported.
function flagEmoji(iso2) {
  return iso2
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

// Wires up the country-search combobox next to the phone field.
// Typing filters window.XSYNVA_COUNTRIES (from countries.js) — matches
// starting with the typed text are listed first, then other matches
// containing it, so typing "in" surfaces India before e.g. "Argentina".
function initCountryPicker() {
  const searchInput = document.getElementById('cf-country-search');
  const dialInput = document.getElementById('cf-country-dial');
  const nameInput = document.getElementById('cf-country-name');
  const list = document.getElementById('cf-country-list');
  if (!searchInput || !list || !window.XSYNVA_COUNTRIES) return;

  const countries = window.XSYNVA_COUNTRIES;

  function render(query) {
    const q = query.trim().toLowerCase();
    let matches;
    if (!q) {
      matches = countries.slice(0, 8);
    } else {
      const starts = countries.filter((c) => c.name.toLowerCase().startsWith(q));
      const contains = countries.filter(
        (c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q)
      );
      matches = [...starts, ...contains].slice(0, 8);
    }

    list.innerHTML = '';
    if (matches.length === 0) {
      list.innerHTML = '<div class="country-empty">No matching country</div>';
    } else {
      matches.forEach((c) => {
        const opt = document.createElement('div');
        opt.className = 'country-option';
        opt.setAttribute('role', 'option');
        opt.innerHTML =
          `<span class="co-flag">${flagEmoji(c.iso2)}</span>` +
          `<span>${c.name}</span>` +
          `<span class="co-dial">+${c.dial}</span>`;
        opt.addEventListener('click', () => selectCountry(c));
        list.appendChild(opt);
      });
    }
    list.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
  }

  function selectCountry(c) {
    searchInput.value = `${flagEmoji(c.iso2)} ${c.name} (+${c.dial})`;
    dialInput.value = c.dial;
    nameInput.value = c.name;
    list.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
  }

  searchInput.addEventListener('focus', () => render(searchInput.value.includes('(+') ? '' : searchInput.value));
  searchInput.addEventListener('input', () => {
    // Typing again after a selection starts a fresh search.
    dialInput.value = '';
    nameInput.value = '';
    render(searchInput.value);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.country-combobox')) {
      list.hidden = true;
      searchInput.setAttribute('aria-expanded', 'false');
    }
  });
}

// Phone field: digits only, no spaces/dashes/plus/letters — the
// country code is prepended separately from the selected country.
function initPhoneField() {
  const phoneInput = document.getElementById('cf-phone');
  if (!phoneInput) return;
  phoneInput.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initCountryPicker();
  initPhoneField();

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

      // Phone is optional, but if either half is filled in, both must be —
      // a bare 10-digit number with no country code is ambiguous to store.
      const phoneDigits = cf.querySelector('#cf-phone')?.value || '';
      const countryDial = cf.querySelector('#cf-country-dial')?.value || '';
      const countryName = cf.querySelector('#cf-country-name')?.value || '';
      if ((phoneDigits && !countryDial) || (countryDial && !phoneDigits)) {
        btn.innerHTML = 'Select a country and enter a phone number';
        btn.style.background = '#B3261E';
        setTimeout(() => {
          btn.innerHTML = original;
          btn.style.background = '';
        }, 3200);
        return;
      }
      const fullPhone = phoneDigits && countryDial ? `+${countryDial}${phoneDigits}` : '';

      btn.disabled = true;
      btn.innerHTML = 'Sending…';

      const clientIp = await getClientIp();

      const payload = new URLSearchParams({
        name: cf.querySelector('#cf-name')?.value || '',
        email: cf.querySelector('#cf-email')?.value || '',
        phone: fullPhone,
        country: countryName,
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