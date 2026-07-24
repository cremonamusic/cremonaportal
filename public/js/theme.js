// ── Canonical domain: legacy hostnames converge on portal.cremonamusic.com ───────
// The R2 book storage only allows CORS from the portal domain, and auth
// sessions are per-origin — old bookmarks (teachers./books./with. …) caused
// "Failed to load PDF" for some teachers.
(function () {
  var legacy = ['teachers.cremonamusic.com', 'teacher.cremonamusic.com', 'books.cremonamusic.com', 'book.cremonamusic.com', 'with.cremonamusic.com'];
  if (legacy.indexOf(location.hostname) !== -1) {
    location.replace('https://portal.cremonamusic.com' + location.pathname + location.search + location.hash);
  }
})();

// ── Design system: load the global polish stylesheet on every page ─────────
(function () {
  if (!document.querySelector('link[href^="/css/polish.css"]')) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/css/polish.css?v=3';
    (document.head || document.documentElement).appendChild(l);
  }
})();

// ── Loop circuit-breaker + diagnostics ──────────────────────────────────────
// Sliding window: 8 page loads within 25 s = a redirect loop. Comment each
// rapid load to /api/beacon so the cycle can be diagnosed, then wipe all
// stored sessions and land cleanly on the login page.
(function () {
  try {
    var loads = [];
    try { loads = JSON.parse(sessionStorage.getItem('cremona-loads') || '[]'); } catch (e) {}
    var now = Date.now();
    loads.push(now);
    loads = loads.filter(function (t) { return now - t < 25000; }).slice(-12);
    sessionStorage.setItem('cremona-loads', JSON.stringify(loads));

    // breadcrumb once loads get suspicious (3+ in the window)
    if (loads.length >= 3 && navigator.sendBeacon) {
      var reason = '';
      try { reason = sessionStorage.getItem('cremona-nav-reason') || ''; sessionStorage.removeItem('cremona-nav-reason'); } catch (e) {}
      var la = null;
      try { la = localStorage.getItem('cremona-login-at'); } catch (e) {}
      navigator.sendBeacon('/api/beacon', JSON.stringify({
        path: location.pathname + location.search,
        ref: document.referrer,
        n: loads.length,
        reason: reason,
        loginAt: la,
        ua: navigator.userAgent.slice(0, 60),
        t: new Date().toISOString(),
      }));
    }

    if (loads.length < 8) return;
    sessionStorage.removeItem('cremona-loads');
    if (navigator.sendBeacon) navigator.sendBeacon('/api/beacon', JSON.stringify({ path: location.pathname, breaker: 'TRIPPED', t: new Date().toISOString() }));
    try { localStorage.removeItem('cremona-login-at'); } catch (e) {}
    try {
      localStorage.removeItem('cremona-accounts');
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('cremona-session-') === 0) localStorage.removeItem(k);
      }
    } catch (e) {}
    var done = function () {
      if (location.pathname !== '/' || location.search.indexOf('reset=1') === -1) {
        location.replace('/?reset=1');
      }
    };
    try {
      var req = indexedDB.open('firebaseLocalStorageDb');
      req.onsuccess = function () {
        try {
          var tx = req.result.transaction('firebaseLocalStorage', 'readwrite');
          tx.objectStore('firebaseLocalStorage').clear();
          tx.oncomplete = function () { req.result.close(); done(); };
          tx.onerror = function () { req.result.close(); done(); };
        } catch (e) { done(); }
      };
      req.onerror = done;
    } catch (e) { done(); }
  } catch (e) {}
})();

// ── Multi-account switcher (saved sessions + chooser overlay) ──────────────
(function () {
  var s = document.createElement('script');
  s.src = '/js/accounts.js';
  s.defer = true;
  (document.head || document.documentElement).appendChild(s);
})();

// ── Security: force re-login after 14 days ─────────────────────────────────
(function () {
  try {
    var at = parseInt(localStorage.getItem('cremona-login-at'), 10);
    var MAX = 14 * 24 * 60 * 60 * 1000;
    if (at && Date.now() - at > MAX && location.pathname !== '/' && !location.pathname.startsWith('/index')) {
      localStorage.removeItem('cremona-login-at');
      try { sessionStorage.setItem('cremona-nav-reason', 'expired-14d'); } catch (e) {}
      location.href = '/?expired=1';
    }
  } catch (e) {}
})();

// Cremona Music portal theme (light / dark) — shared by every page.
// Loaded synchronously in <head> so the dark class applies before first paint.
// Preference: localStorage 'cremona-theme' ('dark' | 'light'); if unset, follows
// the device's prefers-color-scheme.
(function () {
  var stored = null;
  try { stored = localStorage.getItem('cremona-theme'); } catch (e) {}
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = stored ? stored === 'dark' : prefersDark;

  var css = [
    'html.cremona-dark { color-scheme: dark; }',
    'html.cremona-dark body { background-color:#101418 !important; color:#e3e6ea; }',
    /* page + section backgrounds */
    'html.cremona-dark .bg-surface, html.cremona-dark .bg-background, html.cremona-dark .bg-gray-50 { background-color:#101418 !important; }',
    'html.cremona-dark .bg-surface-white, html.cremona-dark .bg-white { background-color:#1a2027 !important; }',
    'html.cremona-dark .bg-surface-container-low, html.cremona-dark .bg-surface-container-lowest { background-color:#161b21 !important; }',
    'html.cremona-dark .bg-surface-container, html.cremona-dark .bg-surface-container-high, html.cremona-dark .bg-gray-100 { background-color:#2E241C !important; }',
    'html.cremona-dark .bg-surface-container-highest { background-color:#2a323b !important; }',
    'html.cremona-dark .edu-pattern { background-image:none !important; background-color:#101418 !important; }',
    /* text */
    'html.cremona-dark .text-on-surface, html.cremona-dark .text-gray-900, html.cremona-dark .text-black { color:#e3e6ea !important; }',
    'html.cremona-dark .text-text-muted, html.cremona-dark .text-on-surface-variant, html.cremona-dark .text-gray-500, html.cremona-dark .text-gray-600 { color:#9aa4b0 !important; }',
    /* borders */
    'html.cremona-dark .border-border-subtle, html.cremona-dark .border-gray-200, html.cremona-dark .divide-border-subtle > * { border-color:#333c46 !important; }',
    /* form controls */
    "html.cremona-dark input:not([type='checkbox']):not([type='radio']), html.cremona-dark textarea, html.cremona-dark select { background-color:#2E241C !important; color:#e3e6ea !important; border-color:#333c46 !important; }",
    'html.cremona-dark input::placeholder, html.cremona-dark textarea::placeholder { color:#6b7684 !important; }',
    /* tables */
    'html.cremona-dark thead tr, html.cremona-dark th { background-color:#161b21 !important; }',
    'html.cremona-dark tbody tr:hover td { background-color:#2E241C !important; }',
    /* chat bubbles + banners */
    'html.cremona-dark .bg-amber-100 { background-color:#4a3d14 !important; color:#efe6d0 !important; }',
    'html.cremona-dark .bg-amber-50, html.cremona-dark .bg-green-50, html.cremona-dark .bg-red-50, html.cremona-dark .bg-blue-50 { background-color:#2E241C !important; }',
    /* light-tint accent backgrounds (selected rows, chips, icon plates) — every opacity variant */
    'html.cremona-dark .bg-secondary-fixed, html.cremona-dark .bg-secondary-fixed\\/30, html.cremona-dark .bg-secondary-fixed\\/40, html.cremona-dark .bg-secondary-fixed\\/50, html.cremona-dark .bg-secondary-fixed\\/60 { background-color:#243447 !important; }',
    'html.cremona-dark .bg-secondary\\/10, html.cremona-dark .bg-secondary\\/20 { background-color:#1c2b3d !important; }',
    'html.cremona-dark .bg-primary-container\\/10, html.cremona-dark .bg-primary-container\\/15, html.cremona-dark .bg-primary-container\\/20, html.cremona-dark .bg-primary-container\\/30 { background-color:#33301c !important; }',
    'html.cremona-dark .bg-primary-fixed, html.cremona-dark .bg-primary-fixed\\/10, html.cremona-dark .bg-primary-fixed\\/40 { background-color:#3a3320 !important; }',
    /* hover states that used light grays */
    'html.cremona-dark .hover\\:bg-surface-container:hover, html.cremona-dark .hover\\:bg-surface-container-low:hover, html.cremona-dark .hover\\:bg-gray-50:hover, html.cremona-dark .hover\\:bg-gray-100:hover { background-color:#2E241C !important; }',
    'html.cremona-dark .hover\\:bg-secondary-fixed\\/30:hover, html.cremona-dark .hover\\:bg-secondary-fixed\\/40:hover { background-color:#243447 !important; }',
    'html.cremona-dark .hover\\:bg-secondary\\/20:hover, html.cremona-dark .hover\\:bg-secondary\\/5:hover { background-color:#1c2b3d !important; }',
    /* solid yellow buttons keep their dark text (bg-primary-container is not darkened) */
    'html.cremona-dark .bg-primary-container { color:#2A1D14 !important; }',
    'html.cremona-dark .bg-primary-container .text-on-primary-fixed, html.cremona-dark .bg-primary-container span { color:#2A1D14 !important; }',
    /* page-local component styles that hardcode light colors */
    'html.cremona-dark .student-item.active { background:#243447 !important; }',
    'html.cremona-dark .student-item:hover:not(.active) { background:#2E241C !important; }',
    'html.cremona-dark tr.report-row:hover td { background:#2E241C !important; }',
    'html.cremona-dark tr.row-selected td { background:#243447 !important; }',
    'html.cremona-dark .view-tab.active { background:#2a323b !important; color:#7fb3ff !important; }',
    'html.cremona-dark .child-tab:not(.active):hover { color:#e3e6ea !important; }',
    /* accent text colors tuned for light backgrounds — brighten on dark */
    'html.cremona-dark .text-secondary { color:#69a7ff !important; }',
    'html.cremona-dark .text-primary { color:#e0b64f !important; }',
    'html.cremona-dark .text-on-primary-container { color:#e5c76b !important; }',
    'html.cremona-dark .text-on-secondary-fixed { color:#cfe0ff !important; }',
    'html.cremona-dark .text-on-secondary-fixed-variant { color:#a9c7ff !important; }',
    'html.cremona-dark .text-outline, html.cremona-dark .text-outline-variant { color:#8b96a2 !important; }',
    /* legal pages (.prose) hardcode dark text colors */
    'html.cremona-dark .prose h2, html.cremona-dark .prose h3 { color:#e3e6ea !important; border-color:#333c46 !important; }',
    'html.cremona-dark .prose p, html.cremona-dark .prose ul li { color:#b6bec7 !important; }',
    'html.cremona-dark .prose a { color:#69a7ff !important; }',
    'html.cremona-dark .copyright-notice { background:#3a3320 !important; border-color:#6b5a1e !important; }',
    'html.cremona-dark .copyright-notice p { color:#e8d9a8 !important; }',
    'html.cremona-dark .copyright-notice strong { color:#f0e6c8 !important; }',
    /* shadows are too harsh on dark */
    'html.cremona-dark .shadow-sm, html.cremona-dark .shadow-md, html.cremona-dark .shadow-2xl { box-shadow:0 1px 3px rgba(0,0,0,.6) !important; }',
    /* ── colored status badges / pills (bg-*-100, the -50 tints are handled above) ── */
    'html.cremona-dark .bg-green-100 { background-color:#14331f !important; }',
    'html.cremona-dark .bg-blue-100 { background-color:#16293f !important; }',
    'html.cremona-dark .bg-red-100 { background-color:#3a1c1e !important; }',
    'html.cremona-dark .bg-yellow-100 { background-color:#3a3320 !important; }',
    'html.cremona-dark .bg-purple-100, html.cremona-dark .bg-violet-100 { background-color:#2b2545 !important; }',
    'html.cremona-dark .bg-indigo-100 { background-color:#20264a !important; }',
    'html.cremona-dark .bg-orange-100 { background-color:#3a2814 !important; }',
    'html.cremona-dark .bg-purple-50, html.cremona-dark .bg-yellow-50, html.cremona-dark .bg-indigo-50, html.cremona-dark .bg-orange-50 { background-color:#2E241C !important; }',
    /* paired badge/label text — lighten mid-tone accent text so it reads on dark */
    'html.cremona-dark .text-green-600, html.cremona-dark .text-green-700, html.cremona-dark .text-green-800 { color:#5bd08a !important; }',
    'html.cremona-dark .text-blue-600, html.cremona-dark .text-blue-700, html.cremona-dark .text-blue-800, html.cremona-dark .text-blue-900 { color:#7fb3ff !important; }',
    'html.cremona-dark .text-red-600, html.cremona-dark .text-red-700, html.cremona-dark .text-red-800, html.cremona-dark .text-error { color:#ff9a94 !important; }',
    'html.cremona-dark .text-yellow-700, html.cremona-dark .text-yellow-800, html.cremona-dark .text-amber-600, html.cremona-dark .text-amber-700, html.cremona-dark .text-amber-800 { color:#e5c76b !important; }',
    'html.cremona-dark .text-purple-700, html.cremona-dark .text-purple-800, html.cremona-dark .text-violet-700 { color:#c4a7f5 !important; }',
    'html.cremona-dark .text-indigo-700 { color:#a5b4ff !important; }',
    'html.cremona-dark .text-orange-600, html.cremona-dark .text-orange-700 { color:#ff9a5c !important; }',
    'html.cremona-dark .text-gray-700, html.cremona-dark .text-gray-800 { color:#c7cdd5 !important; }',
    /* accent borders (-200) softened / tinted for dark */
    'html.cremona-dark .border-green-200 { border-color:#2c4a35 !important; }',
    'html.cremona-dark .border-amber-200, html.cremona-dark .border-yellow-200 { border-color:#5a4a1e !important; }',
    'html.cremona-dark .border-blue-200 { border-color:#274063 !important; }',
    'html.cremona-dark .border-red-200 { border-color:#4a2528 !important; }',
    'html.cremona-dark .border-purple-200, html.cremona-dark .border-violet-200 { border-color:#3b2f5e !important; }',
    /* ── more page-local component styles that hardcode light colors ── */
    /* schedule-admin status pills */
    'html.cremona-dark .status-scheduled { background:#16293f !important; color:#7fb3ff !important; }',
    'html.cremona-dark .status-completed { background:#14331f !important; color:#5bd08a !important; }',
    'html.cremona-dark .status-cancelled { background:#2E241C !important; color:#9aa4b0 !important; }',
    /* messages-admin conversation filter buttons */
    'html.cremona-dark .conv-filter-btn.active { background:#243447 !important; color:#7fb3ff !important; }',
    'html.cremona-dark .conv-filter-btn:hover:not(.active) { background:#2E241C !important; }',
    /* active blue nav underline (reports-admin / schedule-admin) + parent child tabs */
    'html.cremona-dark .nav-active, html.cremona-dark .child-tab.active { color:#7fb3ff !important; border-bottom-color:#7fb3ff !important; }',
    /* schedule-admin replacement (보강) chip injected via JS */
    'html.cremona-dark .repl-badge { background:#16293f !important; color:#7fb3ff !important; }',
    /* home quick-card pastel icon plates (inline light bg + saturated icon) */
    'html.cremona-dark .plate-violet { background:#2b2545 !important; }',
    'html.cremona-dark .plate-violet .material-symbols-outlined { color:#c4a7f5 !important; }',
    'html.cremona-dark .plate-teal { background:#123330 !important; }',
    'html.cremona-dark .plate-teal .material-symbols-outlined { color:#3fd0bf !important; }',
    'html.cremona-dark .plate-orange { background:#3a2416 !important; }',
    'html.cremona-dark .plate-orange .material-symbols-outlined { color:#ff8a4c !important; }',
    'html.cremona-dark .plate-amber { background:#3a2c14 !important; }',
    'html.cremona-dark .plate-amber .material-symbols-outlined { color:#ff9a45 !important; }',
    'html.cremona-dark .plate-green { background:#14311a !important; }',
    'html.cremona-dark .plate-green .material-symbols-outlined { color:#5bd07a !important; }',
    /* parent/schedule legend swatches (tiny hardcoded light fills) */
    'html.cremona-dark .leg-up { background:#16293f !important; }',
    'html.cremona-dark .leg-done { background:#14331f !important; }',
    'html.cremona-dark .leg-cancel { background:#2E241C !important; }',
    /* toggle button */
    '#cremona-theme-toggle { position:fixed; bottom:18px; left:18px; z-index:900; width:42px; height:42px; border-radius:50%;',
    '  border:1px solid rgba(127,127,127,.35); background:rgba(255,255,255,.92); cursor:pointer; font-size:19px; line-height:1;',
    '  display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,.18); transition:transform .12s; }',
    '#cremona-theme-toggle:active { transform:scale(.9); }',
    'html.cremona-dark #cremona-theme-toggle { background:rgba(35,42,50,.95); }',
  ].join('\n');

  var style = document.createElement('style');
  style.id = 'cremona-theme-style';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  function apply(isDark) {
    document.documentElement.classList.toggle('cremona-dark', isDark);
    var btn = document.getElementById('cremona-theme-toggle');
    if (btn) {
      btn.textContent = isDark ? '☀️' : '🌙';
      btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }
    // Let pages with JS-drawn UI (calendars) re-render for the new theme
    try { window.dispatchEvent(new CustomEvent('cremona-theme', { detail: { dark: isDark } })); } catch (e) {}
  }

  // Palette for JS-drawn components (schedule calendars). Pages read this
  // instead of hardcoding light colors.
  window.cremonaCalPalette = function () {
    var dark = document.documentElement.classList.contains('cremona-dark');
    return dark ? {
      headBg: '#161b21', headTodayBg: '#1c2b3d', cellBorder: '#2E241C',
      hourLine: '#2E241C', halfLine: '#1c2228', outerBorder: '#333c46',
      timeColBg: '#161b21', timeLabel: '#8b96a2', dayLabel: '#8b96a2',
      dayNum: '#e3e6ea', todayCol: 'rgba(59,130,246,0.08)',
    } : {
      headBg: '#f9fafb', headTodayBg: '#eff6ff', cellBorder: '#f3f4f6',
      hourLine: '#f3f4f6', halfLine: '#f0f0f0', outerBorder: '#e5e7eb',
      timeColBg: '#f9fafb', timeLabel: '#9ca3af', dayLabel: '#7A6A57',
      dayNum: '#2B2019', todayCol: 'rgba(59,130,246,0.025)',
    };
  };

  apply(dark);

  // Follow device setting live while the user hasn't chosen manually
  if (!stored && window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        var s = null;
        try { s = localStorage.getItem('cremona-theme'); } catch (_) {}
        if (!s) { dark = e.matches; apply(dark); }
      });
    } catch (e) {}
  }

  function addButton() {
    if (document.getElementById('cremona-theme-toggle')) return;
    var btn = document.createElement('button');
    btn.id = 'cremona-theme-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle dark mode');
    btn.addEventListener('click', function () {
      dark = !dark;
      try { localStorage.setItem('cremona-theme', dark ? 'dark' : 'light'); } catch (e) {}
      apply(dark);
    });
    document.body.appendChild(btn);
    apply(dark);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addButton);
  } else {
    addButton();
  }
})();
