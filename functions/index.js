const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

// Gmail-based mailer (replaces EmailJS)
const { sendMail: gmailSend } = require('./mailer');
const { render: renderEmail } = require('./emailTemplates');

// App Review demo accounts: may browse everything but never run
// account-management or mass-notification actions.
const DEMO_UIDS = ['G5bddn72MeV7jlSiu07UoKy2DMy2', 'RHcukcB1E2ZMtHkIlIhiLoRd1ew2', '4grVtvd6qLZnec3dqRs5YhKz6l42'];

exports.deleteUser = functions.https.onRequest(async (req, res) => {
  try {
    const body = req.body || {};
    const { action, adminUid } = body;

    const callerDoc = await admin.firestore().collection('users').doc(adminUid).get();
    if (DEMO_UIDS.includes(String(body.adminUid || ''))) {
      return res.status(403).json({ error: 'Demo accounts cannot manage accounts.' });
    }
    if (!callerDoc.exists || callerDoc.data().role !== 'admin')
      return res.status(403).json({ error: 'Admins only' });

    if (action === 'createTeacher') {
      const { firstName, lastName, email } = body;
      if (!firstName || !lastName || !email)
        return res.status(400).json({ error: 'Missing fields' });
      const password = body.password || generateTempPassword();
      if (password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const userRecord = await admin.auth().createUser({
        email, password, displayName: `${firstName} ${lastName}`
      });
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        firstName, lastName,
        name:        `${firstName} ${lastName}`,
        email,
        phone:       String(body.phone || ''),
        role:        'teacher',
        status:      'active',
        ssoProvider: 'email',
        institution: '',
        mustChangePassword: true,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      });
      const emailSent = await sendCredentialsEmail({ email, name: `${firstName} ${lastName}`, role: 'teacher', password });
      return res.json({ success: true, uid: userRecord.uid, emailSent, tempPassword: password });
    }

    if (action === 'createAdmin') {
      // Only super admins (no adminPermissions array on their profile) may
      // create other admin accounts.
      if (Array.isArray(callerDoc.data().adminPermissions))
        return res.status(403).json({ error: 'Only super admins can create admin accounts.' });
      const { firstName, lastName, email } = body;
      if (!firstName || !lastName || !email)
        return res.status(400).json({ error: 'Missing fields' });
      if (!String(email).toLowerCase().endsWith('@cremonamusic.com'))
        return res.status(400).json({ error: 'Admin emails must be @cremonamusic.com addresses.' });
      const password = body.password || generateTempPassword();
      if (password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const userRecord = await admin.auth().createUser({
        email, password, displayName: `${firstName} ${lastName}`
      });
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        firstName, lastName,
        name:        `${firstName} ${lastName}`,
        email,
        role:        'admin',
        status:      'active',
        ssoProvider: 'email',
        adminPermissions: [], // no modules until a super admin grants them
        mustChangePassword: true,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      });
      const emailSent = await sendCredentialsEmail({ email, name: `${firstName} ${lastName}`, role: 'admin', password });
      return res.json({ success: true, uid: userRecord.uid, emailSent, tempPassword: password });
    }

    if (action === 'createParent') {
      const { firstName, lastName, email, phone, linkedStudentIds } = body;
      if (!firstName || !lastName || !email)
        return res.status(400).json({ error: 'Missing fields' });
      const password = body.password || generateTempPassword();
      if (password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const userRecord = await admin.auth().createUser({
        email, password, displayName: `${firstName} ${lastName}`
      });
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        firstName, lastName,
        name:            `${firstName} ${lastName}`,
        email,
        role:            'parent',
        status:          'active',
        ssoProvider:     'email',
        linkedStudentIds: Array.isArray(linkedStudentIds) ? linkedStudentIds : [],
        parentPhone:     phone || '',
        mustChangePassword: true,
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      });
      for (const sid of (linkedStudentIds || [])) {
        try {
          await admin.firestore().collection('students').doc(sid)
            .update({ parentEmails: admin.firestore.FieldValue.arrayUnion(email) });
        } catch (_) {}
      }
      const emailSent = await sendCredentialsEmail({ email, name: `${firstName} ${lastName}`, role: 'parent', password });
      return res.json({ success: true, uid: userRecord.uid, emailSent, tempPassword: password });
    }

    const { uid } = body;
    try { await admin.auth().deleteUser(uid); } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }
    await admin.firestore().collection('users').doc(uid).delete();
    return res.json({ success: true });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Password reset via emailed code ──────────────────────────────────────────
// Firebase's own reset emails were not being delivered, so the reset flow
// sends a 6-digit code through EmailJS (the same channel as the welcome
// email, which is known to deliver) and verifies it server-side.
const crypto = require('crypto');
// Emails newly created accounts their login ID + temporary password
// (EmailJS template made by the academy). A failed email never blocks the
// account creation itself.
async function sendCredentialsEmail({ email, name, role, password }) {
  try {
    const role_ko = role === 'teacher' ? '선생님' : role === 'admin' ? '관리자' : '학부모';
    const cred = renderEmail('credentials', { name, user_email: email, password, role_ko });
    await gmailSend({ to: email, subject: cred.subject, html: cred.html });
    // Also send a courtesy welcome email (best-effort — the credentials email
    // above is the critical one, so a welcome failure must not fail this).
    try {
      const wel = renderEmail('welcome', { name });
      await gmailSend({ to: email, subject: wel.subject, html: wel.html });
    } catch (welErr) {
      console.error('welcome email (after credentials) failed:', welErr);
    }
    return true;
  } catch (e) {
    console.error('credentials email failed:', e);
    return false;
  }
}

// ── reCAPTCHA server-side verification ──────────────────────────────────────
// Website requests carry a token from the "I'm not a robot" checkbox; the
// mobile app cannot show one, so app requests instead face a stricter
// per-email hourly cap (see requestPasswordReset).
const RECAPTCHA_SECRET = '6LfmqEwtAAAAAP5AqfOSCMAZWj1OlylIQqfXI78g';
async function verifyCaptcha(token) {
  if (!token) return false;
  try {
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET}&response=${encodeURIComponent(token)}`,
    });
    const d = await r.json();
    return d.success === true;
  } catch (e) {
    console.error('captcha verify failed:', e);
    return false;
  }
}

const hashResetCode = (uid, code) =>
  crypto.createHash('sha256').update(`${uid}:${code}`).digest('hex');

exports.requestPasswordReset = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Missing email' });

    const captchaOk = await verifyCaptcha((req.body || {}).captcha);

    let user;
    try { user = await admin.auth().getUserByEmail(email); }
    catch { return res.json({ success: true }); } // don't reveal whether an account exists

    const ref = admin.firestore().collection('passwordResets').doc(user.uid);
    const existing = await ref.get();
    const prev = existing.exists ? existing.data() : {};
    if (prev.lastSentAt && Date.now() - prev.lastSentAt.toMillis() < 60 * 1000) {
      return res.json({ success: true }); // at most one email per minute
    }
    // No captcha (mobile app): allow, but at most 3 emails per hour per account
    let hourCount = 0;
    if (!captchaOk) {
      const hourAgo = Date.now() - 60 * 60 * 1000;
      hourCount = (prev.hourStart && prev.hourStart.toMillis() > hourAgo) ? (prev.hourCount || 0) : 0;
      if (hourCount >= 3) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await ref.set({
      email,
      codeHash: hashResetCode(user.uid, code),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      attempts: 0,
      lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
      hourStart: (!captchaOk && hourCount > 0 && prev.hourStart) ? prev.hourStart : admin.firestore.Timestamp.now(),
      hourCount: captchaOk ? 0 : hourCount + 1,
    });

    try {
      const { subject, html } = renderEmail('otp', { passcode: code });
      await gmailSend({ to: email, subject, html });
    } catch (mailErr) {
      console.error('reset email send failed:', mailErr);
      return res.status(502).json({ error: 'Could not send the email. Please try again.' });
    }
    return res.json({ success: true });
  } catch (e) {
    console.error('requestPasswordReset:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

exports.resetPassword = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const newPassword = String(body.newPassword || '');
    if (!email || !code || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const invalid = () => res.status(400).json({ error: 'Invalid or expired code.' });

    let user;
    try { user = await admin.auth().getUserByEmail(email); } catch { return invalid(); }

    const ref = admin.firestore().collection('passwordResets').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) return invalid();
    const data = snap.data();
    if (data.expiresAt.toMillis() < Date.now() || (data.attempts || 0) >= 5) {
      await ref.delete();
      return invalid();
    }
    if (data.codeHash !== hashResetCode(user.uid, code)) {
      await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
      return invalid();
    }

    await admin.auth().updateUser(user.uid, { password: newPassword });
    await ref.delete();
    return res.json({ success: true });
  } catch (e) {
    console.error('resetPassword:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});


const { Expo } = require('expo-server-sdk');
const expo = new Expo();

const NOTIF_STRINGS = {
  en: {
    classSoonTitle: 'Class starting soon',
    classSoonBody: (name) => `${name}'s session starts in 30 minutes.`,
    dailyDigestTitle: "Today's classes",
    dailyDigestTeacherBody: (n) => `You have ${n} class${n > 1 ? 'es' : ''} today.`,
    dailyDigestParentBody: (name, n) => `${name} has ${n} class${n > 1 ? 'es' : ''} today.`,
    digestTitleTomorrow: "Tomorrow's classes",
    digestTeacherTomorrow: (n) => `You have ${n} class${n > 1 ? 'es' : ''} tomorrow.`,
    digestParentTomorrow: (name, n) => `${name} has ${n} class${n > 1 ? 'es' : ''} tomorrow.`,
    digestTitleDate: (d) => `Classes on ${d}`,
    digestTeacherDate: (n, d) => `You have ${n} class${n > 1 ? 'es' : ''} on ${d}.`,
    digestParentDate: (name, n, d) => `${name} has ${n} class${n > 1 ? 'es' : ''} on ${d}.`,
    newMessageFallback: 'New message',
    attachmentFallback: 'Sent an attachment',
    twoFactorTitle: 'Approve sign-in?',
    twoFactorBody: 'Someone is signing in to your Cremona Music account. Tap to approve or deny.',
    newReportTitle: 'New progress report',
    newReportBody: (name) => `A new report was added${name ? ` for ${name}` : ''}.`,
    levelTestTitle: 'Level test completed',
    levelTestBody: (name, level, total) => `${name} finished the level test: ${level} (${total}/25).`,
    replacementScheduledTitle: 'Replacement class scheduled',
    classScheduledTitle: 'New class scheduled',
    classScheduledBody: (name, when) => `${name}: ${when}`,
    classCancelledTitle: 'Class cancelled',
    classCancelledBody: (name, when) => `${name}'s class on ${when} was cancelled.`,
    reportSubmittedTitle: 'Comment awaiting approval',
    reportSubmittedBody: (t, st) => `${t} submitted a report for ${st}.`,
    reportApprovedTitle: 'Comment approved',
    reportApprovedBody: (st) => `Your report for ${st} was approved.`,
    reportDeclinedTitle: 'Comment declined',
    reportDeclinedBody: (st) => `Your report for ${st} was declined. Tap to edit and resubmit.`,
    paymentTitle: 'New payment record',
    paymentBody: (st) => `A payment record was added${st ? ` for ${st}` : ''}. Open Payments to view it.`,
    salaryTitle: 'Salary updated',
    salaryBody: () => 'A new salary record was added. Open My Salary to view it.',
    birthdayTitle: '🎂 Happy Birthday!',
    birthdayBody: (name) => `Happy birthday, ${name}! Everyone at Cremona Music wishes you a wonderful day. 🎉`,
    reportRequestTitle: '📝 Monthly reports to write',
    reportRequestBody: (n, names) => `Please write this month's report for ${n} student${n > 1 ? 's' : ''}: ${names}`,
    homeworkNewTitle: '📚 New homework',
    homeworkNewBody: (student, teacher) => `${teacher} assigned homework to ${student}. Open the app to see it.`,
    homeworkSubmittedTitle: '📸 Homework submitted',
    homeworkSubmittedBody: (student) => `${student} submitted their homework — take a look and leave feedback.`,
    homeworkReviewedTitle: '✅ Homework checked',
    homeworkReviewedBody: (student) => `The teacher checked ${student}'s homework and left feedback.`,
    classRescheduledTitle: 'Class rescheduled',
    classRescheduledBody: (name, when) => `${name}'s class was moved to ${when}.`,
  },
  ko: {
    classSoonTitle: '수업 시작 임박',
    classSoonBody: (name) => `${name} 학생의 수업이 30분 후에 시작합니다.`,
    digestTitleTomorrow: '내일의 수업',
    digestTeacherTomorrow: (n) => `내일 ${n}개의 수업이 있습니다.`,
    digestParentTomorrow: (name, n) => `${name} 학생은 내일 ${n}개의 수업이 있습니다.`,
    digestTitleDate: (d) => `${d} 수업`,
    digestTeacherDate: (n, d) => `${d}에 ${n}개의 수업이 있습니다.`,
    digestParentDate: (name, n, d) => `${name} 학생은 ${d}에 ${n}개의 수업이 있습니다.`,
    dailyDigestTitle: '오늘의 수업',
    dailyDigestTeacherBody: (n) => `오늘 ${n}개의 수업이 있습니다.`,
    dailyDigestParentBody: (name, n) => `${name} 학생은 오늘 ${n}개의 수업이 있습니다.`,
    newMessageFallback: '새 메시지',
    attachmentFallback: '파일을 보냈습니다',
    twoFactorTitle: '로그인을 승인하시겠어요?',
    twoFactorBody: '회원님의 Cremona Music 계정에 로그인 시도가 있습니다. 탭하여 승인 또는 거부하세요.',
    newReportTitle: '새 진도 리포트',
    newReportBody: (name) => `새로운 리포트가 등록되었습니다${name ? ` (${name})` : ''}.`,
    levelTestTitle: '레벨 테스트 완료',
    levelTestBody: (name, level, total) => `${name} 학생이 레벨 테스트를 완료했습니다: ${level} (${total}/25점)`,
    replacementScheduledTitle: '보강 수업이 등록되었습니다',
    classScheduledTitle: '새 수업이 등록되었습니다',
    classScheduledBody: (name, when) => `${name}: ${when}`,
    classCancelledTitle: '수업 취소',
    classCancelledBody: (name, when) => `${name} 학생의 ${when} 수업이 취소되었습니다.`,
    reportSubmittedTitle: '리포트 승인 요청',
    reportSubmittedBody: (t, st) => `${t} 선생님이 ${st} 학생의 리포트를 제출했습니다.`,
    reportApprovedTitle: '리포트 승인됨',
    reportApprovedBody: (st) => `${st} 학생 리포트가 승인되었습니다.`,
    reportDeclinedTitle: '리포트 반려됨',
    reportDeclinedBody: (st) => `${st} 학생 리포트가 반려되었습니다. 수정 후 다시 제출해 주세요.`,
    paymentTitle: '새 결제 내역',
    paymentBody: (st) => `${st ? st + ' 학생의 ' : ''}결제 내역이 등록되었습니다. 결제 메뉴에서 확인하세요.`,
    reportRequestTitle: '📝 이번 달 리포트 작성 요청',
    reportRequestBody: (n, names) => `${n}명의 학생 리포트를 작성해 주세요: ${names}`,
    homeworkNewTitle: '📚 새 숙제가 있어요',
    homeworkNewBody: (student, teacher) => `${teacher} 선생님이 ${student} 학생에게 숙제를 내주셨어요.`,
    homeworkSubmittedTitle: '📸 숙제 제출 완료',
    homeworkSubmittedBody: (student) => `${student} 학생이 숙제를 제출했어요 — 확인하고 피드백을 남겨주세요.`,
    homeworkReviewedTitle: '✅ 숙제 확인 완료',
    homeworkReviewedBody: (student) => `선생님이 ${student} 학생의 숙제를 확인하고 피드백을 남겼어요.`,
    birthdayTitle: '🎂 생일 축하합니다!',
    birthdayBody: (name) => `${name}님, 생일을 진심으로 축하드립니다! Cremona Music 가족 모두가 행복한 하루를 기원합니다. 🎉`,
    salaryTitle: '급여 업데이트',
    salaryBody: () => '새 급여 내역이 등록되었습니다. 급여 메뉴에서 확인하세요.',
    classRescheduledTitle: '수업 일정 변경',
    classRescheduledBody: (name, when) => `${name} 학생의 수업이 ${when}(으)로 변경되었습니다.`,
  },
};

function stringsFor(lang) {
  return NOTIF_STRINGS[lang === 'ko' ? 'ko' : 'en'];
}

// Sends a batch of already-composed { to, title, body, data } messages.
async function sendExpoMessages(messages) {
  if (!messages.length) return;
  // Safety net against double-notifications: never send the identical message
  // (same token + title + body) to the same device twice in one send. Guards
  // against a token that ended up on more than one recipient (e.g. the same
  // phone linked to two parent accounts for one student).
  const seen = new Set();
  messages = messages.filter((m) => {
    const key = `${m.to} ${m.title || ''} ${m.body || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!messages.length) return;
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      // Log per-message errors so silent delivery failures are diagnosable in
      // the Cloud Functions logs (e.g. DeviceNotRegistered = stale token,
      // or an FCM/APNs credential error = push service not configured).
      tickets.forEach((tk, i) => {
        if (tk.status === 'error') {
          console.error('Expo push ticket error:', tk.message,
            tk.details ? JSON.stringify(tk.details) : '', '→ token', chunk[i] && chunk[i].to);
        }
      });
    } catch (e) {
      console.error('sendExpoMessages chunk failed:', e);
    }
  }
}

// { token, lang } for a single user, or null if they have no push token.
async function getUserPushInfo(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (d.status === 'deleted') return null;
  const token = d.expoPushToken && Expo.isExpoPushToken(d.expoPushToken) ? d.expoPushToken : null;
  // token may be null: the person still gets the in-portal notification bell
  return { uid, token, lang: d.preferredLanguage === 'ko' ? 'ko' : 'en' };
}

// [{ token, lang }, ...] for every parent linked to a student.
async function getParentPushInfoForStudent(studentId) {
  const snap = await admin
    .firestore()
    .collection('users')
    .where('role', '==', 'parent')
    .where('linkedStudentIds', 'array-contains', studentId)
    .get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      if (data.status === 'deleted') return null;
      const token = data.expoPushToken && Expo.isExpoPushToken(data.expoPushToken) ? data.expoPushToken : null;
      return { uid: d.id, token, lang: data.preferredLanguage === 'ko' ? 'ko' : 'en' };
    })
    .filter(Boolean);
}

// ── One push token belongs to exactly one account ───────────────────────────
// A phone produces a single Expo push token. If the same phone signs into more
// than one account (e.g. testing parent + teacher + admin on one device), the
// app writes that token onto each account's user doc — so a notification that
// reaches two of those roles hits the phone twice. Whenever a token lands on a
// user doc, strip it from every OTHER doc that still carries it. Net effect:
// the most recent login "owns" the device, and each phone gets one push.
exports.claimPushToken = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;
    const token = change.after.data().expoPushToken;
    if (!token || !Expo.isExpoPushToken(token)) return null;
    // Only act when the token is newly set/changed on this doc (avoids reacting
    // to unrelated profile edits, and prevents loops with the clears below).
    const before = change.before.exists ? change.before.data().expoPushToken : null;
    if (before === token) return null;

    const dupes = await admin.firestore()
      .collection('users')
      .where('expoPushToken', '==', token)
      .get();
    const batch = admin.firestore().batch();
    let any = false;
    dupes.forEach((d) => {
      if (d.id === context.params.uid) return; // keep the doc that just claimed it
      batch.update(d.ref, { expoPushToken: admin.firestore.FieldValue.delete() });
      any = true;
    });
    if (any) await batch.commit();
    return null;
  });

// Sends the same notification "shape" to a list of { token, lang } people,
// composing each one's title/body in their own language via a callback.
// composeFn: (strings) => ({ title, body, data })
//
// urgent=true (the default) sends as a high-priority, time-sensitive alert —
// policy: every notification EXCEPT chat messages breaks through (class
// reminders, schedule changes, reports); chats stay normal priority.
async function sendLocalized(pushInfos, composeFn, urgent = true) {
  const infos = pushInfos.filter(Boolean);

  // Phone pushes (people with the app installed)
  const messages = infos
    .filter(({ token }) => !!token)
    .map(({ token, lang }) => {
      const { title, body, data } = composeFn(stringsFor(lang));
      const msg = { to: token, sound: 'default', title, body, data };
      if (urgent) {
        msg.priority = 'high';                    // Android: heads-up delivery
        msg.channelId = 'urgent';                 // Android: max-importance channel (created by the app)
        msg.interruptionLevel = 'time-sensitive';  // iOS: breaks through Focus modes (Expo requires the hyphenated value)
      }
      return msg;
    });

  // Website bell: persist a copy for everyone (in their own language)
  try {
    const batch = admin.firestore().batch();
    let wrote = false;
    for (const { uid, lang } of infos) {
      if (!uid) continue;
      const { title, body, data } = composeFn(stringsFor(lang));
      // chat messages are noisy — the bell keeps everything else
      if (data && data.type === 'message') continue;
      batch.set(admin.firestore().collection('notifications').doc(), {
        uid, title, body,
        type: (data && data.type) || '',
        data: data || {},
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      wrote = true;
    }
    if (wrote) await batch.commit();
  } catch (e) {
    console.error('bell notification write failed:', e);
  }

  await sendExpoMessages(messages);
}

// ── 1. Daily 11am digest: "you have N classes today" ───────────────────────
// Runs once a day. Groups today's sessions by teacher and by student, and
// notifies the teacher + each student's parent(s) in their own language.
// Sends the "today's classes" digest to every teacher and parent involved.
// Used by the 11:00 KST cron below AND the admins' manual "Send Schedule"
// button (sendScheduleNow). Always covers only the current day in Seoul.
async function runDailyDigest(filter, opts = {}) {
    // filter: null/undefined = everyone; otherwise
    // { teacherUids: [..], studentIds: [..] } limits who gets notified.
    // opts.dayOffset: 0 = today (default), 1 = tomorrow. opts.dateStr:
    // 'YYYY-MM-DD' targets a specific day (on-demand pick-a-day). All in Korea time.
    const dayOffset = Number.isInteger(opts.dayOffset) ? opts.dayOffset : 0;
    const dateStr = typeof opts.dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateStr) ? opts.dateStr : null;
    const seoulNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const offsetMs = Date.now() - seoulNow.getTime();
    let y = seoulNow.getFullYear(), mo = seoulNow.getMonth(), da = seoulNow.getDate();
    if (dateStr) { const p = dateStr.split('-').map(Number); y = p[0]; mo = p[1] - 1; da = p[2]; }
    const startOfDay = new Date(new Date(y, mo, da + dayOffset).getTime() + offsetMs);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const mode = dateStr ? 'date' : (dayOffset === 1 ? 'tomorrow' : 'today');
    const dateLabel = new Date(y, mo, da + dayOffset).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const snap = await admin
      .firestore()
      .collection('sessions')
      .where('dateTime', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
      .where('dateTime', '<', admin.firestore.Timestamp.fromDate(endOfDay))
      .get();

    const sessions = snap.docs.map((d) => d.data()).filter((s) => s.status !== 'cancelled');
    if (!sessions.length) return null;

    const teacherAllowed = filter && Array.isArray(filter.teacherUids) ? new Set(filter.teacherUids) : null;
    const studentAllowed = filter && Array.isArray(filter.studentIds) ? new Set(filter.studentIds) : null;

    const byTeacher = {};
    const byStudent = {};
    sessions.forEach((s) => {
      if (s.teacherUid && (!teacherAllowed || teacherAllowed.has(s.teacherUid))) (byTeacher[s.teacherUid] ??= []).push(s);
      if (s.studentId && (!studentAllowed || studentAllowed.has(s.studentId))) (byStudent[s.studentId] ??= []).push(s);
    });

    await Promise.all([
      ...Object.entries(byTeacher).map(async ([teacherUid, list]) => {
        const info = await getUserPushInfo(teacherUid);
        if (!info) return;
        await sendLocalized([info], (S) => ({
          title: mode === 'tomorrow' ? S.digestTitleTomorrow : mode === 'date' ? S.digestTitleDate(dateLabel) : S.dailyDigestTitle,
          body: mode === 'tomorrow' ? S.digestTeacherTomorrow(list.length)
            : mode === 'date' ? S.digestTeacherDate(list.length, dateLabel)
            : S.dailyDigestTeacherBody(list.length),
          data: { type: 'daily-digest' },
        }));
      }),
      ...Object.entries(byStudent).map(async ([studentId, list]) => {
        const infos = await getParentPushInfoForStudent(studentId);
        if (!infos.length) return;
        const name = list[0].studentName || 'Your child';
        await sendLocalized(infos, (S) => ({
          title: mode === 'tomorrow' ? S.digestTitleTomorrow : mode === 'date' ? S.digestTitleDate(dateLabel) : S.dailyDigestTitle,
          body: mode === 'tomorrow' ? S.digestParentTomorrow(name, list.length)
            : mode === 'date' ? S.digestParentDate(name, list.length, dateLabel)
            : S.dailyDigestParentBody(name, list.length),
          data: { type: 'daily-digest' },
        }));
      }),
    ]);
    return null;
}

// The digest time and audience are admin-configurable (settings/scheduleDigest:
// { enabled, hour (0-23 KST), recipients: 'all' | { teacherUids, studentIds } }).
// This runs every 30 minutes and fires once per day when Seoul time enters the
// configured hour. Defaults to the original behavior: 11:00, everyone, on.
exports.dailyClassDigest = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const ref = admin.firestore().doc('settings/scheduleDigest');
    const snap = await ref.get();
    const cfg = snap.exists ? snap.data() : {};
    const filter = cfg.recipients && cfg.recipients !== 'all' ? cfg.recipients : null;
    const seoul = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const todayKey = `${seoul.getFullYear()}-${seoul.getMonth() + 1}-${seoul.getDate()}`;

    // One-off timed send (the admin's "send at HH:MM" timer)
    const oneRef = admin.firestore().doc('settings/scheduleOneShot');
    const oneSnap = await oneRef.get();
    if (oneSnap.exists) {
      const one = oneSnap.data();
      if (!one.done && one.sendAt && one.sendAt.toMillis() <= Date.now()) {
        await runDailyDigest(filter);
        await oneRef.set({ ...one, done: true, sentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }

    // Recurring "today" digest at the configured morning hour
    if (cfg.enabled !== false) {
      const hour = Number.isInteger(cfg.hour) ? cfg.hour : 11;
      if (seoul.getHours() === hour && cfg.lastSentDate !== todayKey) {
        await runDailyDigest(filter);
        await ref.set({ lastSentDate: todayKey }, { merge: true });
      }
    }

    // Evening "tomorrow's classes" digest at the configured evening hour (opt-in).
    if (cfg.eveningEnabled === true) {
      const eHour = Number.isInteger(cfg.eveningHour) ? cfg.eveningHour : 20;
      if (seoul.getHours() === eHour && cfg.eveningLastSentDate !== todayKey) {
        await runDailyDigest(filter, { dayOffset: 1 });
        await ref.set({ eveningLastSentDate: todayKey }, { merge: true });
      }
    }
    return null;
  });

// Manual trigger for admins — same digest, on demand, today only.
exports.sendScheduleNow = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const { adminUid } = req.body || {};
    if (DEMO_UIDS.includes(String(adminUid || '')))
      return res.status(403).json({ error: 'Demo accounts cannot send schedule notifications.' });
    const callerDoc = await admin.firestore().collection('users').doc(String(adminUid || '')).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin')
      return res.status(403).json({ error: 'Admins only' });
    const cfgSnap = await admin.firestore().doc('settings/scheduleDigest').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    const filter = cfg.recipients && cfg.recipients !== 'all' ? cfg.recipients : null;

    // On-demand pick-a-day: send a specific day's schedule now.
    const dateStr = String((req.body || {}).date || '').trim();
    if (dateStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      await runDailyDigest(filter, { dateStr });
      return res.json({ success: true, sentFor: dateStr });
    }

    const at = String((req.body || {}).at || '').trim(); // 'HH:MM' Seoul time, today
    if (at) {
      const m = at.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
      if (!m) return res.status(400).json({ error: 'Time must be HH:MM.' });
      const seoulNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const offsetMs = Date.now() - seoulNow.getTime();
      const target = new Date(new Date(seoulNow.getFullYear(), seoulNow.getMonth(), seoulNow.getDate(),
        parseInt(m[1]), parseInt(m[2])).getTime() + offsetMs);
      if (target.getTime() <= Date.now()) return res.status(400).json({ error: 'That time has already passed today.' });
      await admin.firestore().doc('settings/scheduleOneShot').set({
        sendAt: admin.firestore.Timestamp.fromDate(target),
        done: false,
        setBy: adminUid,
      });
      return res.json({ success: true, scheduledFor: at });
    }

    await runDailyDigest(filter);
    return res.json({ success: true });
  } catch (e) {
    console.error('sendScheduleNow:', e);
    return res.status(500).json({ error: 'Failed to send. Please try again.' });
  }
});

// ── 2. "Class starting in 30 minutes" reminder ──────────────────────────────
// Runs every 5 minutes, catches sessions starting 25–35 min from now that
// haven't been reminded yet (flags reminder30Sent to avoid duplicates).
exports.classStartingReminder = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 25 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 35 * 60 * 1000);

    const snap = await admin
      .firestore()
      .collection('sessions')
      .where('dateTime', '>=', admin.firestore.Timestamp.fromDate(windowStart))
      .where('dateTime', '<', admin.firestore.Timestamp.fromDate(windowEnd))
      .get();

    const batch = admin.firestore().batch();
    let any = false;

    await Promise.all(
      snap.docs.map(async (docSnap) => {
        const s = docSnap.data();
        if (s.status === 'cancelled' || s.reminder30Sent) return;

        const infos = [];
        if (s.teacherUid) {
          const info = await getUserPushInfo(s.teacherUid);
          if (info) infos.push(info);
        }
        if (s.studentId) {
          infos.push(...(await getParentPushInfoForStudent(s.studentId)));
        }
        if (infos.length) {
          await sendLocalized(infos, (S) => ({
            title: S.classSoonTitle,
            body: S.classSoonBody(s.studentName || 'Class'),
            data: { type: 'class-reminder', sessionId: docSnap.id },
          }));
        }
        batch.update(docSnap.ref, { reminder30Sent: true });
        any = true;
      })
    );

    if (any) await batch.commit();
    return null;
  });

// ── 3. New message push ─────────────────────────────────────────────────────
exports.onNewMessageCreated = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snap) => {
    const msg = snap.data();
    if (!msg.conversationId) return null;

    const convSnap = await admin.firestore().collection('conversations').doc(msg.conversationId).get();
    if (!convSnap.exists) return null;

    const conv = convSnap.data();
    const members = conv.members || [];
    const recipients = members.filter((uid) => uid !== msg.senderUid);

    // Support threads: only the requester is a member — also notify every admin
    if (conv.type === 'support') {
      const adminsSnap = await admin.firestore().collection('users').where('role', '==', 'admin').get();
      adminsSnap.forEach((d) => {
        if (d.id !== msg.senderUid && !recipients.includes(d.id) && d.data().status !== 'deleted') {
          recipients.push(d.id);
        }
      });
    }

    const infos = (await Promise.all(recipients.map(getUserPushInfo))).filter(Boolean);
    if (!infos.length) return null;

    // Chat messages are the one notification type that is NOT urgent
    await sendLocalized(infos, (S) => ({
      title: msg.senderName || S.newMessageFallback,
      body: msg.text || S.attachmentFallback,
      data: { type: 'message', conversationId: msg.conversationId },
    }), false);
    return null;
  });

// ── 4. Progress report push — fires when the admin SENDS it to parents ──────
// Approval alone no longer notifies parents. Sending is an explicit, separate
// step ("Send to parents" / "Send all not-emailed" in comments-admin.html),
// which stamps `parentEmailedAt` once at least one email goes out. The parent
// push now rides on that same event, so it stays in lockstep with the email
// and never fires early on approval. Only the FIRST send notifies (a later
// Resend re-stamps parentEmailedAt but doesn't re-push).
exports.onReportEmailed = functions.firestore
  .document('reports/{reportId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.parentEmailedAt) return null;  // already sent before — don't re-notify on resend
    if (!after.parentEmailedAt) return null;   // parentEmailedAt not newly set — nothing to do
    if (!after.studentId) return null;

    const infos = await getParentPushInfoForStudent(after.studentId);
    if (!infos.length) return null;

    await sendLocalized(infos, (S) => ({
      title: S.newReportTitle,
      body: S.newReportBody(after.studentName),
      data: { type: 'report', reportId: context.params.reportId },
    }));
    return null;
  });

// ── 5. Class scheduled / rescheduled / cancelled push ────────────────────────
// Fires whenever an admin creates or edits a session (website schedule-admin
// or the mobile app). Notifies the teacher and the student's parent(s), each
// in their own language, as an urgent (time-sensitive) alert.
function fmtSessionTime(ts, lang) {
  const d = ts && ts.toDate ? ts.toDate() : new Date(ts);
  // Sessions are entered in Korea time — render in Asia/Seoul for everyone.
  return d.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'Asia/Seoul',
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function notifySessionChange(s, sessionId, kind) {
  const infos = [];
  if (s.teacherUid) {
    const info = await getUserPushInfo(s.teacherUid);
    if (info) infos.push(info);
  }
  if (s.studentId) {
    infos.push(...(await getParentPushInfoForStudent(s.studentId)));
  }
  if (!infos.length) return;

  const name = s.studentName || 'Class';
  await sendLocalized(infos, (S) => {
    const when = fmtSessionTime(s.dateTime, S === NOTIF_STRINGS.ko ? 'ko' : 'en');
    if (kind === 'cancelled') {
      return { title: S.classCancelledTitle, body: S.classCancelledBody(name, when), data: { type: 'class-cancelled', sessionId } };
    }
    if (kind === 'rescheduled') {
      return { title: S.classRescheduledTitle, body: S.classRescheduledBody(name, when), data: { type: 'class-rescheduled', sessionId } };
    }
    const title = s.isReplacement ? S.replacementScheduledTitle : S.classScheduledTitle;
    return { title, body: S.classScheduledBody(name, when), data: { type: 'class-scheduled', sessionId } };
  });
}

// Intentionally NO push when a class is scheduled (parents + teachers found the
// immediate ping noisy). New classes are visible in the app and covered by the
// daily/tomorrow digest. Cancellations and reschedules still notify, via
// onSessionUpdated below.
exports.onSessionCreated = functions.firestore
  .document('sessions/{sessionId}')
  .onCreate(async () => null);

exports.onSessionUpdated = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    const wasCancelled = before.status === 'cancelled';
    const isCancelled = after.status === 'cancelled';
    const beforeMs = before.dateTime && before.dateTime.toMillis ? before.dateTime.toMillis() : 0;
    const afterMs = after.dateTime && after.dateTime.toMillis ? after.dateTime.toMillis() : 0;

    if (!wasCancelled && isCancelled) {
      await notifySessionChange(after, context.params.sessionId, 'cancelled');
      return null;
    }
    // Only announce time changes for future, non-cancelled sessions
    if (!isCancelled && beforeMs !== afterMs && afterMs > Date.now()) {
      await notifySessionChange(after, context.params.sessionId, 'rescheduled');
    }
    return null;
  });

// ── 6. Auto-translate chat messages (Korean ↔ English) ──────────────────────
// On every new message with text, stores { origLang, textEn, textKo } on the
// message doc. Both the website and the mobile app show a "Translate" toggle
// that reads these fields, so parents and teachers can each read chats in
// their own language.
function detectLangSimple(text) {
  return /[가-힯ᄀ-ᇿ]/.test(text || '') ? 'ko' : 'en';
}

async function gtxTranslate(text, target) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='
    + encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(text);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`translate HTTP ${res.status}`);
  const data = await res.json();
  const out = (data && data[0] ? data[0] : []).map((seg) => (seg && seg[0] ? seg[0] : '')).join('');
  if (!out) throw new Error('empty translation');
  return out;
}

exports.onMessageTranslate = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snap) => {
    const msg = snap.data();
    const text = (msg.text || '').trim();
    if (!text) return null;
    if (msg.origLang) return null; // already translated (safety against loops)

    const origLang = detectLangSimple(text);
    const target = origLang === 'ko' ? 'en' : 'ko';
    try {
      const translated = await gtxTranslate(text, target);
      await snap.ref.update({
        origLang,
        textEn: origLang === 'en' ? text : translated,
        textKo: origLang === 'ko' ? text : translated,
      });
    } catch (e) {
      // Translation is best-effort — never block message delivery over it
      console.warn('onMessageTranslate failed:', e.message);
    }
    return null;
  });

// ── 7. Auto-translate progress reports (Korean ↔ English) ───────────────────
// Fires when a report is approved. Stores evaluationEn/Ko + per-category
// feedbackEn/Ko + evalOrigLang so the mobile app's report translate toggle
// (ReportsScreen.js) works instantly; the website uses these too when present.
exports.onReportTranslate = functions.firestore
  .document('reports/{reportId}')
  .onWrite(async (change) => {
    if (!change.after.exists) return null;
    const after = change.after.data();
    if (after.evalOrigLang) return null;          // already translated (loop guard)
    if (after.status !== 'approved') return null; // parents only see approved reports

    const evalText = (after.evaluation || '').trim();
    const categories = Array.isArray(after.categories) ? after.categories : [];
    const sample = evalText || (categories.find((c) => (c.feedback || '').trim()) || {}).feedback || '';
    if (!sample.trim()) return null;

    try {
      const updates = { evalOrigLang: detectLangSimple(sample) };

      if (evalText) {
        const origLang = detectLangSimple(evalText);
        const tr = await gtxTranslate(evalText, origLang === 'ko' ? 'en' : 'ko');
        updates.evalOrigLang = origLang;
        updates.evaluationEn = origLang === 'en' ? evalText : tr;
        updates.evaluationKo = origLang === 'ko' ? evalText : tr;
      }

      if (categories.length) {
        const cats = [];
        for (const c of categories) {
          const fb = (c.feedback || '').trim();
          if (!fb) { cats.push(c); continue; }
          const ol = detectLangSimple(fb);
          const tr = await gtxTranslate(fb, ol === 'ko' ? 'en' : 'ko');
          cats.push({ ...c, feedbackEn: ol === 'en' ? fb : tr, feedbackKo: ol === 'ko' ? fb : tr });
        }
        updates.categories = cats;
      }

      await change.after.ref.update(updates);
    } catch (e) {
      console.warn('onReportTranslate failed:', e.message);
    }
    return null;
  });


// ── Comment lifecycle notifications for staff ────────────────────────────────
// Admins are told when a teacher submits a report (so they can approve or
// decline it); the teacher is told the outcome either way. Parents are only
// notified when the report is sent to them (onReportEmailed above).
async function getAdminPushInfos() {
  const snap = await admin.firestore().collection('users').where('role', '==', 'admin').get();
  const infos = await Promise.all(
    snap.docs.filter((d) => d.data().status !== 'deleted').map((d) => getUserPushInfo(d.id))
  );
  return infos.filter(Boolean);
}

exports.onReportSubmitted = functions.firestore
  .document('reports/{reportId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;

    // A newly written report fulfils any pending report request for that
    // teacher+student pair (admin's monthly report tracking).
    if (!before && after.teacherUid && after.studentId) {
      try {
        const reqs = await admin.firestore().collection('reportRequests')
          .where('teacherUid', '==', after.teacherUid)
          .where('studentId', '==', after.studentId)
          .where('status', '==', 'pending')
          .get();
        for (const r of reqs.docs) {
          await r.ref.update({
            status: 'done',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            reportId: context.params.reportId,
          });
        }
      } catch (e) { console.error('[reportRequests complete]', e); }
    }
    const became = (st) => after.status === st && (!before || before.status !== st);

    if (became('pending')) {
      const infos = await getAdminPushInfos();
      if (infos.length) {
        await sendLocalized(infos, (S) => ({
          title: S.reportSubmittedTitle,
          body: S.reportSubmittedBody(after.teacherName || 'A teacher', after.studentName || 'a student'),
          data: { type: 'report-pending', reportId: context.params.reportId },
        }));
      }
    }

    if ((became('approved') || became('declined')) && after.teacherUid) {
      const info = await getUserPushInfo(after.teacherUid);
      if (info) {
        await sendLocalized([info], (S) => ({
          title: after.status === 'approved' ? S.reportApprovedTitle : S.reportDeclinedTitle,
          body: (after.status === 'approved' ? S.reportApprovedBody : S.reportDeclinedBody)(after.studentName || ''),
          data: { type: 'report-result', reportId: context.params.reportId },
        }));
      }
    }
    return null;
  });

// ── Payment record → parent push ────────────────────────────────────────────
exports.onPaymentCreated = functions.firestore
  .document('payments/{paymentId}')
  .onCreate(async (snap, context) => {
    const p = snap.data();
    if (!p.parentUid) return null;
    const info = await getUserPushInfo(p.parentUid);
    if (!info) return null;
    await sendLocalized([info], (S) => ({
      title: S.paymentTitle,
      body: S.paymentBody(p.studentName || ''),
      data: { type: 'payment', paymentId: context.params.paymentId },
    }));
    return null;
  });

// ── Salary record → teacher push ────────────────────────────────────────────
exports.onSalaryCreated = functions.firestore
  .document('salaries/{salaryId}')
  .onCreate(async (snap, context) => {
    const sal = snap.data();
    if (!sal.teacherUid) return null;
    const info = await getUserPushInfo(sal.teacherUid);
    if (!info) return null;
    await sendLocalized([info], (S) => ({
      title: S.salaryTitle,
      body: S.salaryBody(),
      data: { type: 'salary', salaryId: context.params.salaryId },
    }));
    return null;
  });


// ── Auto-create parent accounts from student records ─────────────────────────
// When a student is saved with a parentEmail (admin UI or Excel import), the
// matching parent account is created automatically: random password, users
// doc with the student linked, credentials emailed (template_j5czxh7). If a
// parent with that email already exists, the student is simply linked to
// them. Admins can still create parents manually in Accounts.
function generateTempPassword() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  let out = '';
  for (let i = 0; i < 7; i++) out += letters[crypto.randomInt(letters.length)];
  for (let i = 0; i < 3; i++) out += digits[crypto.randomInt(digits.length)];
  return out;
}

exports.onStudentWritten = functions.firestore
  .document('students/{studentId}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;
    const email = String(after.parentEmail || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return null;

    // Only act when the parent email is new or changed — the linking update
    // below re-triggers this function, and this guard makes that a no-op.
    const before = change.before.exists ? change.before.data() : null;
    if (before && String(before.parentEmail || '').trim().toLowerCase() === email) return null;

    const studentId = context.params.studentId;
    const phone = String(after.parentPhone || '').trim();

    let userRecord = null;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch {
      // No account yet — create one and email the credentials
      const password = generateTempPassword();
      const name = String(after.parentName || '').trim() || `${after.fullName || 'Student'} Parent`;
      userRecord = await admin.auth().createUser({ email, password, displayName: name });
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        firstName: name,
        lastName: '',
        name,
        email,
        role: 'parent',
        status: 'active',
        ssoProvider: 'email',
        linkedStudentIds: [studentId],
        parentPhone: phone,
        autoCreated: true,
        mustChangePassword: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await sendCredentialsEmail({ email, name, role: 'parent', password });
      await change.after.ref.update({ parentEmails: admin.firestore.FieldValue.arrayUnion(email) });
      return null;
    }

    // Account exists — link this student to it (parents only)
    const uref = admin.firestore().collection('users').doc(userRecord.uid);
    const usnap = await uref.get();
    if (usnap.exists && usnap.data().role === 'parent') {
      const updates = { linkedStudentIds: admin.firestore.FieldValue.arrayUnion(studentId) };
      if (phone && !usnap.data().parentPhone) updates.parentPhone = phone;
      await uref.update(updates);
    }
    await change.after.ref.update({ parentEmails: admin.firestore.FieldValue.arrayUnion(email) });
    return null;
  });


// ── Level test finished → notify the teacher whose code was used ────────────
exports.onLevelTestCreated = functions.firestore
  .document('levelTests/{testId}')
  .onCreate(async (snap, context) => {
    const t = snap.data();
    if (!t.teacherUid) return null;
    const info = await getUserPushInfo(t.teacherUid);
    if (!info) return null;
    await sendLocalized([info], (S) => ({
      title: S.levelTestTitle,
      body: S.levelTestBody(t.name || 'A student', t.levelLabel || t.level || '', t.total ?? '?'),
      data: { type: 'level-test', testId: context.params.testId },
    }));
    return null;
  });


// ── Login log: record each sign-in with IP + location ───────────────────────
// Called by the website/app right after auth. Geo comes from Google's edge
// headers (x-appengine-*) available to 1st-gen functions.
exports.logLogin = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const idToken = String((req.body || {}).idToken || '');
    if (!idToken) return res.status(400).json({ error: 'Missing idToken' });
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(idToken); }
    catch { return res.status(401).json({ error: 'Invalid token' }); }

    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const country = String(req.headers['x-appengine-country'] || '').toUpperCase();
    const region = String(req.headers['x-appengine-region'] || '').toUpperCase();
    const rawCity = String(req.headers['x-appengine-city'] || '');
    const city = rawCity ? rawCity[0].toUpperCase() + rawCity.slice(1) : '';
    const location = [city, region, country && country !== 'ZZ' ? country : '']
      .filter(Boolean).join(', ');
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);

    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const u = userSnap.exists ? userSnap.data() : {};
    await db.collection('loginLogs').add({
      uid: decoded.uid,
      email: decoded.email || u.email || '',
      name: u.name || '',
      role: u.role || '',
      ip, location, ua,
      platform: String((req.body || {}).platform || 'web'),
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(decoded.uid).set({
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginIp: ip,
      lastLoginLocation: location,
    }, { merge: true });
    return res.json({ success: true });
  } catch (e) {
    console.error('[logLogin]', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});


// ── Upload proxy: browser → function → R2 worker ────────────────────────────
// The R2 worker's CORS only allows the old .web.app origin, so the portal
// uploads via this same-origin endpoint instead. Requires a signed-in user.
exports.uploadFile = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const { idToken, key, contentType, dataBase64 } = req.body || {};
    if (!idToken || !key || !dataBase64) return res.status(400).json({ error: 'Missing fields' });
    try { await admin.auth().verifyIdToken(idToken); }
    catch { return res.status(401).json({ error: 'Invalid token' }); }
    const allowed = ['idphotos/', 'signatures/', 'contracts/', 'avatars/', 'homework/'];
    if (!allowed.some((p) => key.startsWith(p)) || key.includes('..'))
      return res.status(400).json({ error: 'Invalid upload path' });
    const buf = Buffer.from(String(dataBase64), 'base64');
    if (buf.length > 7.5 * 1024 * 1024)
      return res.status(413).json({ error: 'File too large — max 7 MB via web upload' });
    const put = await fetch('https://cremona-upload-worker.garam-9b9.workers.dev/' + key, {
      method: 'PUT',
      headers: { 'Content-Type': String(contentType || 'application/octet-stream') },
      body: buf,
    });
    if (!put.ok) return res.status(502).json({ error: 'Storage upload failed (' + put.status + ')' });
    return res.json({ success: true, url: 'https://files.cremonamusic.com/' + key });
  } catch (e) {
    console.error('[uploadFile]', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});


// ── Birthday wishes: everyone with a registered dob gets a greeting at 9 AM ──
exports.birthdayWishes = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const mmdd = `-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const year = today.getFullYear();

    const snap = await admin.firestore().collection('users').get();
    for (const docSnap of snap.docs) {
      const u = docSnap.data();
      if (!u.dob || !String(u.dob).endsWith(mmdd)) continue;
      if (u.status === 'deleted' || u.status === 'inactive') continue;
      if (u.birthdayWishedYear === year) continue; // already wished this year
      try {
        const info = await getUserPushInfo(docSnap.id);
        if (info) {
          const firstName = u.firstName || (u.name || '').split(' ')[0] || u.name || '';
          await sendLocalized([info], (S) => ({
            title: S.birthdayTitle,
            body: S.birthdayBody(firstName),
            data: { type: 'birthday' },
          }));
        }
        await docSnap.ref.set({ birthdayWishedYear: year }, { merge: true });
        console.log('[birthdayWishes] wished', u.name || docSnap.id);
      } catch (e) {
        console.error('[birthdayWishes]', docSnap.id, e.message);
      }
    }
    return null;
  });


// ── TEMPORARY diagnostics: pages report rapid-redirect breadcrumbs here ─────
exports.beacon = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    console.log('[beacon]', JSON.stringify(req.body).slice(0, 900));
  } catch (e) {}
  return res.json({ ok: true });
});


// ── Monthly report requests: admin asks teachers to write student reports ───
exports.requestReports = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const { idToken, items } = req.body || {};
    if (!idToken || !Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'Missing fields' });
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(idToken); }
    catch { return res.status(401).json({ error: 'Invalid token' }); }
    const db = admin.firestore();
    const callerDoc = await db.collection('users').doc(decoded.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin')
      return res.status(403).json({ error: 'Admins only' });
    if (DEMO_UIDS.includes(decoded.uid))
      return res.status(403).json({ error: 'Demo accounts cannot send report requests.' });

    const seoul = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const period = `${seoul.getFullYear()}-${String(seoul.getMonth() + 1).padStart(2, '0')}`;

    let created = 0, skipped = 0;
    const byTeacher = {}; // uid -> { name, students: [] }
    for (const it of items.slice(0, 500)) {
      if (!it.teacherUid || !it.studentId) { skipped++; continue; }
      const dup = await db.collection('reportRequests')
        .where('teacherUid', '==', String(it.teacherUid))
        .where('studentId', '==', String(it.studentId))
        .where('period', '==', period)
        .limit(1).get();
      if (!dup.empty) { skipped++; continue; }
      await db.collection('reportRequests').add({
        studentId: String(it.studentId),
        studentName: String(it.studentName || ''),
        teacherUid: String(it.teacherUid),
        teacherName: String(it.teacherName || ''),
        period,
        status: 'pending',
        requestedBy: decoded.uid,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created++;
      (byTeacher[it.teacherUid] = byTeacher[it.teacherUid] || []).push(String(it.studentName || 'a student'));
    }

    // one grouped notification per teacher
    for (const [uid, students] of Object.entries(byTeacher)) {
      try {
        const info = await getUserPushInfo(uid);
        if (!info) continue;
        const names = students.slice(0, 3).join(', ') + (students.length > 3 ? ` +${students.length - 3}` : '');
        await sendLocalized([info], (S) => ({
          title: S.reportRequestTitle,
          body: S.reportRequestBody(students.length, names),
          data: { type: 'report-request' },
        }));
      } catch (e) { console.error('[requestReports notify]', uid, e.message); }
    }
    return res.json({ success: true, created, skipped, period });
  } catch (e) {
    console.error('[requestReports]', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});


// ── Homework notifications ───────────────────────────────────────────────────
exports.onHomeworkWritten = functions.firestore
  .document('homework/{hwId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;
    const student = after.studentName || 'your child';

    // newly assigned → tell the parents
    if (!before) {
      const infos = after.studentId ? await getParentPushInfoForStudent(after.studentId) : [];
      if (infos.length) {
        await sendLocalized(infos, (S) => ({
          title: S.homeworkNewTitle,
          body: S.homeworkNewBody(student, after.teacherName || 'The teacher'),
          data: { type: 'homework', hwId: context.params.hwId },
        }));
      }
      return null;
    }
    // submitted → tell the teacher
    if (before.status !== 'submitted' && after.status === 'submitted' && after.teacherUid) {
      const info = await getUserPushInfo(after.teacherUid);
      if (info) {
        await sendLocalized([info], (S) => ({
          title: S.homeworkSubmittedTitle,
          body: S.homeworkSubmittedBody(student),
          data: { type: 'homework', hwId: context.params.hwId },
        }));
      }
      return null;
    }
    // reviewed → tell the parents
    if (before.status !== 'reviewed' && after.status === 'reviewed' && after.studentId) {
      const infos = await getParentPushInfoForStudent(after.studentId);
      if (infos.length) {
        await sendLocalized(infos, (S) => ({
          title: S.homeworkReviewedTitle,
          body: S.homeworkReviewedBody(student),
          data: { type: 'homework', hwId: context.params.hwId },
        }));
      }
    }
    return null;
  });

// ── Two-factor authentication (opt-in, push-approval like Google Prompt) ────
// Enrollment (client): generates a random deviceSecret + backup codes, stores
// their hashes in twoFactorSecrets/{uid} (never client-readable), sets
// users/{uid}.twoFactorEnabled = true, keeps the deviceSecret on the device.
// Login: the signing-in client creates loginChallenges/{id}; the trigger below
// pushes an approval prompt to the enrolled device; the device approves via
// approve2FA (proving possession of deviceSecret). Firestore rules forbid a
// direct client status write, so a password-only attacker cannot self-approve.
const hash2FA = (uid, secret) =>
  crypto.createHash('sha256').update(`${uid}:2fa:${String(secret).trim()}`).digest('hex');

exports.onLoginChallengeCreated = functions.firestore
  .document('loginChallenges/{challengeId}')
  .onCreate(async (snap, context) => {
    const ch = snap.data();
    if (!ch || ch.status !== 'pending' || !ch.uid) return null;
    const info = await getUserPushInfo(ch.uid);
    if (!info || !info.token) return null; // no enrolled device to prompt
    const S = stringsFor(info.lang);
    await sendExpoMessages([{
      to: info.token,
      title: S.twoFactorTitle,
      body: ch.requestedFrom ? `${S.twoFactorBody} (${ch.requestedFrom})` : S.twoFactorBody,
      channelId: 'urgent',
      priority: 'high',
      sound: 'default',
      data: { type: '2fa-challenge', challengeId: context.params.challengeId },
    }]);
    return null;
  });

// Approve/deny a login challenge — requires the enrolled device's secret, so
// only the physical enrolled device can resolve it.
exports.approve2FA = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const { uid, challengeId, deviceSecret, decision } = req.body || {};
    if (!uid || !challengeId || !deviceSecret) return res.status(400).json({ error: 'Missing fields' });
    const secSnap = await admin.firestore().collection('twoFactorSecrets').doc(uid).get();
    if (!secSnap.exists) return res.status(400).json({ error: 'Not enrolled' });
    if (secSnap.data().deviceSecretHash !== hash2FA(uid, deviceSecret))
      return res.status(403).json({ error: 'This device is not the enrolled device.' });
    const ref = admin.firestore().collection('loginChallenges').doc(challengeId);
    const chSnap = await ref.get();
    if (!chSnap.exists || chSnap.data().uid !== uid) return res.status(404).json({ error: 'Challenge not found' });
    if (chSnap.data().status !== 'pending') return res.json({ success: true, status: chSnap.data().status });
    const status = decision === 'deny' ? 'denied' : 'approved';
    await ref.update({ status, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ success: true, status });
  } catch (e) {
    console.error('approve2FA:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Recover with a one-time backup code when the enrolled device is unavailable.
exports.verifyBackupCode = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const { uid, challengeId, code } = req.body || {};
    if (!uid || !challengeId || !code) return res.status(400).json({ error: 'Missing fields' });
    const secRef = admin.firestore().collection('twoFactorSecrets').doc(uid);
    const secSnap = await secRef.get();
    if (!secSnap.exists) return res.status(400).json({ error: 'Not enrolled' });
    const codes = Array.isArray(secSnap.data().backupCodeHashes) ? secSnap.data().backupCodeHashes : [];
    const h = hash2FA(uid, String(code).trim().toUpperCase().replace(/[\s-]/g, ''));
    if (!codes.includes(h)) return res.status(403).json({ error: 'Invalid or already-used backup code.' });
    await secRef.update({ backupCodeHashes: admin.firestore.FieldValue.arrayRemove(h) });
    const ref = admin.firestore().collection('loginChallenges').doc(challengeId);
    const chSnap = await ref.get();
    if (chSnap.exists && chSnap.data().uid === uid && chSnap.data().status === 'pending') {
      await ref.update({ status: 'approved', viaBackupCode: true, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    return res.json({ success: true, remaining: codes.length - 1 });
  } catch (e) {
    console.error('verifyBackupCode:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Two-factor email-code fallback ──────────────────────────────────────────
// Alternative to push approval / backup codes: email a 6-digit code that the
// user types to approve the pending login challenge. Reuses the EmailJS OTP
// template. Codes are stored hashed in twoFactorEmailCodes/{uid} (no client
// access — Admin SDK only), expire in 10 min, and allow 5 attempts.
exports.send2FAEmailCode = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const { uid, challengeId } = req.body || {};
    if (!uid || !challengeId) return res.status(400).json({ error: 'Missing fields' });
    const chSnap = await admin.firestore().collection('loginChallenges').doc(challengeId).get();
    if (!chSnap.exists || chSnap.data().uid !== uid || chSnap.data().status !== 'pending')
      return res.status(400).json({ error: 'No pending sign-in to verify.' });
    let user;
    try { user = await admin.auth().getUser(uid); } catch { return res.status(404).json({ error: 'Account not found' }); }
    if (!user.email) return res.status(400).json({ error: 'No email on file for this account.' });

    const ref = admin.firestore().collection('twoFactorEmailCodes').doc(uid);
    const existing = await ref.get();
    if (existing.exists && existing.data().lastSentAt &&
        Date.now() - existing.data().lastSentAt.toMillis() < 45000)
      return res.json({ success: true }); // rate limit: at most one email / 45s

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await ref.set({
      codeHash: hash2FA(uid, code),
      challengeId,
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    try {
      const { subject, html } = renderEmail('otp', { passcode: code });
      await gmailSend({ to: user.email, subject, html });
    } catch (mailErr) {
      console.error('2FA email send failed:', mailErr);
      return res.status(502).json({ error: 'Could not send the email. Please try again.' });
    }
    return res.json({ success: true });
  } catch (e) {
    console.error('send2FAEmailCode:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

exports.verify2FAEmailCode = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const { uid, challengeId, code } = req.body || {};
    if (!uid || !challengeId || !code) return res.status(400).json({ error: 'Missing fields' });
    const ref = admin.firestore().collection('twoFactorEmailCodes').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(400).json({ error: 'No code was sent. Request a new one.' });
    const d = snap.data();
    if (d.expiresAt.toMillis() < Date.now() || (d.attempts || 0) >= 5) {
      await ref.delete();
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }
    if (d.challengeId !== challengeId || d.codeHash !== hash2FA(uid, String(code).trim())) {
      await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
      return res.status(403).json({ error: 'Invalid code.' });
    }
    await ref.delete();
    const chRef = admin.firestore().collection('loginChallenges').doc(challengeId);
    const chSnap = await chRef.get();
    if (chSnap.exists && chSnap.data().uid === uid && chSnap.data().status === 'pending')
      await chRef.update({ status: 'approved', viaEmailCode: true, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ success: true });
  } catch (e) {
    console.error('verify2FAEmailCode:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Email via Gmail API (replaces EmailJS) ──────────────────────────────────
// POST { type, to, params }. `otp` is public (pre-login) and rate-limited;
// other types (e.g. `credentials`) require an admin Firebase ID token in the
// Authorization: Bearer <token> header.
const PUBLIC_EMAIL_TYPES = new Set(['otp', 'welcome', 'trial']);
const ALL_EMAIL_TYPES = new Set(['otp', 'credentials', 'welcome', 'trial', 'payment', 'report']);
// Types whose recipient is fixed server-side (ignore client `to`) so the
// endpoint can't be used to send arbitrary mail. Trial leads go to the school.
const FIXED_RECIPIENT = { trial: 'op@cremonamusic.com' };

async function callerIsAdmin(req) {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return false;
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    const snap = await admin.firestore().collection('users').doc(decoded.uid).get();
    return snap.exists && snap.data().role === 'admin';
  } catch { return false; }
}

exports.sendMail = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { type, to, params } = req.body || {};
    if (!ALL_EMAIL_TYPES.has(type)) return res.status(400).json({ error: 'Unknown email type' });

    const email = (FIXED_RECIPIENT[type] || String(to || '').trim().toLowerCase());
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Invalid recipient' });

    // Non-public types require an admin caller
    if (!PUBLIC_EMAIL_TYPES.has(type) && !(await callerIsAdmin(req))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Anti-abuse for public types: at most 6 per hour per recipient
    if (PUBLIC_EMAIL_TYPES.has(type)) {
      const ref = admin.firestore().collection('mailRateLimit')
        .doc(Buffer.from(type + ':' + email).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 120));
      const allowed = await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const hourAgo = Date.now() - 3600e3;
        const d = snap.exists ? snap.data() : {};
        const startMs = d.start && d.start.toMillis ? d.start.toMillis() : 0;
        const count = startMs > hourAgo ? (d.count || 0) : 0;
        if (count >= 6) return false;
        tx.set(ref, {
          start: startMs > hourAgo ? d.start : admin.firestore.Timestamp.now(),
          count: count + 1,
        }, { merge: true });
        return true;
      });
      if (!allowed) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    const { subject, html } = renderEmail(type, params);
    const id = await gmailSend({ to: email, subject, html });
    return res.json({ success: true, id });
  } catch (e) {
    console.error('[sendMail]', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});
