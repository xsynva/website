#!/usr/bin/env python3
"""
Xsynva Global — sync header, footer & floating buttons across all pages
=========================================================================
This site is intentionally plain, dependency-free static HTML — every
page carries its own copy of the header, mobile drawer, footer and
floating WhatsApp/chat buttons, instead of loading them at runtime via
JavaScript. That keeps the live site fast, simple, and fully working
even if someone opens a page straight from disk.

The trade-off is that those blocks are duplicated across files. This
script is the fix for that trade-off: it is a one-time, local,
build-time helper (NOT a server, NOT something that runs on the live
site) that keeps every page's header/footer/floating-buttons in sync
with index.html, which is treated as the single source of truth.

USAGE
  Edit the header, footer, or floating buttons in index.html only,
  then run:

    python3 scripts/sync-partials.py

  This rewrites the corresponding blocks in every other .html file in
  the repo root to match index.html exactly (re-applying each page's
  active nav-link and contact.html's special "no CTA button" header).
  It never touches anything inside <main>...</main>, so page content
  is never affected.

  Review the diff (`git diff`) and commit as normal.

REQUIREMENTS
  Python 3.8+, standard library only — nothing to install.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Pages that use the standard header (nav-links + "Get in Touch" CTA)
# and which top-level nav item should be marked active on each.
STANDARD_PAGES_ACTIVE = {
    "index.html": None,
    "about.html": ('<a href="about.html" class="nav-link">About</a>',
                    '<a href="about.html" class="nav-link active">About</a>'),
    "agriculture.html": ('<a href="agriculture.html" class="nav-link">Agriculture</a>',
                          '<a href="agriculture.html" class="nav-link active">Agriculture</a>'),
    "finance.html": ('<a href="finance.html" class="nav-link">Finance',
                      '<a href="finance.html" class="nav-link active">Finance'),
    "finance-advisory.html": ('<a href="finance.html" class="nav-link">Finance',
                               '<a href="finance.html" class="nav-link active">Finance'),
    "international-taxation.html": ('<a href="finance.html" class="nav-link">Finance',
                                     '<a href="finance.html" class="nav-link active">Finance'),
    "technology.html": ('<a href="technology.html" class="nav-link">Technology',
                         '<a href="technology.html" class="nav-link active">Technology'),
    "software-solutions.html": ('<a href="technology.html" class="nav-link">Technology',
                                 '<a href="technology.html" class="nav-link active">Technology'),
    "drone-manufacturing.html": ('<a href="technology.html" class="nav-link">Technology',
                                  '<a href="technology.html" class="nav-link active">Technology'),
}

# contact.html keeps its own header structure (Contact link instead of
# the "Get in Touch" CTA button) — we only sync its brand block so the
# logo/wordmark/favicon-adjacent markup never drifts from index.html.
CONTACT_PAGE = "404.html does NOT use this — see note below"

HEADER_RE = re.compile(
    r'<header class="nav" id="siteNav">.*?<div class="mdrawer-backdrop" id="mdrawerBackdrop"></div>',
    re.S,
)
BRAND_RE = re.compile(r'<a href="index\.html" class="brand">.*?</a>', re.S)
FOOTER_RE = re.compile(r'<footer class="footer">.*?</footer>', re.S)
FLOAT_RE = re.compile(r'<div class="float-stack">.*?</div>', re.S)


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def main():
    index_html = read("index.html")

    std_header = HEADER_RE.search(index_html).group(0)
    brand_block = BRAND_RE.search(std_header).group(0)
    footer_block = FOOTER_RE.search(index_html).group(0)
    float_block = FLOAT_RE.search(index_html).group(0)

    changed = []

    for page, active_sub in STANDARD_PAGES_ACTIVE.items():
        path = ROOT / page
        if not path.exists():
            print(f"  skip (not found): {page}")
            continue
        html = path.read_text(encoding="utf-8")

        header = std_header
        if active_sub:
            old, new = active_sub
            if header.count(old) != 1:
                print(f"  WARNING: {page}: active-link anchor not found once in "
                      f"index.html's header — skipping header sync for this page.")
            else:
                header = header.replace(old, new, 1)

        new_html = html
        new_html = HEADER_RE.sub(lambda m: header, new_html, count=1)
        new_html = FOOTER_RE.sub(lambda m: footer_block, new_html, count=1)
        new_html = FLOAT_RE.sub(lambda m: float_block, new_html, count=1)

        if new_html != html:
            path.write_text(new_html, encoding="utf-8")
            changed.append(page)

    # contact.html + 404.html: only the brand block + footer + floating
    # buttons are synced; their header nav structure is intentionally
    # different (no "Get in Touch" CTA) and is left alone.
    for page in ["contact.html", "404.html"]:
        path = ROOT / page
        if not path.exists():
            continue
        html = path.read_text(encoding="utf-8")
        new_html = html
        new_html = BRAND_RE.sub(lambda m: brand_block, new_html, count=1)
        new_html = FOOTER_RE.sub(lambda m: footer_block, new_html, count=1)
        new_html = FLOAT_RE.sub(lambda m: float_block, new_html, count=1)
        if new_html != html:
            path.write_text(new_html, encoding="utf-8")
            changed.append(page)

    if changed:
        print("Synced header/footer/floating-buttons into:")
        for c in changed:
            print(f"  - {c}")
    else:
        print("Everything already in sync — no files changed.")


if __name__ == "__main__":
    sys.exit(main())
