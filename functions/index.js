const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

exports.deleteUser = functions.https.onRequest(async (req, res) => {
  try {
    const body = req.body || {};
    const { action, adminUid } = body;

    const callerDoc = await admin.firestore().collection('users').doc(adminUid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin')
      return res.status(403).json({ error: 'Admins only' });

    // ── Create teacher ──────────────────────────────────────────────────────
    if (action === 'createTeacher') {
      const { firstName, lastName, email, password } = body;
      if (!firstName || !lastName || !email || !password)
        return res.status(400).json({ error: 'Missing fields' });
      if (password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const userRecord = await admin.auth().createUser({
        email, password, displayName: `${firstName} ${lastName}`
      });
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        firstName, lastName,
        name:        `${firstName} ${lastName}`,
        email,
        role:        'teacher',
        status:      'active',
        ssoProvider: 'email',
        institution: '',
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.json({ success: true, uid: userRecord.uid });
    }

    // ── Delete user (default) ───────────────────────────────────────────────
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

exports.resetPassword = functions.https.onRequest(async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password too short' });
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password: newPassword });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
