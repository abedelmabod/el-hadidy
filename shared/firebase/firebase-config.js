import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// الإضافات الجديدة لحل مشكلة الـ Auth في الموبايل
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const firebaseConfig = {
  apiKey: "AIzaSyC0adM1TaTOek1iJLgHUxFprfO4nEImjvw",
  authDomain: "el-hadidy-app.firebaseapp.com",
  projectId: "el-hadidy-app",
  storageBucket: "el-hadidy-app.firebasestorage.app",
  messagingSenderId: "1031581630612",
  appId: "1:1031581630612:web:558d5e604b8085a13b7481",
};

export function getOrCreateFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

// دالة الـ Auth المعدلة لدعم الموبايل والويب معاً
export function getFirebaseAuth(app, options = {}) {
  const { platform = "web" } = options;

  // لو ويب، استخدم getAuth العادي
  if (platform !== "native") {
    return getAuth(app);
  }

  // لو موبايل، لازم نستخدم initializeAuth مع AsyncStorage لحل مشكلة الـ Runtime
  try {
    const auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
    return auth;
  } catch (error) {
    // في حالة إعادة التشغيل (Hot Reload) قد يكون الـ Auth مسجل بالفعل
    return getAuth(app);
  }
}

export function getFirebaseFirestore(app, options = {}) {
  const { platform = "web" } = options;

  if (platform !== "native") {
    return getFirestore(app);
  }

  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    });
  } catch (error) {
    return getFirestore(app);
  }
}

export function getFirebaseStorage(app) {
  return getStorage(app);
}