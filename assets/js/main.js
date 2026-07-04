// ============================================================
// Xsynva Global — shared site behavior
// Loaded on every page. Handles: nav scroll shadow, mobile drawer,
// and the floating chat-launcher placeholder.
//
// Contact-form submission logic lives separately in
// assets/js/contact-form.js (only loaded on contact.html), so this
// file stays identical — and cacheable — across every page.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Scroll shadow on nav
  const siteNav = document.getElementById('siteNav');
  if (siteNav) {
    window.addEventListener('scroll', () => {
      siteNav.style.boxShadow = window.scrollY > 8 ? '0 2px 20px rgba(11,18,32,0.08)' : 'none';
    });
  }

  // Mobile drawer
  const mDrawer = document.getElementById('mobileDrawer');
  const mBackdrop = document.getElementById('mdrawerBackdrop');
  const mOpenBtn = document.getElementById('mobileMenuBtn');
  const mCloseBtn = document.getElementById('mobileCloseBtn');
  function openDrawer() { mDrawer.classList.add('open'); mBackdrop.classList.add('open'); }
  function closeDrawer() { mDrawer.classList.remove('open'); mBackdrop.classList.remove('open'); }
  if (mOpenBtn) mOpenBtn.addEventListener('click', openDrawer);
  if (mCloseBtn) mCloseBtn.addEventListener('click', closeDrawer);
  if (mBackdrop) mBackdrop.addEventListener('click', closeDrawer);
  document.querySelectorAll('.mdrawer-links a').forEach(a => a.addEventListener('click', closeDrawer));

  // Chat launcher placeholder (chatbot integration point — not built yet)
  const chatBtn = document.getElementById('chatLauncher');
  if (chatBtn) {
    chatBtn.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Live chat is coming soon. In the meantime, message us on WhatsApp or email contact@xsynva.com.');
    });
  }
});
