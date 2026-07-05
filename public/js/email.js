/* ============================================================================
 * Cremona Music Portal — email notifications via Resend
 * ----------------------------------------------------------------------------
 * Plain script (not a module) — exposes window.sendEmail() for use from any
 * portal page's inline <script type="module"> block. No SDK, just fetch.
 *
 *   <script src="/js/email.js"></script>
 *   await sendEmail('parent@example.com', 'Subject', '<p>Body</p>');
 *
 * NOTE: the Resend API key below is embedded in a publicly-served static
 * file, so it is visible to anyone who views source on this site. Anyone
 * with the key can send email "from" Cremona Music via Resend. Rotate the
 * key in the Resend dashboard if it's ever leaked/abused, and consider a
 * server-side relay (Cloud Function) once the project can move off the
 * Spark billing plan.
 * ==========================================================================*/
(function () {
  "use strict";

  var RESEND_API_KEY = "re_cefeFLbr_4ueBxyoKFvXqzQLrT7De6jBB";
  var FROM_ADDRESS    = "Cremona Music <onboarding@resend.dev>";

  // ── Core sender ────────────────────────────────────────────────────────────
  window.sendEmail = async function (to, subject, html) {
    try {
      var res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from: FROM_ADDRESS, to: to, subject: subject, html: html })
      });
      if (!res.ok) {
        var body = await res.text().catch(function () { return ""; });
        console.error("[sendEmail] Resend API error", res.status, body);
      }
      return res.ok;
    } catch (e) {
      console.error("[sendEmail] failed", e);
      return false;
    }
  };

  // ── Shared HTML wrapper — walnut header, cream background, gold accent ────
  window.cremonaEmailWrapper = function (bodyHtml) {
    return (
      '<div style="font-family:Inter,Arial,sans-serif;background:#FAF6EF;padding:32px 16px;">' +
        '<div style="max-width:520px;margin:0 auto;background:#FFFDF9;border-radius:16px;overflow:hidden;border:1px solid #E8DCC8;">' +
          '<div style="background:#3B2A1E;padding:24px 32px;text-align:center;">' +
            '<span style="color:#C9A227;font-size:20px;font-weight:700;letter-spacing:.02em;">Cremona Music</span>' +
          '</div>' +
          '<div style="padding:32px;color:#3E2C23;font-size:14px;line-height:1.6;">' +
            bodyHtml +
          '</div>' +
          '<div style="background:#F0E8D6;padding:20px 32px;text-align:center;color:#8B6B52;font-size:11px;line-height:1.6;">' +
            'Cremona Music of Strings (SA0147428-W)<br>' +
            'EduSentral, VB04-01, No.1, Jalan Setia Murni U13/51, Seksyen U13, Setia Alam, 40170 Shah Alam, Selangor, Malaysia<br>' +
            'T +60 12 298 8255 | www.cremonastrings-music.com' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  };

  // ── Reusable gold CTA button ───────────────────────────────────────────────
  window.cremonaEmailButton = function (href, label) {
    return '<a href="' + href + '" target="_blank" rel="noopener" ' +
      'style="display:inline-block;margin-top:16px;padding:12px 24px;background:#C9A227;color:#3E2C23;' +
      'font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">' + label + '</a>';
  };
})();
