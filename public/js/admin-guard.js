// Per-admin feature permissions.
//
// users/{uid}.adminPermissions = ['accounts','security','resources','students',
//   'schedule','messages','reports','salary','payments','billing']
//
// - Field ABSENT (or not an array)  → super admin: full access, and only super
//   admins can edit other admins' permissions (enforced in firestore.rules).
// - Field present → the admin can only open the listed modules; other modules
//   are hidden from the nav and redirect away if opened directly.
//
// Each admin page calls: window.applyAdminPermissions(userData, '<moduleKey>')
// right after confirming role === 'admin'. Returns false if redirected.
(function () {
  var MODULES = {
    accounts: 'accounts',
    security: 'security',
    resources: 'resources',
    students: 'students',
    leveltests: 'level-tests',
    schedule: 'schedule-admin',
    messages: 'messages-admin',
    reports: 'reports-admin',
    salary: 'salary-admin',
    payments: 'payments-admin',
    billing: 'billing-admin',
  };
  window.CREMONA_ADMIN_MODULES = MODULES;

  window.isSuperAdmin = function (userData) {
    return !userData || !Array.isArray(userData.adminPermissions);
  };

  window.applyAdminPermissions = function (userData, pageKey) {
    var perms = userData && userData.adminPermissions;
    if (!Array.isArray(perms)) return true; // super admin — everything allowed

    // Hide nav links to modules this admin can't access
    var pageToKey = {};
    Object.keys(MODULES).forEach(function (k) { pageToKey[MODULES[k]] = k; });
    document.querySelectorAll('nav a').forEach(function (a) {
      var href = (a.getAttribute('href') || '')
        .replace(/^\.\//, '').replace(/^\//, '').replace(/^admin\//, '').replace(/\.html$/, '');
      var key = pageToKey[href];
      if (key && perms.indexOf(key) === -1) a.style.display = 'none';
    });

    // Block direct access to a module the admin doesn't have
    if (pageKey && perms.indexOf(pageKey) === -1) {
      var firstAllowed = Object.keys(MODULES).filter(function (k) {
        return perms.indexOf(k) !== -1;
      })[0];
      if (firstAllowed) {
        window.location.href = '/admin/' + MODULES[firstAllowed];
      } else {
        // No modules granted yet (e.g. a brand-new code-created admin) —
        // show a friendly holding screen instead of a redirect loop.
        document.body.innerHTML =
          '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;padding:24px;">' +
          '<div style="text-align:center;max-width:360px;">' +
          '<div style="font-size:40px;margin-bottom:12px;">🔒</div>' +
          '<h1 style="font-size:18px;font-weight:700;margin-bottom:8px;">Access pending</h1>' +
          '<p style="font-size:14px;color:#7A6A57;line-height:1.6;">Your admin account has no features enabled yet. ' +
          'Ask a super admin to grant your access in Accounts → Admin Access, then reload this page.</p>' +
          '</div></div>';
        var overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
      }
      return false;
    }
    return true;
  };
})();
