// Firebase Configuration - I TALK Teachers
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_TQF-oExYsPY4qOJtfrcDCwXbc4HV0-0",
  authDomain: "cremonamusic-portal.firebaseapp.com",
  projectId: "cremonamusic-portal",
  storageBucket: "cremonamusic-portal.firebasestorage.app",
  messagingSenderId: "227259733472",
  appId: "1:227259733472:web:3cb86ab0da1d5338858785",
  measurementId: "G-D0H4Q2JXR5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
