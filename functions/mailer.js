// Gmail API sender — replaces EmailJS.
//
// Keyless domain-wide delegation: the function runs as the App Engine service
// account (cremona-portal@appspot.gserviceaccount.com), which has been granted
// domain-wide delegation for the gmail.send scope in Google Workspace. We sign
// a JWT for it (via IAM Credentials signJwt — no downloaded key), impersonate
// the real mailbox op@cremonamusic.com, and send the message.
//
// The From header uses support@cremonamusic.com, which is an alias (alternative
// email) of op@ — so Gmail accepts it as a valid send-as address, and replies
// land back in op@'s inbox.
//
// Requires (one-time, in Google Cloud / Workspace):
//   1. Gmail API enabled on the project.
//   2. The App Engine SA granted "Service Account Token Creator" on itself
//      (so it can sign its own JWT).
//   3. Domain-wide delegation authorised for the SA's client ID with scope
//      https://www.googleapis.com/auth/gmail.send.

const { GoogleAuth } = require('google-auth-library');

const SA_EMAIL = process.env.GMAIL_SENDER_SA || 'cremona-portal@appspot.gserviceaccount.com';
const IMPERSONATE = process.env.GMAIL_IMPERSONATE || 'op@cremonamusic.com'; // real mailbox
const FROM = process.env.GMAIL_FROM || 'CREMONA Portal <support@cremonamusic.com>'; // alias of op@
const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

let cached = { token: null, exp: 0 };

// Access token for the impersonated user, via keyless signJwt + JWT-bearer grant.
async function getDelegatedToken() {
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const { token: adcToken } = await client.getAccessToken();

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: SA_EMAIL,
    sub: IMPERSONATE,
    scope: SEND_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  // 1) IAM Credentials signs the JWT as the SA (needs Token Creator on itself)
  const signRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(SA_EMAIL)}:signJwt`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adcToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify(claims) }),
    }
  );
  if (!signRes.ok) throw new Error(`signJwt failed ${signRes.status}: ${await signRes.text()}`);
  const { signedJwt } = await signRes.json();

  // 2) Exchange the signed JWT for a delegated access token
  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }).toString(),
  });
  if (!tokRes.ok) throw new Error(`token exchange failed ${tokRes.status}: ${await tokRes.text()}`);
  const tok = await tokRes.json();

  cached = { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 };
  return cached.token;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRawMessage({ to, subject, html }) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const message = [
    `From: ${FROM}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].join('\r\n');
  return b64url(message);
}

// Send an HTML email. Returns the Gmail message id.
async function sendMail({ to, subject, html }) {
  if (!to || !subject || !html) throw new Error('sendMail requires to, subject, html');
  const token = await getDelegatedToken();
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(IMPERSONATE)}/messages/send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: buildRawMessage({ to, subject, html }) }),
    }
  );
  if (!res.ok) throw new Error(`Gmail send failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

module.exports = { sendMail };
