// Firebase Configuration - Cremona Music Portal
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// TODO(setup): replace with the Cremona Firebase project's own web-app config
// (Firebase console → Project settings → Your apps → Web app → SDK setup).
// These are placeholders — the portal will not connect until they are filled in.
const firebaseConfig = {
  apiKey: "REPLACE_ME_CREMONA_API_KEY",
  authDomain: "portal.cremonamusic.com",
  projectId: "cremona-portal",
  storageBucket: "cremona-portal.firebasestorage.app",
  messagingSenderId: "REPLACE_ME_SENDER_ID",
  appId: "REPLACE_ME_APP_ID",
  measurementId: "REPLACE_ME_MEASUREMENT_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
