// src/services/auth-service.js

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const ROLE_COLLECTIONS = [
  { name: "admins", role: "admin" },
  { name: "support_team", role: "support" },
  { name: "students", role: "student" },
];

export class SharedAuthError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SharedAuthError";
    this.code = code;
    this.details = details;
  }
}

export function normalizeIdentifier(value) {
  return normalizeEnglishDigits(value).trim().toLowerCase();
}

export function normalizeEmail(value) {
  return normalizeEnglishDigits(value).trim().toLowerCase();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function normalizeEnglishDigits(value = "") {
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
}

export function keepEnglishDigitsOnly(value = "") {
  return normalizeEnglishDigits(value).replace(/\D/g, "");
}

export function buildAuthEmail(identifier) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized;
  return `${normalized}@elhadidy.app`;
}

function normalizeYear(value) {
  return String(value || "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSessionUser(id, role, data, authUser = null) {
  return {
    id,
    uid: authUser?.uid || data.authUid || id,
    email: authUser?.email || data.email || buildAuthEmail(data.username),
    ...data,
    role,
  };
}

function mapQueryDocument(collectionConfig, snapshot) {
  return {
    id: snapshot.id,
    role: collectionConfig.role,
    collectionName: collectionConfig.name,
    data: snapshot.data(),
  };
}

async function findUserByIdentifier(db, identifier) {
  for (const collectionConfig of ROLE_COLLECTIONS) {
    const snapshot = await getDocs(
      query(
        collection(db, collectionConfig.name),
        where("username", "==", normalizeIdentifier(identifier))
      )
    );

    if (!snapshot.empty) {
      return mapQueryDocument(collectionConfig, snapshot.docs[0]);
    }
  }
  return null;
}

async function findUserByEmail(db, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  for (const collectionConfig of ROLE_COLLECTIONS) {
    const snapshot = await getDocs(
      query(
        collection(db, collectionConfig.name),
        where("email", "==", normalizedEmail)
      )
    );

    if (!snapshot.empty) {
      return mapQueryDocument(collectionConfig, snapshot.docs[0]);
    }
  }

  return null;
}

async function findUserByUid(db, uid) {
  for (const collectionConfig of ROLE_COLLECTIONS) {
    const directDoc = await getDoc(doc(db, collectionConfig.name, uid));

    if (directDoc.exists()) {
      return {
        id: directDoc.id,
        role: collectionConfig.role,
        collectionName: collectionConfig.name,
        data: directDoc.data(),
      };
    }
  }
  return null;
}

function mapFirebaseAuthError(error) {
  const code = error?.code || "auth/unknown";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
    return new SharedAuthError("INVALID_CREDENTIALS", "اسم المستخدم أو كلمة المرور غير صحيحة.");
  }
  if (code === "auth/invalid-email") {
    return new SharedAuthError("INVALID_EMAIL", "برجاء إدخال بريد إلكتروني صحيح.");
  }
  if (code === "auth/user-not-found") {
    return new SharedAuthError("PROFILE_NOT_FOUND", "لا يوجد حساب مرتبط بهذا البريد الإلكتروني.");
  }
  if (code === "auth/email-already-in-use") {
    return new SharedAuthError("EMAIL_IN_USE", "البريد الإلكتروني مستخدم بالفعل.");
  }
  if (code === "auth/weak-password") {
    return new SharedAuthError("WEAK_PASSWORD", "كلمة المرور ضعيفة. اختر كلمة مرور أقوى.");
  }
  if (code === "auth/too-many-requests") {
    return new SharedAuthError("TOO_MANY_REQUESTS", "تمت محاولات كثيرة. حاول مرة أخرى بعد قليل.");
  }
  return new SharedAuthError("AUTH_ERROR", error?.message || "تعذر إتمام المصادقة حالياً.");
}

const getAllowedDeviceCount = (studentData = {}) => {
  const parsed = Number(studentData.maxDevices ?? studentData.deviceLimit ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(10, Math.floor(parsed)));
};

const getRegisteredDeviceIds = (studentData = {}) => {
  const ids = Array.isArray(studentData.deviceIds) ? studentData.deviceIds : [];
  const legacyId = studentData.deviceId ? [studentData.deviceId] : [];
  return Array.from(new Set([...ids, ...legacyId].map((id) => String(id || "").trim()).filter(Boolean)));
};

/**
 * دالة التحقق من صلاحية وصول الطالب
 * تم تعديلها لتسمح بالدخول حتى لو لم يكن مشتركاً (isSubscribed: false)
 */
async function ensureStudentAccess(db, profile, device = {}) {
  const studentRef = doc(db, "students", profile.id);
  const studentData = profile.data;
  const deviceId = String(device.id || "").trim();
  const maxDevices = getAllowedDeviceCount(studentData);
  const registeredDeviceIds = getRegisteredDeviceIds(studentData);

  // 1. التحقق من الحظر (يمنع الدخول تماماً)
  if (studentData.isBanned) {
    throw new SharedAuthError(
      "ACCOUNT_BANNED",
      studentData.banReason || "هذا الحساب محظور من قبل الإدارة.",
      { profile }
    );
  }

  // 2. التحقق من عدد الأجهزة المسموح بها
  if (
    deviceId &&
    registeredDeviceIds.length >= maxDevices &&
    !registeredDeviceIds.includes(deviceId)
  ) {
    throw new SharedAuthError(
      "DEVICE_MISMATCH",
      "هذا الحساب مرتبط بجهاز آخر.",
      { profile, requestedDevice: device }
    );
  }

  // تسجيل جهاز جديد إذا كان العدد المسموح لم يكتمل
  if (deviceId && !registeredDeviceIds.includes(deviceId)) {
    const nextDeviceIds = [...registeredDeviceIds, deviceId];
    const devicePatch = {
      deviceId: studentData.deviceId || nextDeviceIds[0],
      deviceIds: nextDeviceIds,
      deviceCount: nextDeviceIds.length,
      maxDevices,
      deviceType: device.type || null,
      deviceInfo: device.info || null,
      lastDeviceId: deviceId,
      lastDeviceLinkedAt: serverTimestamp(),
    };
    await updateDoc(studentRef, devicePatch);
    return { ...studentData, ...devicePatch };
  }

  // لاحظ: لم نعد نتحقق من usedCode أو isSubscribed هنا للسماح للطالب بفتح التطبيق
  return {
    ...studentData,
    maxDevices,
    deviceIds: registeredDeviceIds,
    deviceCount: registeredDeviceIds.length,
  };
}

export async function signInWithSharedCredentials(services, payload) {
  const { auth, db } = services;
  const identifier = normalizeIdentifier(payload?.identifier);
  const password = String(payload?.password || "");
  const device = payload?.device || {};

  if (!identifier || !password) {
    throw new SharedAuthError("MISSING_CREDENTIALS", "أدخل اسم المستخدم وكلمة المرور.");
  }

  const isEmailLogin = identifier.includes("@");
  const profileByUsername = isEmailLogin ? null : await findUserByIdentifier(db, identifier);
  const profileByEmail = isEmailLogin ? await findUserByEmail(db, identifier) : null;
  const loginEmail = isEmailLogin
    ? normalizeEmail(identifier)
    : normalizeEmail(profileByUsername?.data?.email) || buildAuthEmail(identifier);

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      loginEmail,
      password
    );

    const resolvedProfile =
      (await findUserByUid(db, credential.user.uid)) || profileByUsername || profileByEmail;

    if (!resolvedProfile) {
      throw new SharedAuthError("PROFILE_NOT_FOUND", "ملف المستخدم غير موجود.");
    }

    // تطبيق منطق التحقق (حظر/جهاز) للطلاب فقط
    const resolvedData =
      resolvedProfile.role === "student"
        ? await ensureStudentAccess(db, resolvedProfile, device)
        : resolvedProfile.data;

    return {
      authMode: "firebase",
      user: buildSessionUser(
        resolvedProfile.id,
        resolvedProfile.role,
        resolvedData,
        credential.user
      ),
    };
  } catch (error) {
    if (error instanceof SharedAuthError) throw error;
    throw mapFirebaseAuthError(error);
  }
}

export async function registerStudentWithCode(services, payload) {
  const { auth, db } = services;
  const name = String(payload?.name || "").trim();
  const username = normalizeIdentifier(payload?.username);
  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password || "").trim();
  const phone = keepEnglishDigitsOnly(payload?.phone);
  const year = String(payload?.year || "").trim();
  const codeValue = normalizeEnglishDigits(payload?.code).trim().toUpperCase();
  const device = payload?.device || {};

  if (!name || !username || !email || !password || !phone || !year) {
    throw new SharedAuthError("MISSING_FIELDS", "برجاء إدخال جميع البيانات.");
  }

  if (!isValidEmail(email)) {
    throw new SharedAuthError("INVALID_EMAIL", "برجاء إدخال بريد إلكتروني صحيح.");
  }

  const existingUser = await findUserByIdentifier(db, username);
  if (existingUser) {
    throw new SharedAuthError("USERNAME_TAKEN", "اسم المستخدم محجوز بالفعل.");
  }

  const existingEmail = await findUserByEmail(db, email);
  if (existingEmail) {
    throw new SharedAuthError("EMAIL_IN_USE", "البريد الإلكتروني مستخدم بالفعل.");
  }

  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  const studentProfile = {
    name,
    username,
    phone,
    year,
    email: credential.user.email || email,
    authUid: credential.user.uid,
    isBanned: false,
    isSubscribed: false,
    usedCode: "",
    pendingCode: codeValue || "",
    codeReviewStatus: codeValue ? "pending" : "",
    maxDevices: 1,
    deviceId: device.id || null,
    deviceIds: device.id ? [device.id] : [],
    deviceCount: device.id ? 1 : 0,
    deviceType: device.type || null,
    deviceInfo: device.info || null,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, "students", credential.user.uid), studentProfile);

  if (codeValue) {
    await addDoc(collection(db, "teacher_code_requests"), {
      studentId: credential.user.uid,
      studentName: name,
      username,
      phone,
      year,
      code: codeValue,
      status: "pending",
      createdAt: serverTimestamp(),
    });
  }

  return {
    authMode: "firebase",
    user: buildSessionUser(credential.user.uid, "student", studentProfile, credential.user),
  };
}

export async function sendSharedPasswordResetEmail(services, identifier) {
  const { auth, db } = services;
  const normalizedIdentifier = normalizeIdentifier(identifier);

  if (!normalizedIdentifier) {
    throw new SharedAuthError("MISSING_IDENTIFIER", "أدخل البريد الإلكتروني أولا.");
  }

  let resetEmail = normalizedIdentifier.includes("@") ? normalizeEmail(normalizedIdentifier) : "";

  if (!resetEmail) {
    const profile = await findUserByIdentifier(db, normalizedIdentifier);
    resetEmail = normalizeEmail(profile?.data?.email);
  }

  if (!isValidEmail(resetEmail) || resetEmail.endsWith("@elhadidy.app")) {
    throw new SharedAuthError("INVALID_EMAIL", "لا يوجد بريد إلكتروني حقيقي مرتبط بهذا الحساب.");
  }

  try {
    await sendPasswordResetEmail(auth, resetEmail);
  } catch (error) {
    throw mapFirebaseAuthError(error);
  }

  return { ok: true, email: resetEmail };
}

export function observeSharedAuthSession(services, onChange) {
  const { auth, db } = services;
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      onChange(null);
      return;
    }
    const profile = await findUserByUid(db, firebaseUser.uid);
    if (!profile) {
      onChange(null);
      return;
    }
    onChange(buildSessionUser(profile.id, profile.role, profile.data, firebaseUser));
  });
}

export async function signOutSharedSession(services) {
  return signOut(services.auth);
}

export async function logDeviceResetRequest(services, payload) {
  const { db } = services;
  return addDoc(collection(db, "logs"), {
    studentId: payload.studentId,
    studentName: payload.studentName,
    action: "طلب تصفير جهاز",
    deviceType: payload.deviceType || "Unknown",
    time: serverTimestamp(),
  });
}
