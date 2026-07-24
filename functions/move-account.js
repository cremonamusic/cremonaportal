#!/usr/bin/env node
/**
 * One-off script: move an account to a new email address.
 *
 * Used to move the admin account to op@cremonamusic.com — updates both the
 * Firebase Auth user and the matching `users` Firestore document.
 *
 * Setup (run inside the functions/ folder):
 *   1. npm install            (firebase-admin is already a dependency)
 *   2. Download a service-account key:
 *      Firebase console → Project settings → Service accounts →
 *      "Generate new private key" → save as functions/serviceAccountKey.json
 *      (do NOT commit this file)
 *   3. Run:
 *      node move-account.js <current-email> <new-email>
 *      e.g. node move-account.js garamgj@gmail.com op@cremonamusic.com
 *
 * Notes:
 *   - The password stays the same. Sign in afterwards with the NEW email.
 *   - If the account used Google sign-in, sign in with email+password after
 *     the move (set one first with the reset flow if needed), because the
 *     Google account is still tied to the old address.
 */
const admin = require('firebase-admin');
const path  = require('path');

const [oldEmail, newEmail] = process.argv.slice(2);
if (!oldEmail || !newEmail) {
  console.error('Usage: node move-account.js <current-email> <new-email>');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json')))
});

(async () => {
  const user = await admin.auth().getUserByEmail(oldEmail);
  console.log(`Found auth user ${user.uid} (${oldEmail})`);

  await admin.auth().updateUser(user.uid, { email: newEmail, emailVerified: true });
  console.log(`Auth email updated → ${newEmail}`);

  const ref  = admin.firestore().collection('users').doc(user.uid);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({ email: newEmail });
    console.log('Firestore users doc updated.');
  } else {
    console.warn('No users doc found for this uid — skipped Firestore update.');
  }

  console.log('Done. Sign in with the new email (same password).');
  process.exit(0);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
