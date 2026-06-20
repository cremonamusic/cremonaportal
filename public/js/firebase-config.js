// Firebase Configuration - I TALK Teachers
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAPfuUfjwVpewn1YVjm1D_mAsu-DLEHLa8",
  authDomain: "italk-teachers.firebaseapp.com",
  projectId: "italk-teachers",
  storageBucket: "italk-teachers.firebasestorage.app",
  messagingSenderId: "566278333053",
  appId: "1:566278333053:web:bcd0a14138d18b572b0714",
  measurementId: "G-D0H4Q2JXR5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
