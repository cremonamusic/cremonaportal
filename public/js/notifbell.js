// ── Cremona Music notification bell ────────────────────────────────────────────────
// Floating bell (bottom-right) on every portal page. Shows the same events
// the mobile app gets pushed: classes scheduled/cancelled, schedule digests,
// reports, payments, salary — everything except chat messages (Messages has
// its own unread indicators). Self-contained: loads its own Firebase compat
// copy, which picks up the page's existing login session automatically.
(function () {
  var CDN = 'https://www.gstatic.com/firebasejs/10.7.1/';
  var CONFIG = {
    apiKey: 'REPLACE_ME_CREMONA_API_KEY',
    authDomain: 'portal.cremonamusic.com',
    projectId: 'cremona-portal',
  };

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var el = document.createElement('script');
      el.src = src; el.onload = res; el.onerror = rej;
      document.head.appendChild(el);
    });
  }

  var LANG = 'en'; // switched to 'ko' if the user's profile prefers Korean
  var TXT = {
    en: { title: 'Notifications', readAll: 'Mark all read', empty: 'No notifications yet.',
          now: 'just now', m: 'm ago', h: 'h ago', d: 'd ago' },
    ko: { title: '알림', readAll: '모두 읽음', empty: '알림이 없습니다.',
          now: '방금 전', m: '분 전', h: '시간 전', d: '일 전' },
  };
  function T() { return TXT[LANG] || TXT.en; }

  function timeAgo(ts) {
    if (!ts || !ts.seconds) return '';
    var s = Math.floor(Date.now() / 1000 - ts.seconds);
    if (s < 60) return T().now;
    if (s < 3600) return Math.floor(s / 60) + T().m;
    if (s < 86400) return Math.floor(s / 3600) + T().h;
    return Math.floor(s / 86400) + T().d;
  }

  var ICONS = {
    'class-scheduled': '📅', 'class-rescheduled': '🔁', 'class-cancelled': '❌',
    'class-reminder': '⏰', 'daily-digest': '🗓️', 'report': '📝',
    'report-pending': '📥', 'report-result': '📊', 'payment': '💳',
    'salary': '💰', 'level-test': '🎓',
  };

  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function boot() {
    if (!window.firebase || !window.firebase.apps) {
      await loadScript(CDN + 'firebase-app-compat.js');
      await loadScript(CDN + 'firebase-auth-compat.js');
      await loadScript(CDN + 'firebase-firestore-compat.js');
    }
    // Must use the DEFAULT app name: Firebase persists the login session per
    // app name, so a custom-named app would never see the signed-in user.
    var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CONFIG);
    var auth = app.auth();
    var db = app.firestore();

    // UI
    var wrap = document.createElement('div');
    wrap.id = 'cremona-notifbell';
    wrap.innerHTML =
      '<button id="inb-btn" aria-label="Notifications" style="position:fixed;right:16px;bottom:76px;z-index:90;width:48px;height:48px;border-radius:50%;border:1px solid rgba(0,0,0,.12);background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer;font-size:21px;line-height:1;">🔔' +
        '<span id="inb-badge" style="display:none;position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#B3261E;color:#fff;font-size:11px;font-weight:800;line-height:20px;padding:0 5px;font-family:sans-serif;">0</span>' +
      '</button>' +
      '<div id="inb-panel" style="display:none;position:fixed;right:16px;bottom:132px;z-index:91;width:340px;max-width:calc(100vw - 32px);max-height:60vh;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.22);font-family:Inter,\'Malgun Gothic\',sans-serif;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff;">' +
          '<b id="inb-title" style="font-size:14px;color:#2B2019;">Notifications</b>' +
          '<button id="inb-readall" style="border:none;background:none;color:#7A5A16;font-size:12px;font-weight:700;cursor:pointer;">Mark all read</button>' +
        '</div>' +
        '<div id="inb-list"></div>' +
      '</div>';
    document.body.appendChild(wrap);

    var btn = document.getElementById('inb-btn');
    var panel = document.getElementById('inb-panel');
    var badge = document.getElementById('inb-badge');
    var list = document.getElementById('inb-list');
    var items = [];
    var me = null;

    btn.addEventListener('click', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) panel.style.display = 'none';
    });

    function render() {
      var unread = items.filter(function (n) { return !n.read; }).length;
      badge.style.display = unread ? 'block' : 'none';
      badge.textContent = unread > 99 ? '99+' : String(unread);
      if (!items.length) {
        list.innerHTML = '<p style="padding:24px 16px;font-size:13px;color:#888;text-align:center;">' + T().empty + '</p>';
        return;
      }
      list.innerHTML = items.map(function (n) {
        return '<div data-nid="' + esc(n.id) + '" style="padding:12px 16px;border-bottom:1px solid #f3f3f3;cursor:pointer;' + (n.read ? 'opacity:.55;' : 'background:#f7f9ff;') + '">' +
          '<div style="display:flex;gap:10px;align-items:flex-start;">' +
            '<span style="font-size:18px;">' + (ICONS[n.type] || '🔔') + '</span>' +
            '<div style="flex:1;min-width:0;">' +
              '<p style="margin:0;font-size:13px;font-weight:700;color:#2B2019;">' + esc(n.title) + '</p>' +
              '<p style="margin:2px 0 0;font-size:12.5px;color:#555;line-height:1.5;">' + esc(n.body) + '</p>' +
              '<p style="margin:4px 0 0;font-size:11px;color:#999;">' + timeAgo(n.createdAt) + '</p>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      list.querySelectorAll('[data-nid]').forEach(function (el) {
        el.addEventListener('click', function () {
          var id = el.getAttribute('data-nid');
          db.collection('notifications').doc(id).update({ read: true }).catch(function () {});
        });
      });
    }

    document.getElementById('inb-readall').addEventListener('click', function () {
      items.filter(function (n) { return !n.read; }).forEach(function (n) {
        db.collection('notifications').doc(n.id).update({ read: true }).catch(function () {});
      });
    });

    var lastUid = null;
    auth.onAuthStateChanged(function (user) {
      if (!user) {
        // real sign-out forgets the saved session (shared-computer safety);
        // the add-another-account flow sets a keep flag first
        if (lastUid && window.CremonaAccounts && !window.__cremonaKeepSession) {
          window.CremonaAccounts.forget(lastUid);
        }
        window.__cremonaKeepSession = false;
        lastUid = null;
        wrap.style.display = 'none';
        return;
      }
      lastUid = user.uid;
      wrap.style.display = 'block';
      me = user;

      // One shared header everywhere: rebuilt per role with the person's name.
      db.collection('users').doc(user.uid).get().then(function (snap) {
        var d = snap.exists ? snap.data() : {};
        LANG = d.preferredLanguage === 'ko' ? 'ko' : 'en';
        document.getElementById('inb-title').textContent = T().title;
        document.getElementById('inb-readall').textContent = T().readAll;
        render();
        if (window.CremonaAccounts) window.CremonaAccounts.captureCurrent({
          uid: user.uid, email: user.email,
          name: d.name || user.displayName || '', role: d.role || 'teacher',
        });
        // security trail: one login record per browser session + page visits
        try {
          var sesKey = 'cremona-loginlog-' + user.uid;
          if (!sessionStorage.getItem(sesKey)) {
            sessionStorage.setItem(sesKey, '1');
            user.getIdToken().then(function (t) {
              fetch('/api/logLogin', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: t }),
              }).catch(function () {});
            });
          }
          db.collection('activityLogs').add({
            uid: user.uid, name: d.name || '', role: d.role || '',
            path: location.pathname,
            at: firebase.firestore.FieldValue.serverTimestamp(),
          }).catch(function () {});
        } catch (e) {}
        renderHeader(d.role || 'teacher', d.name || user.displayName || 'Account', d.adminPermissions);
        maybeCelebrateBirthday(user.uid, d);
      }).catch(function () {});
      // live updates; sorted client-side to avoid a composite index
      db.collection('notifications').where('uid', '==', user.uid).limit(60)
        .onSnapshot(function (snap) {
          items = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
          items.sort(function (a, b) { return (b.createdAt && b.createdAt.seconds || 0) - (a.createdAt && a.createdAt.seconds || 0); });
          items = items.slice(0, 30);
          render();
        }, function (err) { console.warn('[notifbell]', err.message); });
    });
  }

  // ── Birthday: a little celebration on the site itself ─────────────────────
  function maybeCelebrateBirthday(uid, d) {
    try {
      if (!d.dob) return;
      var now = new Date();
      var md = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      if (String(d.dob).slice(5) !== md) return;
      var guard = 'cremona-bday-' + uid + '-' + now.getFullYear();
      if (localStorage.getItem(guard)) return;
      localStorage.setItem(guard, '1');

      var firstName = d.firstName || (d.name || '').split(' ')[0] || '';
      var ko = LANG === 'ko';
      var dark = document.documentElement.classList.contains('cremona-dark');
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483200;pointer-events:none;overflow:hidden;';
      var confetti = '';
      var emojis = ['🎉', '🎂', '🎈', '✨', '🎁', '🥳'];
      for (var i = 0; i < 24; i++) {
        confetti += '<span style="position:absolute;top:-40px;left:' + (Math.random() * 100) + '%;font-size:' + (16 + Math.random() * 16) + 'px;animation:cremonaBdayFall ' + (3 + Math.random() * 3) + 's linear ' + (Math.random() * 2.5) + 's forwards;">' + emojis[i % emojis.length] + '</span>';
      }
      wrap.innerHTML =
        '<style>@keyframes cremonaBdayFall{to{transform:translateY(110vh) rotate(340deg);opacity:.9;}}@keyframes cremonaBdayPop{from{opacity:0;transform:translate(-50%,-16px) scale(.94);}to{opacity:1;transform:translate(-50%,0) scale(1);}}</style>' +
        confetti +
        '<div style="position:absolute;top:84px;left:50%;transform:translate(-50%,0);pointer-events:auto;background:' + (dark ? '#1a2027' : '#fff') + ';color:' + (dark ? '#e3e6ea' : '#2B2019') + ';border:1px solid ' + (dark ? 'rgba(255,255,255,.1)' : '#f0e6c8') + ';border-radius:20px;padding:18px 26px;box-shadow:0 24px 60px -16px rgba(0,0,0,.35);text-align:center;animation:cremonaBdayPop .4s cubic-bezier(.22,1,.36,1);max-width:92vw;">' +
          '<div style="font-size:34px;line-height:1;">🎂</div>' +
          '<p style="margin:8px 0 2px;font-size:17px;font-weight:800;">' + (ko ? '생일 축하합니다, ' + esc(firstName) + '님!' : 'Happy Birthday, ' + esc(firstName) + '!') + '</p>' +
          '<p style="margin:0;font-size:12.5px;color:' + (dark ? '#9aa4ad' : '#7A6A57') + ';">' + (ko ? 'Cremona Music 가족 모두가 행복한 하루를 기원합니다 🎉' : 'Everyone at Cremona Music wishes you a wonderful day 🎉') + '</p>' +
        '</div>';
      document.body.appendChild(wrap);
      setTimeout(function () { wrap.style.transition = 'opacity .6s'; wrap.style.opacity = '0'; }, 9000);
      setTimeout(function () { wrap.remove(); }, 9800);
      wrap.addEventListener('click', function () { wrap.remove(); });
    } catch (e) {}
  }

  // ── Shared header: identical structure on every page, links by role ───────
  var NAVS = {
    teacher: [
      ['Home', '/home'], ['Books', '/books'], ['Schedule', '/schedule'],
      ['Messages', '/messages'], ['Students', '/students-teacher'],
      ['Homework', '/homework'],
      ['Level Tests', '/level-tests'], ['Comments', '/comments'], ['Salary', '/salary'],
      ['Documents', '/documents'],
    ],
    parent: [
      ['Dashboard', '/parent/dashboard'], ['Schedule', '/parent/schedule'],
      ['Messages', '/parent/messages'], ['Payments', '/parent/payments'], ['Comments', '/parent/comments'],
    ],
    admin: [
      ['Home', '/admin/dashboard'],
      ['Accounts', '/admin/accounts', 'accounts'], ['Security', '/admin/security', 'security'],
      ['Resources', '/admin/resources', 'resources'], ['Students', '/admin/students', 'students'],
      ['Level Tests', '/admin/level-tests', 'leveltests'],
      ['Schedule', '/admin/schedule-admin', 'schedule'], ['Messages', '/admin/messages-admin', 'messages'],
      ['Comments', '/admin/comments-admin', 'reports'], ['Salary', '/admin/salary-admin', 'salary'],
      ['Payments', '/admin/payments-admin', 'payments'], ['Billing', '/admin/billing-admin', 'billing'],
    ],
  };

  function renderHeader(role, name, adminPerms) {
    var header = document.querySelector('body > header') || document.querySelector('header');
    if (!header) return;

    var links = NAVS[role] || NAVS.teacher;
    if (role === 'admin' && Array.isArray(adminPerms)) {
      links = links.filter(function (l) { return !l[2] || adminPerms.indexOf(l[2]) !== -1; });
    }

    var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    var nav = links.map(function (l) {
      var active = path === l[1];
      return '<a href="' + l[1] + '" class="whitespace-nowrap text-sm ' +
        (active
          ? 'font-bold text-secondary border-b-2 border-secondary pb-0.5'
          : 'font-medium text-text-muted hover:text-primary transition-colors') +
        '">' + esc(l[0]) + '</a>';
    }).join('');

    // keep page-specific controls (e.g. the parents' language toggle) alive —
    // moving a DOM node preserves its event listeners
    var kept = [];
    ['lang-toggle'].forEach(function (id) {
      var el = header.querySelector('#' + id);
      if (el) kept.push(el);
    });

    var homeHref = role === 'admin' ? '/admin/dashboard' : role === 'parent' ? '/parent/dashboard' : '/home';
    header.removeAttribute('style');
    header.innerHTML =
      '<div class="max-w-[1240px] mx-auto px-6 h-16 flex items-center justify-between gap-4" style="position:relative;">' +
        '<a href="' + homeHref + '" class="flex items-center flex-shrink-0"><img src="/logo.png" alt="Cremona Music" class="h-8 w-auto rounded-lg"/></a>' +
        '<nav class="hidden md:flex items-center gap-5">' + nav + '</nav>' +
        '<div id="hdr-right" class="flex items-center gap-2 flex-shrink-0">' +
          '<div style="position:relative;">' +
            '<button id="hdr-acct-btn" class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-container transition-colors text-sm font-semibold text-text-muted">' +
              '<span class="material-symbols-outlined text-[18px]">account_circle</span>' +
              '<span class="hidden sm:inline-block truncate max-w-[150px] align-middle">' + esc(name) + '</span>' +
              '<span class="material-symbols-outlined text-[16px]">expand_more</span>' +
            '</button>' +
            '<div id="hdr-acct-menu" class="hdr-menu" style="display:none;"></div>' +
          '</div>' +
          (role === 'admin'
            ? '<button id="hdr-signout" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-surface-container transition-colors text-sm font-semibold text-text-muted"><span class="material-symbols-outlined text-[18px]">logout</span><span class="hidden sm:inline">Sign Out</span></button>'
            : '') +
        '</div>' +
      '</div>' +
      // hidden stubs: some pages write the user name into these ids
      '<span id="header-user-name" style="display:none"></span>' +
      '<span id="header-name" style="display:none"></span>';

    var right = header.querySelector('#hdr-right');
    kept.forEach(function (el) { right.insertBefore(el, right.firstChild); });

    var so = header.querySelector('#hdr-signout');
    if (so) so.addEventListener('click', function () { doSignOutForget(); });

    function doSignOutForget() {
      var cur = firebase.app().auth().currentUser;
      if (cur && window.CremonaAccounts) window.CremonaAccounts.forget(cur.uid);
      firebase.app().auth().signOut().finally(function () { location.href = '/'; });
    }

    var acctBtn = header.querySelector('#hdr-acct-btn');
    var acctMenu = header.querySelector('#hdr-acct-menu');
    function hideAcctMenu() { acctMenu.style.display = 'none'; }
    function buildAcctMenu() {
      var cur = firebase.app().auth().currentUser;
      var accounts = window.CremonaAccounts ? window.CremonaAccounts.list() : [];
      var rows = accounts.map(function (a) {
        var isCur = cur && a.uid === cur.uid;
        return '<button class="hdr-menu-item" data-switch="' + esc(a.uid) + '">' +
          '<span class="material-symbols-outlined text-[18px]"' + (isCur ? ' style="color:#1e6e3b;"' : ' style="visibility:hidden;"') + '>check</span>' +
          '<span style="min-width:0;"><span class="hdr-menu-name">' + esc(a.name || a.email) + '</span><span class="hdr-menu-sub">' + esc(a.email) + '</span></span>' +
        '</button>';
      }).join('');
      acctMenu.innerHTML = rows + (rows ? '<hr class="hdr-menu-hr"/>' : '') +
        '<button class="hdr-menu-item" id="hdr-add-acct"><span class="material-symbols-outlined text-[18px]">person_add</span><span>' + (LANG === 'ko' ? '다른 계정 추가' : 'Add another account') + '</span></button>' +
        '<a class="hdr-menu-item" href="/account"><span class="material-symbols-outlined text-[18px]">manage_accounts</span><span>' + (LANG === 'ko' ? '내 계정' : 'My Account') + '</span></a>' +
        '<button class="hdr-menu-item" id="hdr-menu-signout"><span class="material-symbols-outlined text-[18px]">logout</span><span>' + (LANG === 'ko' ? '로그아웃' : 'Sign Out') + '</span></button>';
      acctMenu.querySelectorAll('[data-switch]').forEach(function (b) {
        b.addEventListener('click', function () {
          var uid = b.getAttribute('data-switch');
          if (cur && uid === cur.uid) { hideAcctMenu(); return; }
          b.style.opacity = '.5';
          window.CremonaAccounts.switchTo(uid);
        });
      });
      acctMenu.querySelector('#hdr-add-acct').addEventListener('click', function () {
        window.__cremonaKeepSession = true;
        var go = function () {
          firebase.app().auth().signOut().finally(function () { location.href = '/?add=1'; });
        };
        if (window.CremonaAccounts) window.CremonaAccounts.captureCurrent().then(go, go); else go();
      });
      acctMenu.querySelector('#hdr-menu-signout').addEventListener('click', function () { doSignOutForget(); });
    }
    if (acctBtn) {
      acctBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (acctMenu.style.display === 'block') { hideAcctMenu(); return; }
        buildAcctMenu();
        acctMenu.style.display = 'block';
      });
      document.addEventListener('click', function (e) {
        if (acctMenu.style.display === 'block' && !acctMenu.contains(e.target)) hideAcctMenu();
      });
    }

    // Center the menu only when it fits between the logo and the account
    // area — otherwise leave it in normal flow (no overlapping).
    var navEl = header.querySelector('nav');
    var wrapEl = navEl && navEl.parentElement;
    function centered() {
      var logoBox = wrapEl.children[0].getBoundingClientRect();
      var rightBox = header.querySelector('#hdr-right').getBoundingClientRect();
      var navBox = navEl.getBoundingClientRect();
      return navBox.left >= logoBox.right + 20 && navBox.right <= rightBox.left - 20;
    }
    function fitNav() {
      if (!navEl || !wrapEl) return;
      navEl.style.position = 'absolute';
      navEl.style.left = '50%';
      navEl.style.top = '50%';
      navEl.style.transform = 'translate(-50%, -50%)';
      navEl.style.whiteSpace = 'nowrap';
      // try roomy → tighter gaps → smaller type, keep the first that fits
      navEl.classList.remove('nav-compact');
      navEl.style.gap = '';
      if (centered()) return;
      navEl.style.gap = '14px';
      if (centered()) return;
      navEl.classList.add('nav-compact');
      navEl.style.gap = '12px';
      if (centered()) return;
      // nothing fits centered — let it flow inline at full size
      navEl.classList.remove('nav-compact');
      navEl.style.gap = '14px';
      navEl.style.position = '';
      navEl.style.left = '';
      navEl.style.top = '';
      navEl.style.transform = '';
    }
    // refit whenever real rendered widths change (webfonts swap in late and
    // make the first measurement wrong) — converges, then goes quiet
    var lastW = -1;
    function fitAndRecord() {
      fitNav();
      lastW = navEl.scrollWidth + header.querySelector('#hdr-right').scrollWidth;
    }
    fitAndRecord();
    window.addEventListener('resize', fitAndRecord);
    window.addEventListener('load', fitAndRecord);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAndRecord);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        var w = navEl.scrollWidth + header.querySelector('#hdr-right').scrollWidth;
        if (w !== lastW) fitAndRecord();
      });
      ro.observe(navEl);
      ro.observe(header.querySelector('#hdr-right'));
    }
    [400, 1200, 2500].forEach(function (ms) { setTimeout(fitAndRecord, ms); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
