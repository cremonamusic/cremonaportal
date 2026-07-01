/* ============================================================================
 * Cremona Music Portal — shared navigation (YouTube-style topbar + sidebar)
 * ----------------------------------------------------------------------------
 * Injected on every authed portal page. Behaviour is IDENTICAL everywhere
 * because it all lives here. Each page only sets a small config object:
 *
 *   <script>window.CREMONA_NAV = { portal:'teacher', active:'home', title:'Home' };</script>
 *   <script src="/js/portal-nav.js"></script>
 *
 *   portal : 'teacher' | 'admin' | 'parent'
 *   active : key of the current nav item (see ITEMS below)
 *   title  : text shown centered in the header
 *
 * Sidebar collapse state persists in localStorage under key: sidebarCollapsed
 * ==========================================================================*/
(function () {
  "use strict";

  var LS_KEY = "sidebarCollapsed";                 // <-- persisted collapse state
  var cfg    = window.CREMONA_NAV || {};
  var portal = cfg.portal || "teacher";
  var active = cfg.active || "";
  var title  = cfg.title  || "";

  // ── Nav definitions per portal ────────────────────────────────────────────
  var NAV = {
    teacher: {
      label: "Teacher Portal",
      items: [
        { key: "home",     label: "Home",     icon: "home",          href: "/home.html" },
        { key: "books",    label: "Books",    icon: "menu_book",     href: "/books.html" },
        { key: "schedule", label: "Schedule", icon: "calendar_month", href: "/schedule.html" },
        { key: "messages", label: "Messages", icon: "forum",         href: "/messages.html" },
        { key: "students", label: "Students", icon: "group",         href: "/students-teacher.html" },
        { key: "comments", label: "Comments", icon: "chat",          href: "/comments.html" }
      ],
      signOut: false
    },
    admin: {
      label: "Admin Portal",
      items: [
        { key: "accounts",  label: "Accounts",  icon: "manage_accounts", href: "/admin/accounts.html" },
        { key: "security",  label: "Security",  icon: "security",        href: "/admin/security.html" },
        { key: "resources", label: "Resources", icon: "folder",          href: "/admin/resources.html" },
        { key: "students",  label: "Students",  icon: "group",           href: "/admin/students.html" },
        { key: "schedule",  label: "Schedule",  icon: "calendar_month",  href: "/admin/schedule-admin.html" },
        { key: "messages",  label: "Messages",  icon: "forum",           href: "/admin/messages-admin.html" },
        { key: "comments",  label: "Comments",  icon: "chat",            href: "/admin/comments-admin.html" }
      ],
      signOut: true
    },
    parent: {
      label: "Parent Portal",
      items: [
        { key: "dashboard", label: "Dashboard", icon: "dashboard",      href: "/parent/dashboard.html" },
        { key: "comments",  label: "Comments",  icon: "chat",           href: "/parent/comments.html" },
        { key: "schedule",  label: "Schedule",  icon: "calendar_month", href: "/parent/schedule.html" },
        { key: "messages",  label: "Messages",  icon: "forum",          href: "/parent/messages.html" }
      ],
      signOut: false
    }
  };

  var def = NAV[portal] || NAV.teacher;

  // ── Styles ────────────────────────────────────────────────────────────────
  var css = [
    ":root{--cremona-top:56px;--cremona-open:240px;--cremona-mini:60px;}",

    /* push page content clear of the fixed topbar + sidebar */
    "body{padding-top:var(--cremona-top);padding-left:var(--cremona-open);",
      "transition:padding-left .22s ease;}",
    "html.cremona-collapsed body{padding-left:var(--cremona-mini);}",
    "@media(max-width:1023px){body{padding-left:0 !important;}}",

    /* ── Topbar ── */
    "#cremona-topbar{position:fixed;top:0;left:0;right:0;height:var(--cremona-top);",
      "background:#3B2A1E;display:flex;align-items:center;gap:12px;padding:0 14px;",
      "z-index:60;box-shadow:0 1px 5px rgba(0,0,0,.4);}",
    "#cremona-topbar .ct-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0;}",
    "#cremona-topbar .ct-title{flex:0 0 auto;color:#F5EFE4;font-weight:700;font-size:16px;",
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    "#cremona-topbar .ct-right{display:flex;align-items:center;justify-content:flex-end;flex:1;}",
    "#cremona-topbar button.ct-icon,#cremona-topbar a.ct-icon{display:flex;align-items:center;",
      "justify-content:center;width:40px;height:40px;border-radius:8px;border:0;cursor:pointer;",
      "background:transparent;color:rgba(255,248,235,.85);transition:background .12s,color .12s;}",
    "#cremona-topbar button.ct-icon:hover,#cremona-topbar a.ct-icon:hover{",
      "background:rgba(255,255,255,.08);color:#C9A227;}",
    "#ct-logo{height:34px;width:auto;filter:invert(1) brightness(1.2);display:none;}",   /* desktop-open: hidden */
    "html.cremona-collapsed #ct-logo{display:block;}",                                    /* desktop-collapsed: shown */
    "@media(max-width:1023px){#ct-logo{display:block !important;}}",                       /* mobile: always shown */

    /* ── Sidebar ── */
    "#cremona-sidebar{position:fixed;top:var(--cremona-top);left:0;bottom:0;",
      "width:var(--cremona-open);background:#3B2A1E;z-index:50;display:flex;flex-direction:column;",
      "overflow:hidden;transition:width .22s ease,transform .22s ease;}",
    "#cs-logo-wrap{padding:18px 12px 14px;text-align:center;border-bottom:1px solid rgba(255,255,255,.08);position:relative;}",
    "#cs-logo{max-height:104px;width:auto;margin:0 auto;filter:invert(1) brightness(1.2);}",
    "#cs-portal-label{color:rgba(255,248,235,.6);font-size:11px;font-weight:600;",
      "letter-spacing:.09em;text-transform:uppercase;margin-top:10px;}",
    "#cs-close{display:none;position:absolute;top:10px;right:10px;width:34px;height:34px;",
      "align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;",
      "color:rgba(255,248,235,.8);cursor:pointer;}",
    "#cs-close:hover{background:rgba(255,255,255,.08);color:#fff;}",
    "#cs-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 0;}",
    "#cs-footer{border-top:1px solid rgba(255,255,255,.08);padding:6px 0;}",

    /* nav item: icon + label ALWAYS side-by-side (horizontal row) */
    ".cs-item{display:flex;align-items:center;gap:14px;padding:11px 18px;",
      "color:rgba(255,248,235,.72);font-size:14px;font-weight:500;text-decoration:none;",
      "border-left:3px solid transparent;white-space:nowrap;position:relative;cursor:pointer;",
      "background:transparent;width:100%;text-align:left;font-family:inherit;",
      "transition:background .12s,color .12s;}",
    ".cs-item:hover{background:rgba(255,255,255,.06);color:#fff;}",
    ".cs-item.active{color:#C9A227;border-left-color:#C9A227;background:rgba(201,162,39,.10);font-weight:600;}",
    ".cs-item .material-symbols-outlined{font-size:22px;flex-shrink:0;line-height:1;}",
    ".cs-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;}",

    /* ── Collapsed (desktop only) ── */
    "@media(min-width:1024px){",
      "html.cremona-collapsed #cs-logo-wrap{display:none;}",
      "html.cremona-collapsed .cs-label{display:none;}",
      "html.cremona-collapsed .cs-item{justify-content:center;padding:12px 0;gap:0;border-left-width:0;}",
      "html.cremona-collapsed .cs-item.active{border-left-width:3px;}",
      "html.cremona-collapsed .cs-item:hover::after{content:attr(data-tip);position:absolute;",
        "left:100%;top:50%;transform:translateY(-50%);margin-left:10px;background:#111;color:#fff;",
        "padding:5px 10px;border-radius:6px;font-size:12px;font-weight:500;white-space:nowrap;",
        "z-index:70;box-shadow:0 2px 10px rgba(0,0,0,.45);pointer-events:none;}",
    "}",

    /* ── Mobile: off-canvas overlay ── */
    "@media(max-width:1023px){",
      "#cremona-sidebar{transform:translateX(-100%);width:var(--cremona-open);",
        "box-shadow:2px 0 16px rgba(0,0,0,.45);}",
      "#cremona-sidebar.cremona-mobile-open{transform:translateX(0);}",
      "#cs-close{display:flex;}",
    "}",

    /* ── Backdrop (mobile overlay) ── */
    "#cremona-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:45;",
      "opacity:0;visibility:hidden;transition:opacity .2s;}",
    "#cremona-backdrop.show{opacity:1;visibility:visible;}",
    "@media(min-width:1024px){#cremona-backdrop{display:none;}}"
  ].join("\n");

  // ── Build markup ──────────────────────────────────────────────────────────
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function navItemsHtml() {
    var html = def.items.map(function (it) {
      var isActive = it.key === active ? " active" : "";
      return '<a class="cs-item' + isActive + '" href="' + esc(it.href) + '" data-tip="' + esc(it.label) + '">' +
               '<span class="material-symbols-outlined">' + esc(it.icon) + '</span>' +
               '<span class="cs-label">' + esc(it.label) + '</span>' +
             '</a>';
    }).join("");
    return html;
  }

  function signOutHtml() {
    if (!def.signOut) return "";
    return '<div id="cs-footer">' +
             '<button type="button" class="cs-item" id="cs-signout" data-tip="Sign Out">' +
               '<span class="material-symbols-outlined">logout</span>' +
               '<span class="cs-label">Sign Out</span>' +
             '</button>' +
           '</div>';
  }

  function build() {
    // styles
    var style = document.createElement("style");
    style.id = "cremona-nav-style";
    style.textContent = css;
    document.head.appendChild(style);

    // topbar
    var topbar = document.createElement("header");
    topbar.id = "cremona-topbar";
    topbar.innerHTML =
      '<div class="ct-left">' +
        '<button type="button" class="ct-icon" id="ct-hamburger" aria-label="Toggle menu">' +
          '<span class="material-symbols-outlined">menu</span>' +
        '</button>' +
        '<img id="ct-logo" src="/logo.png" alt="Cremona Music"/>' +
      '</div>' +
      '<div class="ct-title">' + esc(title) + '</div>' +
      '<div class="ct-right">' +
        '<a class="ct-icon" href="/account.html" aria-label="Account">' +
          '<span class="material-symbols-outlined">account_circle</span>' +
        '</a>' +
      '</div>';

    // sidebar
    var sidebar = document.createElement("aside");
    sidebar.id = "cremona-sidebar";
    sidebar.innerHTML =
      '<div id="cs-logo-wrap">' +
        '<button type="button" id="cs-close" aria-label="Close menu"><span class="material-symbols-outlined">close</span></button>' +
        '<img id="cs-logo" src="/logo_stack.png" alt="Cremona Music"/>' +
        '<div id="cs-portal-label">' + esc(def.label) + '</div>' +
      '</div>' +
      '<nav id="cs-nav">' + navItemsHtml() + '</nav>' +
      signOutHtml();

    // backdrop
    var backdrop = document.createElement("div");
    backdrop.id = "cremona-backdrop";

    document.body.appendChild(topbar);
    document.body.appendChild(sidebar);
    document.body.appendChild(backdrop);

    // ── State ──
    var mqDesktop = window.matchMedia("(min-width:1024px)");

    // apply persisted desktop collapse state
    if (localStorage.getItem(LS_KEY) === "true") {
      document.documentElement.classList.add("cremona-collapsed");
    }

    function openMobile()  { sidebar.classList.add("cremona-mobile-open"); backdrop.classList.add("show"); }
    function closeMobile() { sidebar.classList.remove("cremona-mobile-open"); backdrop.classList.remove("show"); }

    function onHamburger() {
      if (mqDesktop.matches) {
        var collapsed = document.documentElement.classList.toggle("cremona-collapsed");
        localStorage.setItem(LS_KEY, collapsed ? "true" : "false");
      } else {
        if (sidebar.classList.contains("cremona-mobile-open")) closeMobile();
        else openMobile();
      }
    }

    document.getElementById("ct-hamburger").addEventListener("click", onHamburger);
    document.getElementById("cs-close").addEventListener("click", closeMobile);
    backdrop.addEventListener("click", closeMobile);

    // sign-out (admin) — use the page's own handler if present
    var so = document.getElementById("cs-signout");
    if (so) {
      so.addEventListener("click", function () {
        if (typeof window.doSignOut === "function") window.doSignOut();
        else window.location.href = "/index.html";
      });
    }

    // close the mobile overlay when growing back to desktop
    var onChange = function () { if (mqDesktop.matches) closeMobile(); };
    if (mqDesktop.addEventListener) mqDesktop.addEventListener("change", onChange);
    else if (mqDesktop.addListener) mqDesktop.addListener(onChange);
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
