// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBG7149_KbseNSQAe6tIs_mjA_fvlnlsJY",
  authDomain: "olivia-1st-birthday.firebaseapp.com",
  projectId: "olivia-1st-birthday",
  storageBucket: "olivia-1st-birthday.firebasestorage.app",
  messagingSenderId: "63593206108",
  appId: "1:63593206108:web:b0913acbd278d4dceff199",
  measurementId: "G-EV25JWTTHF"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
