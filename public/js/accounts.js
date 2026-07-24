// ── Cremona Music multi-account switcher ───────────────────────────────────────────
// Lets one browser hold several signed-in accounts (e.g. a teacher with two
// accounts) and swap between them without typing passwords again.
//
// How it works: Firebase keeps the active login session in IndexedDB. We copy
// that session into a per-account vault (localStorage 'cremona-session-<uid>')
// and keep a directory in 'cremona-accounts'. Switching = write the chosen
// session back into Firebase's slot and reload. Same trust level as "stay
// logged in" — nothing new is stored beyond what Firebase already keeps.
//
// Loaded on every page by theme.js. No Firebase SDK dependency.
// notifbell.js calls captureCurrent() with the profile after login.
(function () {
  var API_KEY = 'REPLACE_ME_CREMONA_API_KEY';
  var IDB_KEY = 'firebase:authUser:' + API_KEY + ':[DEFAULT]';
  var LS_LIST = 'cremona-accounts';
  var LS_HB = 'cremona-hb';
  var RELAUNCH_GAP = 120000; // no open portal tab for 2 min = relaunch

  // heartbeat: prove "a portal tab was open recently"
  var prevHb = 0;
  try { prevHb = parseInt(localStorage.getItem(LS_HB), 10) || 0; } catch (e) {}
  function beat() { try { localStorage.setItem(LS_HB, String(Date.now())); } catch (e) {} }
  setInterval(beat, 20000);

  // ── IndexedDB access to Firebase's session slot ──
  function withDb(fn) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('firebaseLocalStorageDb');
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('firebaseLocalStorage')) {
          req.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
        }
      };
      req.onsuccess = function () { fn(req.result, resolve, reject); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGetSession() {
    return withDb(function (db, resolve) {
      try {
        var tx = db.transaction('firebaseLocalStorage', 'readonly');
        var g = tx.objectStore('firebaseLocalStorage').get(IDB_KEY);
        g.onsuccess = function () { resolve(g.result ? g.result.value : null); db.close(); };
        g.onerror = function () { resolve(null); db.close(); };
      } catch (e) { resolve(null); db.close(); }
    });
  }
  function idbSetSession(value) {
    return withDb(function (db, resolve, reject) {
      var tx = db.transaction('firebaseLocalStorage', 'readwrite');
      tx.objectStore('firebaseLocalStorage').put({ fbase_key: IDB_KEY, value: value });
      tx.oncomplete = function () { resolve(); db.close(); };
      tx.onerror = function () { reject(tx.error); db.close(); };
    });
  }

  // ── Account directory ──
  function list() {
    try { return JSON.parse(localStorage.getItem(LS_LIST)) || []; } catch (e) { return []; }
  }
  function saveList(a) { try { localStorage.setItem(LS_LIST, JSON.stringify(a)); } catch (e) {} }
  function forget(uid) {
    saveList(list().filter(function (a) { return a.uid !== uid; }));
    try { localStorage.removeItem('cremona-session-' + uid); } catch (e) {}
  }

  // Save the live session into the vault + upsert the directory entry.
  // profile = {uid, email, name, role} (optional — merges with what we know)
  function captureCurrent(profile) {
    return idbGetSession().then(function (session) {
      if (!session || !session.uid) return null;
      try { localStorage.setItem('cremona-session-' + session.uid, JSON.stringify(session)); } catch (e) { return null; }
      var accounts = list();
      var loginAt = parseInt(localStorage.getItem('cremona-login-at'), 10) || Date.now();
      var idx = accounts.findIndex(function (a) { return a.uid === session.uid; });
      var entry = idx !== -1 ? accounts[idx] : { uid: session.uid, loginAt: loginAt };
      entry.email = (profile && profile.email) || session.email || entry.email || '';
      if (profile && profile.name) entry.name = profile.name;
      if (profile && profile.role) entry.role = profile.role;
      entry.loginAt = loginAt; // always track the CURRENT session's login time
      entry.savedAt = Date.now();
      if (idx === -1) accounts.push(entry); else accounts[idx] = entry;
      saveList(accounts);
      return entry;
    }).catch(function () { return null; });
  }

  function homeFor(role) {
    return role === 'admin' ? '/admin/dashboard' : role === 'parent' ? '/parent/dashboard' : '/home';
  }

  var MAX_SESSION_MS = 14 * 24 * 60 * 60 * 1000; // same 14-day policy as theme.js

  // Swap the active session and reload into that account's home page.
  function switchTo(uid) {
    var acct = list().find(function (a) { return a.uid === uid; });
    var raw = null;
    try { raw = localStorage.getItem('cremona-session-' + uid); } catch (e) {}
    if (!acct || !raw) { alert('That account’s saved session is gone — please sign in once.'); location.href = '/?add=1'; return; }
    // enforce the 2-week policy here too — otherwise restoring an old
    // session bounces forever between the expiry check and the chooser
    if (acct.loginAt && Date.now() - acct.loginAt > MAX_SESSION_MS) {
      forget(uid);
      alert('For security, that saved login expired after 2 weeks — please sign in again.');
      location.href = '/?add=1';
      return;
    }
    // keep the outgoing session fresh in the vault first
    captureCurrent().then(function () {
      return idbSetSession(JSON.parse(raw));
    }).then(function () {
      try { localStorage.setItem('cremona-login-at', String(acct.loginAt || Date.now())); } catch (e) {}
      beat();
      location.replace(homeFor(acct.role));
    }).catch(function (e) {
      alert('Could not switch accounts: ' + e.message);
    });
  }

  // ── Chooser overlay ──
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function roleLabel(r) { return r === 'admin' ? 'Admin' : r === 'parent' ? 'Parent' : 'Teacher'; }

  function showChooser(currentUid, opts) {
    if (document.getElementById('cremona-acct-chooser')) return;
    opts = opts || {};
    // silently drop sessions past the 14-day policy
    list().forEach(function (a) {
      if (a.uid !== currentUid && a.loginAt && Date.now() - a.loginAt > MAX_SESSION_MS) forget(a.uid);
    });
    var accounts = list();
    if (!accounts.length) return;
    var dark = document.documentElement.classList.contains('cremona-dark');
    var card = dark ? '#1a2027' : '#ffffff';
    var text = dark ? '#e3e6ea' : '#2B2019';
    var mut = dark ? '#9aa4ad' : '#7A6A57';
    var bord = dark ? 'rgba(255,255,255,.09)' : '#e5e5e5';
    var hov = dark ? '#2E241C' : '#F6F0E6';

    var wrap = document.createElement('div');
    wrap.id = 'cremona-acct-chooser';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);font-family:\'Pretendard Variable\',Pretendard,Inter,sans-serif;';
    var rows = accounts.map(function (a) {
      var initials = (a.name || a.email || '?').split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
      var isCur = a.uid === currentUid;
      return '<div style="display:flex;align-items:center;gap:4px;">' +
        '<button data-acct="' + esc(a.uid) + '" style="flex:1;display:flex;align-items:center;gap:12px;padding:12px;border:1px solid ' + bord + ';border-radius:14px;background:transparent;cursor:pointer;text-align:left;transition:background .15s;color:' + text + ';" ' +
          'onmouseover="this.style.background=\'' + hov + '\'" onmouseout="this.style.background=\'transparent\'">' +
          '<span style="width:38px;height:38px;border-radius:50%;background:linear-gradient(180deg,#ffd54f,#C8A951);color:#2A1D14;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0;">' + esc(initials) + '</span>' +
          '<span style="min-width:0;">' +
            '<span style="display:block;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(a.name || a.email) + (isCur ? ' <span style="font-weight:500;font-size:11px;color:' + mut + ';">(current)</span>' : '') + '</span>' +
            '<span style="display:block;font-size:12px;color:' + mut + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(roleLabel(a.role)) + ' · ' + esc(a.email) + '</span>' +
          '</span>' +
        '</button>' +
        '<button data-forget="' + esc(a.uid) + '" title="Remove from this device" style="border:none;background:transparent;color:' + mut + ';cursor:pointer;font-size:16px;padding:8px;border-radius:8px;">✕</button>' +
      '</div>';
    }).join('');

    wrap.innerHTML =
      '<div style="width:100%;max-width:400px;background:' + card + ';border-radius:22px;padding:26px;box-shadow:0 32px 80px -20px rgba(0,0,0,.5);">' +
        '<img src="/logo.png" alt="Cremona Music" style="height:30px;border-radius:8px;margin-bottom:14px;"/>' +
        '<h2 style="margin:0 0 2px;font-size:19px;font-weight:800;color:' + text + ';">Choose an account</h2>' +
        '<p style="margin:0 0 16px;font-size:13px;color:' + mut + ';">Pick which account to use on this device.</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' + rows + '</div>' +
        '<button id="cremona-acct-other" style="margin-top:14px;width:100%;padding:11px;border-radius:12px;border:1px dashed ' + bord + ';background:transparent;color:' + mut + ';font-size:13px;font-weight:700;cursor:pointer;">+ Use another account</button>' +
      '</div>';
    document.body.appendChild(wrap);

    wrap.querySelectorAll('[data-acct]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var uid = btn.getAttribute('data-acct');
        if (uid === currentUid) { wrap.remove(); beat(); return; }
        btn.style.opacity = '.5';
        switchTo(uid);
      });
    });
    wrap.querySelectorAll('[data-forget]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var uid = btn.getAttribute('data-forget');
        var a = list().find(function (x) { return x.uid === uid; });
        if (!confirm('Remove ' + ((a && (a.name || a.email)) || 'this account') + ' from this device?')) return;
        forget(uid);
        wrap.remove();
        if (list().length) showChooser(currentUid, opts); else beat();
      });
    });
    document.getElementById('cremona-acct-other').addEventListener('click', function () {
      wrap.remove();
      beat();
      if (opts.onOther) opts.onOther();
      else location.href = '/?add=1';
    });
  }

  // ── Automatic triggers ──
  var isLoginPage = location.pathname === '/' || location.pathname.indexOf('/index') === 0;
  var wantsFreshLogin = /[?&](add|expired|reset)=1/.test(location.search);

  function autorun() {
    idbGetSession().then(function (session) {
      if (isLoginPage) {
        // logged out on the login page with saved accounts → offer them
        if (!session && list().length && !wantsFreshLogin) {
          showChooser(null, { onOther: function () {} });
        }
        beat();
        return;
      }
      // relaunch with 2+ accounts → ask which one to use
      var relaunch = Date.now() - prevHb > RELAUNCH_GAP;
      if (session && list().length >= 2 && relaunch) showChooser(session.uid);
      beat();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autorun);
  else autorun();

  window.CremonaAccounts = {
    list: list,
    captureCurrent: captureCurrent,
    switchTo: switchTo,
    forget: forget,
    showChooser: showChooser,
    homeFor: homeFor,
  };
})();
