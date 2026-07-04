<p>
  <img src="assets/brand/logo-icon-source.png" width="40" style="vertical-align: middle;">
  <img src="assets/brand/brand_name.png" width="200" style="vertical-align: middle;"> 
</p>

https://xsynva.com

---

## 1. Directory structure

```
website/
├── index.html                       Home
├── about.html
├── contact.html                     Contact form + WhatsApp/email/phone
├── finance.html                     Finance hub
├── finance-advisory.html
├── international-taxation.html
├── technology.html                  Technology hub
├── software-solutions.html
├── drone-manufacturing.html
├── agriculture.html
├── 404.html                         Custom not-found page
├── site.webmanifest                 PWA manifest (used by favicons)
├── robots.txt
├── sitemap.xml
├── .nojekyll                        Tells GitHub Pages: serve as-is, skip Jekyll
├── .gitignore
├── _headers                         Security headers (Cloudflare Pages only — see §7)
├── README.md
│
├── assets/
│   ├── css/
│   │   ├── base.css                 Loaded on every page: tokens, reset,
│   │   │                            typography, buttons/tags, nav + mega
│   │   │                            menu + mobile drawer, footer, floating
│   │   │                            WhatsApp/chat buttons, responsive rules
│   │   └── components.css           Loaded on every page: every page-level
│   │                                component (heroes, cards, mock panels,
│   │                                tables, forms...), organized by page
│   │
│   ├── js/
│   │   ├── main.js                  Nav scroll shadow, mobile drawer,
│   │   │                            chat-launcher placeholder — identical
│   │   │                            on every page
│   │   └── contact-form.js          Contact form submit logic (Turnstile +
│   │                                Google Sheets). Loaded only on contact.html
│   │
│   ├── images/
│   │   ├── favicons/                Full favicon + PWA icon set
│   │   └── optimized/               Web-optimized photography/hero images
│   │
│   └── brand/                       Source brand files (icon PNG, wordmark
│       │                            SVG) — reference only, not loaded by
│       │                            any page
│       ├── logo-icon-source.png
│       └── xsynva-wordmark-source.svg
│
├── docs/
│   └── google-apps-script.gs        Full source + setup steps for the
│                                     contact-form → Google Sheets backend
│
├── scripts/
│   └── sync-partials.py             Header/footer sync tool — see §2
│
└── .github/
    └── workflows/
        └── deploy.yml                GitHub Actions → GitHub Pages
```


**Hosting:** GitHub Pages (testing) + Cloudflare Pages (production, `xsynva.com`).

---

## 2. Local development

No build step, no dependencies.

**Open the file directly** — double-click any `.html` file. Header/footer
are inlined on every page, so there's nothing to fetch; it renders
immediately. (Google Fonts still needs an internet connection.)

**Or run a local server** (optional):

```bash
python3 -m http.server 8000
# then open http://localhost:8000

# or, with Node:
npx serve .
```

**Updating the header, footer, or floating buttons.** Edit them in
`index.html` only, then run:

```bash
python3 scripts/sync-partials.py
```

This propagates the change into every other page — correctly re-applying
each page's active nav-link and `contact.html`'s no-CTA-button header. It
never touches anything inside `<main>…</main>`. Review with `git diff`
before committing.

---

## 3. Brand assets & favicons

The header on every page uses **inline SVG** for the icon + wordmark
(no image request) — see `<a href="index.html" class="brand">` in any
page's `<header>`.

`assets/brand/` holds the original source files (icon PNG, wordmark SVG)
for reference only — not loaded by any page.

`assets/images/favicons/` is generated output — the full favicon/PWA icon
set, produced from the brand icon. Regenerate this set from source if the
logo ever changes, rather than hand-editing these files.

---

## 4. Contact form → Google Sheets + Turnstile

The form on `contact.html` posts to a **Google Apps Script** Web App tied
to a Google Sheet — no server to host or pay for, runs under your Google
account. Full setup steps + source: [`docs/google-apps-script.gs`](docs/google-apps-script.gs).

**Sheet columns:** `Timestamp | Name | Email | Company | Interested In | Message | Source Page | IP Address`

**Setup:**
1. Create/open the Google Sheet, add the header row above.
2. In the Sheet: **Extensions → Apps Script** → paste in `docs/google-apps-script.gs`.
3. **Project Settings → Script Properties → Add property** →
   `TURNSTILE_SECRET_KEY` = your Cloudflare Turnstile secret key.
4. **Deploy → New deployment → Web app** → Execute as **Me**, Access
   **Anyone** → Deploy → copy the Web app URL.
5. Paste that URL into `GOOGLE_SCRIPT_URL` at the top of
   `assets/js/contact-form.js`.
6. In `contact.html`, set the Turnstile **site key** on the
   `<div class="cf-turnstile" data-sitekey="...">` element (must match the
   secret key from step 3 — see §5 for the current test-key pairing).

Any code change to the `.gs` file requires **Deploy → Manage deployments
→ Edit → New version** — saving alone does not redeploy.

Every valid submission: appends a row to the Sheet, and sends a
notification email to `xsynvaglobal@gmail.com` (HTML table + copy-pasteable
CSV block + an attached `.csv` file).

**Fallback channels** (always active, no setup required): WhatsApp
(`wa.me/919270227724`), phone, and `mailto:` links on the same page.

---

## 5. Security

**No secrets in the repo.** Confirmed clean on every delivery — safe to
keep this repository public.

**Abuse protection on the contact form** (`docs/google-apps-script.gs`):
- **Cloudflare Turnstile**, verified server-side on every submission.
  Secret key lives only in Apps Script Script Properties, never in Git.
  Currently using Cloudflare's public **test** keys (site key
  `1x00000000000000000000AA`, matching test secret) — swap both for real
  keys before going live.
- **Per-IP limit:** 5 submissions / rolling 24h (IP from a client-side
  lookup to `api.ipify.org` — not spoof-proof alone, but paired with
  Turnstile).
- **Per-email limit:** 5 submissions / 10 minutes.
- Formula-injection sanitization (blocks `=`, `+`, `-`, `@` leading
  characters from becoming live Sheet formulas).
- Hidden honeypot field (`#cf-website`).
- Server-side email-format validation.

**`_headers`** (Cloudflare Pages only — GitHub Pages ignores this file):
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, and a `Content-Security-Policy` scoped to exactly
what the site loads (self-hosted CSS/JS, Google Fonts, Turnstile, the
Apps Script endpoint, ipify, and the Google Maps embed on Contact —
nothing else).

**HTTPS** is automatic on both GitHub Pages and Cloudflare Pages.

**Canonical URL:** every page's `<link rel="canonical">` points at
`https://xsynva.com/...` regardless of which host serves it, so the
GitHub Pages testing URL and production don't get indexed as duplicate
content.

---

## 6. Deploying to GitHub Pages (testing)

**Repo:** `https://github.com/xsynva/website`

**Option A — GitHub Actions (included):**
1. Push to `main`.
2. **Settings → Pages → Build and deployment → Source → "GitHub Actions."**
3. Every push to `main` redeploys via `.github/workflows/deploy.yml`.

**Option B — Deploy from a branch (no workflow):**
**Settings → Pages → Source → "Deploy from a branch"** → `main` / `/ (root)`.

No custom domain needed here — the default `*.github.io` URL is fine for
testing; production is Cloudflare Pages (§7).

---

## 7. Deploying to Cloudflare Pages (production)

Same repo, no changes needed.

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select this repo.
2. Build settings — **Framework preset:** None · **Build command:** *(empty)* · **Build output directory:** `/`
3. Deploy → gives a `*.pages.dev` URL.
4. **Custom domain:** Pages project → **Custom domains** → `xsynva.com`
   (already on Cloudflare, DNS added automatically). For `www.xsynva.com`,
   add it as a second custom domain + a Redirect Rule to the apex (or
   vice versa) so only one is canonical.
5. Every push to the production branch redeploys automatically.

`_headers` (repo root) is read automatically by Cloudflare Pages — see §5.

---

## 8. Adding a new page

1. Copy the closest existing page as a starting point.
2. Update `<title>`, `<meta name="description">`, `<link rel="canonical">`.
3. Set `<body class="page-your-new-page">`.
4. Run `python3 scripts/sync-partials.py` to sync header/footer (adjust
   `STANDARD_PAGES_ACTIVE` in that script if the new page should highlight
   a nav item).
5. Add the page to `sitemap.xml`.

---

## 9. Notes for the future

- No backend is planned. The contact form's backend is a Google Sheet;
  WhatsApp is a static link.
- If the page count grows past ~20–30 and `sync-partials.py` starts
  feeling like a workaround, that's the signal to revisit a static-site
  generator — not needed at the current page count.