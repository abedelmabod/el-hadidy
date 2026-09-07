import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { hasAllCoursesAccess } from '../services/course-access-service';

const ARABIC_NUMBERS = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_NUMBERS = '۰۱۲۳۴۵۶۷۸۹';

const normalizeDigits = (value = '') => String(value || '')
  .replace(/[٠-٩]/g, (digit) => String(ARABIC_NUMBERS.indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String(EASTERN_ARABIC_NUMBERS.indexOf(digit)));

const normalizeArabicText = (value = '') => normalizeDigits(value)
  .toString()
  .trim()
  .replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const uniqueById = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    const key = item.id || item.code || JSON.stringify(item);
    if (key && !map.has(key)) map.set(key, item);
  });
  return Array.from(map.values());
};

const getUserCodes = (user = {}) => {
  const codes = Array.isArray(user.usedCodes)
    ? user.usedCodes
    : (user.usedCode ? [user.usedCode] : []);
  return Array.from(new Set(codes.map((code) => normalizeDigits(code).replace(/\D/g, '').trim()).filter(Boolean)));
};

const isPausedCode = (code = {}) =>
  code.isActive === false || code.disabled === true || code.revoked === true || code.isStopped === true;

const codeBelongsToStudent = (code = {}, user = {}) => {
  const studentId = String(user?.id || user?.uid || '');
  const userCodes = getUserCodes(user);
  const codeValue = normalizeDigits(code.code || '').replace(/\D/g, '').trim();
  const matchesStudentId = !!studentId && String(code.usedById || '') === studentId;
  const matchesCode = !!codeValue && userCodes.includes(codeValue);
  return matchesStudentId || matchesCode;
};

const yearMatches = (activeYear = '', requestedYear = '') => {
  const requested = normalizeArabicText(requestedYear);
  if (!requested) return true;
  return normalizeArabicText(activeYear) === requested;
};

const fetchStudentCodes = async (user = {}) => {
  const studentId = String(user?.id || user?.uid || '');
  const userCodes = getUserCodes(user);
  const requests = [];

  if (studentId) {
    requests.push(
      getDocs(query(collection(db, 'codes'), where('usedById', '==', studentId)))
        .then((snapshot) => snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })))
        .catch(() => [])
    );
  }

  userCodes.forEach((code) => {
    requests.push(
      getDocs(query(collection(db, 'codes'), where('code', '==', code)))
        .then((snapshot) => snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })))
        .catch(() => [])
    );
  });

  if (!requests.length) return [];
  return uniqueById((await Promise.all(requests)).flat());
};

export const checkActiveVideoAccess = async (user = {}, requestedYear = '') => {
  if (!user || user.isBanned) {
    return { allowed: false, reason: 'account' };
  }

  if (await hasAllCoursesAccess(user)) return { allowed: true, reason: '' };
  if (user.isSubscribed === false) return { allowed: false, reason: 'account' };

  const codes = await fetchStudentCodes(user);
  const activeCodes = codes.filter((code) =>
    !isPausedCode(code)
    && code.isUsed !== false
    && codeBelongsToStudent(code, user)
  );

  if (!activeCodes.length) {
    return { allowed: false, reason: 'code' };
  }

  const hasRequestedYearAccess = activeCodes.some((code) =>
    yearMatches(code.year || code.accessYear || code.codeYear || '', requestedYear)
  );

  return {
    allowed: hasRequestedYearAccess,
    reason: hasRequestedYearAccess ? '' : 'year',
  };
};

export const getAccessDeniedMessage = (reason = '') => {
  if (reason === 'year') return 'هذا المحتوى غير متاح لهذه الفرقة حالياً.';
  if (reason === 'account') return 'هذا الحساب غير مؤهل للوصول إلى هذا المحتوى.';
  return 'رمز التسجيل غير صحيح أو غير متاح.';
};
