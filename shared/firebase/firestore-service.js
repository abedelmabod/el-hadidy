import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  // تأكد إن بياناتك هنا كاملة ومكتوبة صح
  apiKey: "AIza...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

// 1. تأكد إنك بتعمل Initialize للأبلكيشن
const app = initializeApp(firebaseConfig);

// 2. تأكد إنك بتعمل Export لكل خدمة لوحدها
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { app };