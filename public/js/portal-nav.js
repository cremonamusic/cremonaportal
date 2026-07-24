/* ============================================================================
 * Cremona Music Portal — shared navigation chrome
 * ----------------------------------------------------------------------------
 * Injects the walnut header and the YouTube-style collapsible sidebar on every
 * portal page, and removes the page's own legacy <header> so a page only has to
 * declare which portal and page it is:
 *
 *   <body data-portal="teacher" data-page="home">
 *   <script src="/js/portal-nav.js" defer></script>
 *
 * Both data attributes are optional — the portal is inferred from the URL path
 * (/admin/* , /parent/* , else teacher) and the page from the filename.
 *
 * Layout contract: the header is fixed (64px tall) and the sidebar is fixed on
 * the left. Rather than wrap existing page markup (fragile across 30+ pages),
 * we push content with padding on <body>, driven by data-nav-state.
 * ==========================================================================*/
(function () {
  'use strict';

  var HEADER_H = 64;
  var RAIL_W = 240;   // expanded
  var RAIL_MINI = 52; // collapsed, icons only
  var DESKTOP = 1024; // below this the sidebar is an overlay, not a push
  var STORE_KEY = 'sidebarCollapsed';

  // ── Nav item sets per portal ───────────────────────────────────────────────
  var NAV = {
    teacher: {
      label: 'Teacher Portal',
      items: [
        { id: 'home',     icon: 'home',            label: 'Home',     href: '/home' },
        { id: 'books',    icon: 'menu_book',       label: 'Books',    href: '/books' },
        { id: 'schedule', icon: 'calendar_month',  label: 'Schedule', href: '/schedule' },
        { id: 'messages', icon: 'chat_bubble',     label: 'Messages', href: '/messages' },
        { id: 'students', icon: 'group',           label: 'Students', href: '/students-teacher' },
        { id: 'comments', icon: 'rate_review',     label: 'Comments', href: '/comments' }
      ]
    },
    admin: {
      label: 'Admin Portal',
      items: [
        { id: 'accounts',      icon: 'manage_accounts', label: 'Accounts',      href: '/admin/accounts' },
        { id: 'security',      icon: 'shield',          label: 'Security',      href: '/admin/security' },
        { id: 'resources',     icon: 'folder',          label: 'Resources',     href: '/admin/resources' },
        { id: 'students',      icon: 'group',           label: 'Students',      href: '/admin/students' },
        { id: 'schedule',      icon: 'calendar_month',  label: 'Schedule',      href: '/admin/schedule-admin' },
        { id: 'messages',      icon: 'chat_bubble',     label: 'Messages',      href: '/admin/messages-admin' },
        { id: 'comments',      icon: 'rate_review',     label: 'Comments',      href: '/admin/comments-admin' },
        { id: 'announcements', icon: 'campaign',        label: 'Announcements', href: '/admin/announcements' }
      ],
      signOut: true
    },
    parent: {
      label: 'Parent Portal',
      items: [
        { id: 'dashboard',    icon: 'dashboard',       label: 'Dashboard',    href: '/parent/dashboard' },
        { id: 'comments',     icon: 'rate_review',     label: 'Comments',     href: '/parent/comments' },
        { id: 'schedule',     icon: 'calendar_month',  label: 'Schedule',     href: '/parent/schedule' },
        { id: 'messages',     icon: 'chat_bubble',     label: 'Messages',     href: '/parent/messages' },
        { id: 'certificates', icon: 'workspace_premium', label: 'Certificates', href: '/parent/certificates' }
      ]
    }
  };

  // Filename → nav item id, for pages whose slug differs from the item id.
  var PAGE_ALIAS = {
    'students-teacher': 'students',
    'schedule-admin': 'schedule',
    'messages-admin': 'messages',
    'comments-admin': 'comments',
    'reader': 'books',
    'account': null // account page highlights nothing in the rail
  };

  // ── Context detection ──────────────────────────────────────────────────────
  function detectPortal() {
    var declared = document.body.getAttribute('data-portal');
    if (declared && NAV[declared]) return declared;
    var p = location.pathname;
    if (p.indexOf('/admin/') === 0) return 'admin';
    if (p.indexOf('/parent/') === 0) return 'parent';
    // Root-level pages shared by every role (account.html) can't be resolved
    // from the path — fall back to the role recorded at login.
    try {
      var stored = localStorage.getItem('cremona-role');
      if (stored && NAV[stored]) return stored;
    } catch (e) {}
    return 'teacher';
  }

  function detectPage() {
    var declared = document.body.getAttribute('data-page');
    if (declared) return declared;
    var slug = location.pathname.split('/').pop().replace(/\.html$/, '');
    if (!slug) slug = 'home';
    return PAGE_ALIAS.hasOwnProperty(slug) ? PAGE_ALIAS[slug] : slug;
  }

  // Human-readable page name for the header centre slot. Falls back to the
  // matching nav item, then to <title> minus the site name.
  function pageTitle(nav, activeId) {
    var declared = document.body.getAttribute('data-page-title');
    if (declared) return declared;
    for (var i = 0; i < nav.items.length; i++) {
      if (nav.items[i].id === activeId) return nav.items[i].label;
    }
    return (document.title || '').replace(/^Cremona Music (Portal|Admin)\s*[-–—]\s*/, '').trim();
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  var CSS = [
    ':root{--cm-walnut:#3B2A1E;--cm-walnut-deep:#2A1D14;--cm-gold:#C8A951;--cm-cream:#FAF6EF;',
    '--cm-header-h:' + HEADER_H + 'px;--cm-rail:' + RAIL_W + 'px;--cm-rail-mini:' + RAIL_MINI + 'px}',

    /* content offset — driven by body[data-nav-state] */
    'body{padding-top:var(--cm-header-h)}',
    '@media(min-width:' + DESKTOP + 'px){',
    'body[data-nav-state="open"]{padding-left:var(--cm-rail)}',
    'body[data-nav-state="mini"]{padding-left:var(--cm-rail-mini)}}',

    /* ── header ── */
    /* The rail is full-height (its top holds the stacked logo), so on desktop
       the header starts where the rail ends — otherwise the rail would sit on
       top of the hamburger. */
    '#cm-header{position:fixed;top:0;left:0;right:0;height:var(--cm-header-h);z-index:60;',
    'background:var(--cm-walnut);color:#fff;display:flex;align-items:center;gap:12px;padding:0 12px;',
    'box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .18s ease}',
    '@media(min-width:' + DESKTOP + 'px){',
    'body[data-nav-state="open"] #cm-header{left:var(--cm-rail)}',
    'body[data-nav-state="mini"] #cm-header{left:var(--cm-rail-mini)}}',
    '#cm-header button, #cm-header a{color:#fff}',
    '.cm-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;',
    'border-radius:50%;background:transparent;border:0;cursor:pointer;transition:background .15s ease;flex:0 0 auto}',
    '.cm-iconbtn:hover{background:rgba(255,255,255,.12)}',
    '.cm-iconbtn:active{background:rgba(255,255,255,.2)}',
    /* The supplied artwork is black line-art; both the header and the rail sit
       on walnut, so it is inverted to white. This requires the PNGs to have a
       TRANSPARENT background — a white matte would invert to a black box.
       Drop the filter here and on #cm-rail-logo if white artwork is supplied. */
    '#cm-header-logo{height:34px;width:auto;flex:0 0 auto;filter:invert(1)}',
    '#cm-header-wordmark{font-weight:700;letter-spacing:.02em;white-space:nowrap;flex:0 0 auto}',
    '#cm-pagename{flex:1 1 auto;text-align:center;font-weight:600;font-size:15px;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',

    /* logo visibility: hidden below 450px, mobile mark below 650px, and hidden
       on desktop while the rail is open (the rail shows the stacked logo) */
    '@media(max-width:449px){#cm-header-logo,#cm-header-wordmark{display:none}}',
    '@media(min-width:' + DESKTOP + 'px){',
    'body[data-nav-state="open"] #cm-header-logo,',
    'body[data-nav-state="open"] #cm-header-wordmark{display:none}}',

    /* ── sidebar ── */
    '#cm-sidebar{position:fixed;top:0;bottom:0;left:0;width:var(--cm-rail);z-index:70;',
    'background:var(--cm-walnut);color:#fff;display:flex;flex-direction:column;',
    'transition:width .18s ease,transform .18s ease;overflow:hidden}',
    '#cm-rail-head{flex:0 0 auto;padding:14px 12px 10px;display:flex;flex-direction:column;',
    'align-items:center;gap:8px;min-height:var(--cm-header-h)}',
    '#cm-rail-logo{max-width:168px;height:auto;filter:invert(1)}',
    '#cm-rail-portal{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;',
    'color:var(--cm-gold);white-space:nowrap}',
    '#cm-rail-nav{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:8px 0}',
    '#cm-rail-foot{flex:0 0 auto;padding:8px 0 14px;border-top:1px solid rgba(255,255,255,.12)}',

    '.cm-nav-item{position:relative;display:flex;align-items:center;gap:16px;height:44px;padding:0 14px;',
    'color:rgba(255,255,255,.86);text-decoration:none;font-size:14px;font-weight:500;',
    'border-left:3px solid transparent;background:0 0;border-top:0;border-right:0;border-bottom:0;',
    'width:100%;cursor:pointer;font-family:inherit;text-align:left;transition:background .15s ease}',
    '.cm-nav-item:hover{background:rgba(255,255,255,.10);color:#fff}',
    '.cm-nav-item.is-active{background:rgba(200,169,81,.16);color:#fff;border-left-color:var(--cm-gold)}',
    '.cm-nav-item.is-active .material-symbols-outlined{color:var(--cm-gold)}',
    '.cm-nav-item .material-symbols-outlined{font-size:22px;flex:0 0 auto;line-height:1}',
    '.cm-nav-label{white-space:nowrap;overflow:hidden}',

    /* collapsed rail: icons only, label becomes a hover tooltip */
    'body[data-nav-state="mini"] #cm-sidebar{width:var(--cm-rail-mini)}',
    'body[data-nav-state="mini"] #cm-rail-logo,',
    'body[data-nav-state="mini"] #cm-rail-portal,',
    'body[data-nav-state="mini"] .cm-nav-label{display:none}',
    'body[data-nav-state="mini"] .cm-nav-item{padding:0 0 0 11px;gap:0}',
    'body[data-nav-state="mini"] .cm-nav-item::after{content:attr(data-tip);position:absolute;left:calc(100% + 8px);',
    'top:50%;transform:translateY(-50%);background:var(--cm-walnut-deep);color:#fff;font-size:12px;',
    'padding:5px 9px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;',
    'transition:opacity .12s ease;box-shadow:0 2px 8px rgba(0,0,0,.35);z-index:5}',
    'body[data-nav-state="mini"] .cm-nav-item:hover::after{opacity:1}',

    /* mobile / tablet: off-canvas overlay */
    '@media(max-width:' + (DESKTOP - 1) + 'px){',
    '#cm-sidebar{transform:translateX(-100%);width:var(--cm-rail);box-shadow:0 0 24px rgba(0,0,0,.35)}',
    'body[data-nav-open="1"] #cm-sidebar{transform:translateX(0)}',
    'body[data-nav-open="1"] #cm-backdrop{opacity:1;pointer-events:auto}}',
    '#cm-backdrop{position:fixed;inset:0;z-index:65;background:rgba(0,0,0,.5);opacity:0;',
    'pointer-events:none;transition:opacity .18s ease}',
    '@media(min-width:' + DESKTOP + 'px){#cm-backdrop{display:none}}',

    /* legacy pages set `sticky top-0` on their own bars; keep them below ours */
    '#cm-header,#cm-sidebar{will-change:transform}',
    '@media print{#cm-header,#cm-sidebar,#cm-backdrop{display:none!important}body{padding:0!important}}'
  ].join('');

  function injectCSS() {
    var s = document.createElement('style');
    s.id = 'cm-nav-style';
    s.textContent = CSS;
    document.head.appendChild(s);
    // Material Symbols may not be loaded on every page — make sure it is.
    if (!document.querySelector('link[href*="Material+Symbols"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
      document.head.appendChild(l);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  function icon(name) {
    return '<span class="material-symbols-outlined" aria-hidden="true">' + name + '</span>';
  }

  function buildHeader(title) {
    var el = document.createElement('header');
    el.id = 'cm-header';
    el.innerHTML =
      '<button class="cm-iconbtn" id="cm-toggle" aria-label="Toggle navigation" aria-expanded="false">' +
        icon('menu') +
      '</button>' +
      '<a href="/home" id="cm-header-home" style="display:flex;align-items:center;text-decoration:none">' +
        '<img src="/logo.png" alt="Cremona Music" id="cm-header-logo"/>' +
        '<span id="cm-header-wordmark" hidden>Cremona Music</span>' +
      '</a>' +
      '<h1 id="cm-pagename">' + escapeHTML(title) + '</h1>' +
      '<a href="/account" class="cm-iconbtn" id="cm-account" aria-label="Account">' +
        icon('account_circle') +
      '</a>';

    // Below 650px swap to the compact mark; if neither image exists fall back
    // to the wordmark so the header never shows a broken-image glyph.
    var img = el.querySelector('#cm-header-logo');
    var wordmark = el.querySelector('#cm-header-wordmark');
    img.addEventListener('error', function () {
      img.style.display = 'none';
      wordmark.hidden = false;
    });
    var mq = window.matchMedia('(max-width:649px)');
    // There is no separate compact mark in the supplied artwork, so the
    // horizontal logo simply scales down and is hidden outright below 450px.
    var applyMark = function () {
      img.style.display = '';
      wordmark.hidden = true;
      img.src = '/logo.png';
    };
    applyMark();
    addMQListener(mq, applyMark);

    // The teacher home link is wrong for the other portals.
    var portalHome = { teacher: '/home', admin: '/admin/dashboard', parent: '/parent/dashboard' };
    el.querySelector('#cm-header-home').href = portalHome[detectPortal()] || '/home';
    return el;
  }

  function buildSidebar(nav, activeId) {
    var el = document.createElement('aside');
    el.id = 'cm-sidebar';
    el.setAttribute('aria-label', nav.label);

    var links = nav.items.map(function (it) {
      var active = it.id === activeId ? ' is-active' : '';
      return '<a class="cm-nav-item' + active + '" href="' + it.href + '" data-tip="' + escapeHTML(it.label) + '"' +
             (active ? ' aria-current="page"' : '') + '>' +
             icon(it.icon) + '<span class="cm-nav-label">' + escapeHTML(it.label) + '</span></a>';
    }).join('');

    el.innerHTML =
      '<div id="cm-rail-head">' +
        '<img src="/logo-stacked.png" alt="" id="cm-rail-logo"/>' +
        '<span id="cm-rail-portal">' + escapeHTML(nav.label) + '</span>' +
      '</div>' +
      '<nav id="cm-rail-nav">' + links + '</nav>' +
      (nav.signOut
        ? '<div id="cm-rail-foot">' +
            '<button class="cm-nav-item" id="cm-signout" data-tip="Sign Out" type="button">' +
              icon('logout') + '<span class="cm-nav-label">Sign Out</span>' +
            '</button>' +
          '</div>'
        : '');

    var railLogo = el.querySelector('#cm-rail-logo');
    railLogo.addEventListener('error', function () { railLogo.style.display = 'none'; });
    return el;
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Safari < 14 has no addEventListener on MediaQueryList.
  function addMQListener(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  // ── State ──────────────────────────────────────────────────────────────────
  function isDesktop() { return window.innerWidth >= DESKTOP; }

  function readCollapsed() {
    try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; }
  }
  function writeCollapsed(v) {
    try { localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch (e) {}
  }

  function applyState() {
    var body = document.body;
    if (isDesktop()) {
      body.setAttribute('data-nav-state', readCollapsed() ? 'mini' : 'open');
      body.removeAttribute('data-nav-open');
    } else {
      // On small screens the rail never pushes content; it slides over it.
      body.setAttribute('data-nav-state', 'overlay');
    }
    var t = document.getElementById('cm-toggle');
    if (t) {
      t.setAttribute('aria-expanded',
        isDesktop() ? String(!readCollapsed()) : String(body.getAttribute('data-nav-open') === '1'));
    }
  }

  function toggle() {
    if (isDesktop()) {
      writeCollapsed(!readCollapsed());
    } else {
      var open = document.body.getAttribute('data-nav-open') === '1';
      if (open) document.body.removeAttribute('data-nav-open');
      else document.body.setAttribute('data-nav-open', '1');
    }
    applyState();
  }

  function closeOverlay() {
    document.body.removeAttribute('data-nav-open');
    applyState();
  }

  // ── Sign out (admin rail) ──────────────────────────────────────────────────
  // Firebase is loaded as an ES module per page, so reach for whatever the page
  // exposed; fall back to clearing local state and returning to the login page.
  function signOut() {
    var done = function () {
      try {
        localStorage.removeItem('cremona-login-at');
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && k.indexOf('cremona-session-') === 0) localStorage.removeItem(k);
        }
      } catch (e) {}
      location.href = '/';
    };
    try {
      if (window.cremonaSignOut) { Promise.resolve(window.cremonaSignOut()).then(done, done); return; }
      if (window.firebaseAuth && window.firebaseAuth.signOut) {
        window.firebaseAuth.signOut().then(done, done); return;
      }
    } catch (e) {}
    done();
  }

  // ── Mount ──────────────────────────────────────────────────────────────────
  function mount() {
    if (document.getElementById('cm-sidebar')) return; // idempotent
    if (document.body.hasAttribute('data-no-portal-nav')) return;

    var portal = detectPortal();
    var nav = NAV[portal];
    var activeId = detectPage();

    injectCSS();

    // Retire the page's own top bar — the shared chrome replaces it.
    var legacy = document.querySelector('body > header');
    if (legacy) legacy.remove();

    var header = buildHeader(pageTitle(nav, activeId));
    var sidebar = buildSidebar(nav, activeId);
    var backdrop = document.createElement('div');
    backdrop.id = 'cm-backdrop';

    document.body.insertBefore(backdrop, document.body.firstChild);
    document.body.insertBefore(sidebar, document.body.firstChild);
    document.body.insertBefore(header, document.body.firstChild);

    header.querySelector('#cm-toggle').addEventListener('click', toggle);
    backdrop.addEventListener('click', closeOverlay);
    var so = sidebar.querySelector('#cm-signout');
    if (so) so.addEventListener('click', signOut);

    // Tapping a destination on mobile should dismiss the overlay.
    sidebar.addEventListener('click', function (e) {
      if (e.target.closest('.cm-nav-item') && !isDesktop()) closeOverlay();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.getAttribute('data-nav-open') === '1') closeOverlay();
    });

    window.addEventListener('resize', applyState);
    applyState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.CremonaNav = { mount: mount, toggle: toggle, close: closeOverlay };
})();
