// HTML email templates (ported from the EmailJS templates). Each returns
// { subject, html }. Bilingual (Korean + English), matching the existing
// CREMONA Portal account email design.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PORTAL = 'https://portal.cremonamusic.com';

// Shared shell: gold header wordmark + white card + footer.
function shell(innerHtml) {
  return `<div style="margin:0;padding:0;background:#FAF6EF;font-family:Arial,'Malgun Gothic','Apple SD Gothic Neo',Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF6EF;padding:24px 0"><tbody><tr><td align="center">
<table role="presentation" width="480" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E2D7C6">
<tbody>
<tr><td style="background:#3B2A1E;padding:20px 32px"><img src="https://portal.cremonamusic.com/logo.png" width="116" alt="Cremona Music" style="display:block"></td></tr>
<tr><td style="padding:32px">${innerHtml}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #E2D7C6"><p style="font-size:11px;color:#9aa0a6;margin:0">© 2026 CREMONA CO. LTD · <a style="color:#9aa0a6" href="https://cremonamusic.com">cremonamusic.com</a></p></td></tr>
</tbody></table>
</td></tr></tbody></table></div>`;
}

const button = (href, label) =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tbody><tr><td style="padding:4px 0 8px" align="center">
<a style="display:inline-block;background:#3B2A1E;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:13px 36px;border-radius:24px" href="${href}">${label}</a>
</td></tr></tbody></table>`;

// ── Verification code (OTP) — replaces template_co5j3ni ─────────────────────
function otp({ passcode }) {
  const code = esc(passcode);
  const inner = `
<p style="font-size:16px;color:#2B2019;margin:0 0 6px">이메일 인증 <strong>Verify your email</strong></p>
<p style="font-size:13.5px;color:#3c3c3c;line-height:1.7;margin:0 0 4px">아래 인증 코드를 앱에 입력해 주세요. 코드는 5분간 유효합니다.</p>
<p style="font-size:12.5px;color:#7A6A57;line-height:1.7;margin:0 0 20px">Enter this verification code in the app. It expires in 5 minutes.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF6EF;border:1px solid #E2D7C6;border-radius:12px"><tbody><tr><td style="padding:20px" align="center">
<p style="font-size:12px;color:#7A6A57;margin:0 0 6px">인증 코드 · Verification code</p>
<p style="font-size:34px;font-weight:bold;color:#2B2019;letter-spacing:8px;margin:0">${code}</p>
</td></tr></tbody></table>
<p style="font-size:11.5px;color:#9aa0a6;line-height:1.6;margin:20px 0 0">본인이 요청하지 않았다면 이 메일을 무시하세요.<br>If you didn't request this, you can ignore this email.</p>`;
  return { subject: `CREMONA Portal 인증 코드: ${code} · Your verification code`, html: shell(inner) };
}

// ── Account created (credentials) — replaces template_j5czxh7 ───────────────
function credentials({ name, user_email, password, role_ko }) {
  const inner = `
<p style="font-size:16px;color:#2B2019;margin:0 0 6px">Hello <strong>${esc(name)}</strong> 님, 안녕하세요!</p>
<p style="font-size:14px;color:#3c3c3c;line-height:1.7;margin:0 0 6px">Your CREMONA Portal ${esc(role_ko || '')} account has been created. Here are your sign-in details:</p>
<p style="font-size:13.5px;color:#7A6A57;line-height:1.7;margin:0 0 20px">CREMONA Portal ${esc(role_ko || '')} 계정이 생성되었습니다. 아래의 정보로 로그인하세요.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF6EF;border:1px solid #E2D7C6;border-radius:12px"><tbody><tr><td style="padding:16px 20px">
<p style="font-size:12px;color:#7A6A57;margin:0 0 2px">Login ID (email) · 아이디(이메일)</p>
<p style="font-size:15px;color:#2B2019;font-weight:bold;margin:0 0 12px">${esc(user_email)}</p>
<p style="font-size:12px;color:#7A6A57;margin:0 0 2px">Temporary password · 임시 비밀번호</p>
<p style="font-size:15px;color:#2B2019;font-weight:bold;margin:0;letter-spacing:1px">${esc(password)}</p>
</td></tr></tbody></table>
<p style="font-size:13px;color:#3c3c3c;line-height:1.7;margin:20px 0 4px">For your security, please sign in and change this password right away, or use "Forgot password?" to set your own.</p>
<p style="font-size:12.5px;color:#7A6A57;line-height:1.7;margin:0 0 20px">보안을 위해 로그인 후 바로 비밀번호를 변경해 주세요. 또는 로그인 화면의 "비밀번호를 잊으셨나요?"에서 새 비밀번호를 설정할 수 있습니다.</p>
${button(PORTAL, 'Sign in · 로그인하기')}
<p style="font-size:11.5px;color:#9aa0a6;line-height:1.6;margin:20px 0 0">If you did not expect this email, please contact us at <a href="mailto:support@cremonamusic.com">support@cremonamusic.com</a>.<br>이 메일이 예상치 못한 것이라면 <a href="mailto:support@cremonamusic.com">support@cremonamusic.com</a> 로 문의해 주세요.</p>`;
  return { subject: 'Your CREMONA Portal account is ready · CREMONA Portal 계정 안내', html: shell(inner) };
}

// ── Welcome (portal sign-up) — replaces template_v7iq21p ────────────────────
function welcome({ name }) {
  const inner = `
<p style="font-size:16px;color:#2B2019;margin:0 0 6px">Welcome, <strong>${esc(name)}</strong> 님! 환영합니다 🎉</p>
<p style="font-size:14px;color:#3c3c3c;line-height:1.7;margin:0 0 6px">Your CREMONA Portal account is ready. Sign in on the app or the web portal to see your schedule, homework, reports, and messages.</p>
<p style="font-size:13px;color:#7A6A57;line-height:1.7;margin:0 0 20px">CREMONA Portal 계정이 준비되었습니다. 앱 또는 웹 포털에서 로그인하여 수업 일정, 숙제, 리포트, 메시지를 확인하세요.</p>
${button(PORTAL, 'Sign in · 로그인하기')}
<p style="font-size:11.5px;color:#9aa0a6;line-height:1.6;margin:20px 0 0">Questions? <a href="mailto:support@cremonamusic.com">support@cremonamusic.com</a><br>문의: <a href="mailto:support@cremonamusic.com">support@cremonamusic.com</a></p>`;
  return { subject: 'Welcome to CREMONA Portal · CREMONA Portal에 오신 것을 환영합니다', html: shell(inner) };
}

// ── Trial request (homepage lead → school inbox) — replaces template_ef71v5b ─
function trial({ from_name, phone, level, goals }) {
  const row = (k, v) => `<tr><td style="padding:7px 0;color:#7A6A57;font-size:13px;vertical-align:top;width:130px">${k}</td><td style="padding:7px 0;color:#2B2019;font-size:14px;font-weight:bold">${esc(v || '-')}</td></tr>`;
  const inner = `
<p style="font-size:16px;color:#2B2019;margin:0 0 4px">새 무료 체험 신청 <strong>New trial request</strong></p>
<p style="font-size:12.5px;color:#7A6A57;line-height:1.6;margin:0 0 18px">홈페이지에서 무료 체험 신청이 접수되었습니다.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF6EF;border:1px solid #E2D7C6;border-radius:12px"><tbody><tr><td style="padding:14px 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tbody>
${row('이름 · Name', from_name)}
${row('연락처 · Phone', phone)}
${row('레벨 · Level', level)}
${row('목표 · Goals', goals)}
</tbody></table></td></tr></tbody></table>`;
  return { subject: `[체험신청] ${esc(from_name)} · New trial request`, html: shell(inner) };
}

// ── Payment reminder — replaces template_ivz4g3u ────────────────────────────
function payment({ parent_name, amount, currency, fee_type, due_date }) {
  const amt = `${esc(currency || '')} ${esc(amount || '')}`.trim();
  const inner = `
<p style="font-size:16px;color:#2B2019;margin:0 0 6px">Hello <strong>${esc(parent_name)}</strong> 님, 안녕하세요!</p>
<p style="font-size:14px;color:#3c3c3c;line-height:1.7;margin:0 0 6px">This is a friendly reminder about an upcoming CREMONA Portal payment.</p>
<p style="font-size:13px;color:#7A6A57;line-height:1.7;margin:0 0 20px">CREMONA Portal 수업료 납부 안내드립니다.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF6EF;border:1px solid #E2D7C6;border-radius:12px"><tbody><tr><td style="padding:16px 20px">
<p style="font-size:12px;color:#7A6A57;margin:0 0 2px">Item · 항목</p>
<p style="font-size:15px;color:#2B2019;font-weight:bold;margin:0 0 12px">${esc(fee_type)}</p>
<p style="font-size:12px;color:#7A6A57;margin:0 0 2px">Amount · 금액</p>
<p style="font-size:22px;color:#3B2A1E;font-weight:bold;margin:0 0 12px">${amt}</p>
<p style="font-size:12px;color:#7A6A57;margin:0 0 2px">Due date · 납부 기한</p>
<p style="font-size:15px;color:#2B2019;font-weight:bold;margin:0">${esc(due_date)}</p>
</td></tr></tbody></table>
<p style="font-size:12.5px;color:#7A6A57;line-height:1.7;margin:20px 0 20px">이미 납부하셨다면 이 메일을 무시하셔도 됩니다. If you have already paid, please disregard this message.</p>
${button(PORTAL, 'View in portal · 포털에서 확인')}`;
  return { subject: 'CREMONA Portal 수업료 안내 · Payment reminder', html: shell(inner) };
}

// ── Comment ready (parent notice) — replaces template_p9kkfgv ─────────────────
function report({ student_name, date_range, class_time, books, categories, enhancement_areas, evaluation }) {
  const pre = (s) => `<div style="white-space:pre-line;font-size:13.5px;color:#2B2019;line-height:1.7;margin:0">${esc(s)}</div>`;
  const block = (label, bodyHtml) => `<p style="font-size:12px;color:#7A6A57;margin:16px 0 4px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px">${label}</p>${bodyHtml}`;
  const inner = `
<p style="font-size:16px;color:#2B2019;margin:0 0 6px">학습 리포트가 도착했습니다 <strong>New learning report</strong></p>
<p style="font-size:14px;color:#3c3c3c;line-height:1.7;margin:0 0 4px"><strong>${esc(student_name)}</strong> 학생의 리포트가 준비되었습니다.</p>
<p style="font-size:13px;color:#7A6A57;line-height:1.7;margin:0 0 8px">A new report for <strong>${esc(student_name)}</strong> is ready.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF6EF;border:1px solid #E2D7C6;border-radius:12px"><tbody><tr><td style="padding:14px 20px">
<p style="font-size:12px;color:#7A6A57;margin:0 0 2px">Period · 기간</p><p style="font-size:14px;color:#2B2019;font-weight:bold;margin:0 0 10px">${esc(date_range)}</p>
<p style="font-size:12px;color:#7A6A57;margin:0 0 2px">Class time · 수업 시간</p><p style="font-size:14px;color:#2B2019;font-weight:bold;margin:0 0 10px">${esc(class_time) || '-'}</p>
<p style="font-size:12px;color:#7A6A57;margin:0 0 2px">Books · 교재</p><p style="font-size:14px;color:#2B2019;font-weight:bold;margin:0">${esc(books)}</p>
</td></tr></tbody></table>
${categories ? block('Feedback · 평가', pre(categories)) : ''}
${enhancement_areas && enhancement_areas !== 'None' ? block('Areas to improve · 보완할 점', pre(enhancement_areas)) : ''}
${evaluation ? block('Overall · 종합 의견', pre(evaluation)) : ''}
<div style="margin-top:22px">${button(PORTAL, 'View full report · 전체 리포트 보기')}</div>`;
  return { subject: `${esc(student_name)} · CREMONA Portal 학습 리포트 · Comment ready`, html: shell(inner) };
}

// Registry — the sendMail function looks templates up by `type`.
const TEMPLATES = { otp, credentials, welcome, trial, payment, report };

function render(type, params) {
  const fn = TEMPLATES[type];
  if (!fn) throw new Error(`Unknown email type: ${type}`);
  return fn(params || {});
}

module.exports = { render, TEMPLATES };
