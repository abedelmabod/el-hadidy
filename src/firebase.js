import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { 
  getAuth, 
  initializeAuth, 
  getReactNativePersistence 
} from "firebase/auth";

// 1. إعدادات الفايربيز
const firebaseConfig = {
  apiKey: "AIzaSyC0adM1TaTOek1iJLgHUxFprfO4nEImjvw",
  authDomain: "el-hadidy-app.firebaseapp.com",
  projectId: "el-hadidy-app",
  storageBucket: "el-hadidy-app.firebasestorage.app",
  messagingSenderId: "1031581630612",
  appId: "1:1031581630612:web:558d5e604b8085a13b7481",
};

// 2. تشغيل الأبلكيشن (تأكد من عدم التكرار بسبب الـ Hot Reload)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// 3. تهيئة خدمة الـ Auth مع نظام تخزين الموبايل (الحل الجذري للـ Runtime Error)
let auth;
try {
  // بنحاول نعمل initializeAuth أول مرة فقط
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  // لو الـ Auth مسجل بالفعل (بسبب الـ Hot Reload) بننادي عليه بـ getAuth
  auth = getAuth(app);
}

// 4. تهيئة الـ Firestore مع إعدادات الـ Android الطويلة (Long Polling)
let db;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  });
} catch (error) {
  db = getFirestore(app);
}

// 5. تهيئة الـ Storage
const storage = getStorage(app);

// التصدير للاستخدام في App.js وكل الشاشات
export { app, auth, db, storage };