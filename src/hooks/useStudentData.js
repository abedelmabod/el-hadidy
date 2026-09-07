import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDoc,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { hasAllCoursesAccess } from '../services/course-access-service';

const SHARED_YEAR = 'مشترك';
const GENERAL_SUBJECT = 'عام';
const CACHE_TTL_MS = 5 * 60 * 1000;
const PERSISTENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PERSISTENT_CACHE_PREFIX = 'student-data-cache-v3';
const MAX_IN_VALUES = 10;

const YEAR_LABELS = [
  'الفرقة الأولى',
  'الفرقة الثانية',
  'الفرقة الثالثة',
  'الفرقة الرابعة',
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
];
const YEAR_ALIASES = [
  { rank: 1, labels: ['1', '01', 'الأولى', 'الاولي', 'أولى', 'اولى', 'الفرقة الأولى', 'الفرقه الاولي', 'first'] },
  { rank: 2, labels: ['2', '02', 'الثانية', 'الثانيه', 'ثانية', 'ثانيه', 'الفرقة الثانية', 'الفرقه الثانيه', 'second'] },
  { rank: 3, labels: ['3', '03', 'الثالثة', 'الثالثه', 'ثالثة', 'ثالثه', 'الفرقة الثالثة', 'الفرقه الثالثه', 'third'] },
  { rank: 4, labels: ['4', '04', 'الرابعة', 'الرابعه', 'رابعة', 'رابعه', 'الفرقة الرابعة', 'الفرقه الرابعه', 'fourth'] },
  { rank: 5, labels: ['الصف الأول الثانوي', 'الصف الاول الثانوي', 'اولى ثانوي', 'أولى ثانوي', 'الاولي الثانوي', 'الأولى الثانوي', 'ثانوي اولي', 'secondary 1', 'sec1'] },
  { rank: 6, labels: ['الصف الثاني الثانوي', 'الصف الثانى الثانوي', 'تانية ثانوي', 'ثانية ثانوي', 'الثانية الثانوي', 'الثانيه الثانوي', 'ثانوي ثانية', 'secondary 2', 'sec2'] },
  { rank: 7, labels: ['الصف الثالث الثانوي', 'تالته ثانوي', 'تالتة ثانوي', 'ثالثة ثانوي', 'الثالثة الثانوي', 'الثالثه الثانوي', 'ثانوي ثالثة', 'secondary 3', 'sec3'] },
];

const dataCache = new Map();
const pendingRequests = new Map();
const collectionFallbackCache = new Map();

export const normalizeDigits = (value = '') =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

export const normalizeArabicText = (value = '') =>
  normalizeDigits(value)
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const mapDoc = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

const chunk = (items = [], size = MAX_IN_VALUES) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const uniqueValues = (values = []) => {
  const seen = new Set();
  return values.filter((value) => {
    if (value === undefined || value === null || value === '') return false;
    const key = `${typeof value}:${String(value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const uniqueById = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return Array.from(map.values());
};

const getYearRank = (value = '') => {
  const normalized = normalizeArabicText(value);
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 4) return numeric;

  const match = YEAR_ALIASES.find((entry) =>
    entry.labels.some((label) => normalizeArabicText(label) === normalized)
  );
  return match?.rank || 999;
};

const getCanonicalYearLabel = (value = '') => {
  const rank = getYearRank(value);
  return YEAR_LABELS[rank - 1] || String(value ?? '').trim();
};

const buildYearQueryValues = (years = [], { includeShared = false } = {}) => {
  const values = [];
  years.forEach((year) => {
    const canonical = getCanonicalYearLabel(year);
    const rank = getYearRank(canonical);
    values.push(year, canonical);
    if (rank !== 999) values.push(rank, String(rank), `0${rank}`);
  });
  if (includeShared) values.push(SHARED_YEAR);
  return uniqueValues(values);
};

const yearMatches = (documentYear, accessYear, { allowShared = false } = {}) => {
  if (documentYear === undefined || documentYear === null || documentYear === '') return false;
  if (allowShared && normalizeArabicText(documentYear) === normalizeArabicText(SHARED_YEAR)) return true;

  const documentRank = getYearRank(documentYear);
  const accessRank = getYearRank(accessYear);
  if (documentRank !== 999 && accessRank !== 999) return documentRank === accessRank;

  return normalizeArabicText(documentYear) === normalizeArabicText(accessYear);
};

const getSortValue = (item = {}) => {
  const raw = item.order ?? item.sortOrder ?? item.sequence ?? item.lessonOrder ?? item.lessonNumber ?? item.number;
  const number = Number(normalizeDigits(raw ?? ''));
  return Number.isFinite(number) ? number : 9999;
};

const sortByOrder = (a = {}, b = {}) => {
  const orderDiff = getSortValue(a) - getSortValue(b);
  if (orderDiff !== 0) return orderDiff;
  return String(a.name || a.title || '').localeCompare(String(b.name || b.title || ''), 'ar');
};

const getAccessYears = (profile = {}, fallbackGrade = '', selectedYear = '') => {
  if (selectedYear) return [getCanonicalYearLabel(selectedYear)];

  const routeYears = Array.isArray(profile.routeAccessYears) ? profile.routeAccessYears : [];
  const profileYears = Array.isArray(profile.accessYears) ? profile.accessYears : [];
  const rawYears = routeYears.length
    ? routeYears
    : profileYears.length
      ? profileYears
      : [
        profile.academicYear,
        profile.grade,
        profile.accessYear,
        profile.codeYear,
        fallbackGrade,
        profile.year,
      ];

  const seen = new Set();
  return rawYears
    .map(getCanonicalYearLabel)
    .filter((year) => {
      const key = normalizeArabicText(year);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => getYearRank(a) - getYearRank(b));
};

const resolveExplicitSelectedYear = (studentGrade, options = {}) =>
  options.accessYear
  || options.routeParams?.accessYear
  || options.year
  || options.routeParams?.year
  || options.selectedYear
  || options.routeParams?.selectedYear
  || (studentGrade && typeof studentGrade === 'object' ? studentGrade.accessYear || studentGrade.year || '' : '')
  || '';

const resolveFallbackGrade = (studentGrade, options = {}) => {
  if (studentGrade && typeof studentGrade === 'object') {
    return studentGrade.grade || studentGrade.academicYear || studentGrade.codeYear || studentGrade.yearKey || '';
  }
  return options.grade || options.academicYear || studentGrade || '';
};

const getLessonSubjectName = (lesson = {}) =>
  String(lesson.subject || lesson.subjectName || GENERAL_SUBJECT).trim() || GENERAL_SUBJECT;

const getLessonSubjectKey = (lesson = {}) => {
  if (lesson.subjectId) return `id:${lesson.subjectId}`;
  return `name:${normalizeArabicText(getLessonSubjectName(lesson))}`;
};

const getChapterKey = (chapter = {}) => {
  if (chapter.id) return `id:${chapter.id}`;
  if (chapter.chapterId) return `id:${chapter.chapterId}`;
  return `name:${normalizeArabicText(chapter.name || chapter.title || chapter.chapterName || '')}`;
};

const documentMatchesAccessYears = (item = {}, accessYears = [], { allowShared = false, includeGlobal = false } = {}) => {
  const documentYears = Array.isArray(item.accessYears) && item.accessYears.length
    ? item.accessYears
    : [item.year, item.accessYear, item.codeYear].filter(Boolean);

  if (!documentYears.length) return includeGlobal;
  return documentYears.some((documentYear) =>
    accessYears.some((accessYear) => yearMatches(documentYear, accessYear, { allowShared }))
  );
};

const fetchCollectionOnce = async (collectionName) => {
  const cached = collectionFallbackCache.get(collectionName);
  if (cached && Date.now() - cached.createdAt <= CACHE_TTL_MS) return cached.payload;

  const snapshot = await getDocs(collection(db, collectionName));
  const payload = snapshot.docs.map(mapDoc);
  collectionFallbackCache.set(collectionName, { createdAt: Date.now(), payload });
  return payload;
};

const queryCollectionInChunks = async (collectionName, field, values, operator = 'in') => {
  const sanitizedValues = uniqueValues(values);
  if (!sanitizedValues.length) return [];

  const snapshots = await Promise.all(
    chunk(sanitizedValues).map((valueChunk) =>
      getDocs(query(collection(db, collectionName), where(field, operator, valueChunk)))
    )
  );
  return uniqueById(snapshots.flatMap((snapshot) => snapshot.docs.map(mapDoc)));
};

const fetchYearScopedCollection = async (
  collectionName,
  accessYears,
  { allowShared = false, includeGlobal = false } = {}
) => {
  const yearQueryValues = buildYearQueryValues(accessYears, { includeShared: allowShared });
  let queryFailed = false;
  const safeQuery = (field, operator) =>
    queryCollectionInChunks(collectionName, field, yearQueryValues, operator).catch(() => {
      queryFailed = true;
      return [];
    });

  const [directMatches, accessYearMatches] = await Promise.all([
    safeQuery('year', 'in'),
    safeQuery('accessYears', 'array-contains-any'),
  ]);

  const queriedMatches = uniqueById([...directMatches, ...accessYearMatches])
    .filter((item) => documentMatchesAccessYears(item, accessYears, { allowShared, includeGlobal }));

  if (queriedMatches.length) return queriedMatches.sort(sortByOrder);
  if (!queryFailed) return [];

  const allDocuments = await fetchCollectionOnce(collectionName);
  return allDocuments
    .filter((item) => documentMatchesAccessYears(item, accessYears, { allowShared, includeGlobal }))
    .sort(sortByOrder);
};

const fetchStudentProfile = async (studentId, fallbackProfile) => {
  if (!studentId) return fallbackProfile || null;
  const snapshot = await getDoc(doc(db, 'students', studentId));
  return snapshot.exists()
    ? { ...(fallbackProfile || {}), id: snapshot.id, ...snapshot.data(), routeAccessYears: fallbackProfile?.routeAccessYears || [] }
    : fallbackProfile || null;
};

const isCodeStillValidForStudent = (code = {}, profile = {}) => {
  const studentId = profile.id || profile.uid || '';
  const profileCodes = Array.isArray(profile.usedCodes)
    ? profile.usedCodes
    : (profile.usedCode ? [profile.usedCode] : []);
  const codeValue = String(code.code || '').trim();

  if (code.isActive === false || code.disabled === true || code.revoked === true || code.isStopped === true) return false;
  if (code.isUsed === false) return false;

  const matchesStudentId = !!studentId && String(code.usedById || '') === String(studentId);
  const matchesStudentCode = !!codeValue && profileCodes.map((item) => String(item || '').trim()).includes(codeValue);
  return matchesStudentId || matchesStudentCode;
};

const fetchActiveCodeAccessYears = async (profile = {}) => {
  const studentId = profile.id || profile.uid || '';
  const profileCodes = Array.isArray(profile.usedCodes)
    ? profile.usedCodes
    : (profile.usedCode ? [profile.usedCode] : []);

  const codeQueries = [];
  if (studentId) {
    codeQueries.push(
      getDocs(query(collection(db, 'codes'), where('usedById', '==', studentId)))
        .then((snapshot) => snapshot.docs.map(mapDoc))
        .catch(() => [])
    );
  }
  if (profileCodes.length) {
    codeQueries.push(queryCollectionInChunks('codes', 'code', profileCodes, 'in').catch(() => []));
  }

  if (!codeQueries.length) return [];

  const codeDocuments = uniqueById((await Promise.all(codeQueries)).flat());
  const activeYears = codeDocuments
    .filter((code) => isCodeStillValidForStudent(code, profile))
    .map((code) => code.year || code.accessYear || code.codeYear)
    .filter(Boolean)
    .map(getCanonicalYearLabel);

  const seen = new Set();
  return activeYears
    .filter((year) => {
      const key = normalizeArabicText(year);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => getYearRank(a) - getYearRank(b));
};

const resolveAuthorizedAccessYears = async (profile = {}, fallbackGrade = '', selectedYear = '') => {
  if (profile.isBanned) return [];
  if (await hasAllCoursesAccess(profile)) {
    // Discover years from live content so future courses need no new grant.
    const snapshots = await Promise.all(['lessons', 'subjects'].map((name) => getDocs(collection(db, name))));
    const years = snapshots.flatMap((snapshot) => snapshot.docs.flatMap((document) => {
      const item = document.data();
      return [item.year, item.accessYear, ...(Array.isArray(item.accessYears) ? item.accessYears : [])];
    })).filter(Boolean);
    const availableYears = getAccessYears({ accessYears: years });
    return selectedYear
      ? availableYears.filter((year) => yearMatches(year, getCanonicalYearLabel(selectedYear)))
      : availableYears;
  }
  const activeCodeYears = await fetchActiveCodeAccessYears(profile);
  if (!activeCodeYears.length) return [];

  if (!selectedYear) return activeCodeYears;

  const selectedCanonicalYear = getCanonicalYearLabel(selectedYear);
  return activeCodeYears.some((year) => yearMatches(year, selectedCanonicalYear))
    ? [selectedCanonicalYear]
    : [];
};

const fetchSubjectDocuments = async (subjectIds) => {
  const ids = uniqueValues(subjectIds);
  if (!ids.length) return [];
  return queryCollectionInChunks('subjects', documentId(), ids, 'in').catch(() => []);
};

const buildSubjectsFromLessons = (lessons = [], subjectDocuments = [], yearSubjects = []) => {
  const documentsById = new Map(subjectDocuments.map((subject) => [subject.id, subject]));
  const subjectMap = new Map();

  yearSubjects.forEach((subject) => {
    const key = subject.id ? `id:${subject.id}` : `name:${normalizeArabicText(subject.name)}`;
    subjectMap.set(key, {
      ...subject,
      id: subject.id || key,
      subjectId: subject.id || '',
      name: subject.name || GENERAL_SUBJECT,
      count: 0,
      order: subject.order ?? subject.sortOrder ?? 9999,
    });
  });

  lessons.forEach((lesson) => {
    const key = getLessonSubjectKey(lesson);
    const documentSubject = lesson.subjectId ? documentsById.get(lesson.subjectId) : null;
    const previous = subjectMap.get(key);
    const name = documentSubject?.name || previous?.name || getLessonSubjectName(lesson);

    subjectMap.set(key, {
      ...documentSubject,
      id: lesson.subjectId || previous?.id || key,
      subjectId: lesson.subjectId || documentSubject?.id || previous?.subjectId || '',
      name,
      count: (previous?.count || 0) + 1,
      order: previous?.order ?? documentSubject?.order ?? documentSubject?.sortOrder ?? 9999,
    });
  });

  return Array.from(subjectMap.values()).sort(sortByOrder);
};

const fetchChaptersForLessons = async (lessons = [], accessYears = []) => {
  const subjectIds = uniqueValues(lessons.map((lesson) => lesson.subjectId));
  let chapterDocuments = [];

  if (subjectIds.length) {
    chapterDocuments = await queryCollectionInChunks('chapters', 'subjectId', subjectIds, 'in').catch(() => []);
  }

  if (!chapterDocuments.length) {
    chapterDocuments = await fetchYearScopedCollection('chapters', accessYears, { allowShared: true });
  }

  const lessonChapterKeys = new Set(lessons.filter((lesson) => lesson.chapterId).map((lesson) => `id:${lesson.chapterId}`));
  const chapterMap = new Map();

  chapterDocuments
    .filter((chapter) => {
      const matchesYear = !chapter.year
        || accessYears.some((year) => yearMatches(chapter.year, year, { allowShared: true }));
      const isUsedByLessons = !lessonChapterKeys.size || lessonChapterKeys.has(`id:${chapter.id}`);
      return matchesYear && isUsedByLessons;
    })
    .forEach((chapter) => {
      chapterMap.set(getChapterKey(chapter), chapter);
    });

  lessons.forEach((lesson) => {
    if (!lesson.chapterId && !lesson.chapterName) return;
    const key = lesson.chapterId ? `id:${lesson.chapterId}` : `name:${normalizeArabicText(lesson.chapterName)}`;
    if (chapterMap.has(key)) return;

    chapterMap.set(key, {
      id: lesson.chapterId || key,
      name: lesson.chapterName || lesson.chapter || 'محاضرات عامة',
      title: lesson.chapterName || lesson.chapter || 'محاضرات عامة',
      subjectId: lesson.subjectId || '',
      subjectName: getLessonSubjectName(lesson),
      year: lesson.year,
      order: lesson.chapterOrder ?? lesson.order ?? 9999,
      generatedFromLesson: true,
    });
  });

  return Array.from(chapterMap.values()).sort(sortByOrder);
};

const fetchContentForAccessYears = async (accessYears = []) => {
  const lessons = (await fetchYearScopedCollection('lessons', accessYears))
    .filter((lesson) => lesson.isActive !== false)
    .sort(sortByOrder);
  const subjectIds = lessons.map((lesson) => lesson.subjectId).filter(Boolean);

  const [subjectDocuments, yearSubjects, chapters] = await Promise.all([
    fetchSubjectDocuments(subjectIds),
    fetchYearScopedCollection('subjects', accessYears),
    fetchChaptersForLessons(lessons, accessYears),
  ]);

  const subjects = buildSubjectsFromLessons(lessons, [...subjectDocuments, ...yearSubjects], yearSubjects);
  return { lessons, subjects, chapters };
};

const buildChaptersBySubject = (chapters = []) => chapters.reduce((acc, chapter) => {
  if (chapter.subjectId) {
    acc[chapter.subjectId] = acc[chapter.subjectId] || [];
    acc[chapter.subjectId].push(chapter);
  }
  if (chapter.subjectName) {
    const nameKey = `name:${chapter.subjectName}`;
    acc[nameKey] = acc[nameKey] || [];
    acc[nameKey].push(chapter);
  }
  return acc;
}, {});

const buildSections = ({ accessYears, lessons, subjects }) => accessYears.map((accessYear) => {
  const yearLessons = lessons.filter((lesson) => yearMatches(lesson.year, accessYear)).sort(sortByOrder);
  const subjectMap = new Map();

  subjects
    .filter((subject) => documentMatchesAccessYears(subject, [accessYear], { includeGlobal: true }))
    .forEach((subject) => {
      const key = subject.subjectId || subject.id ? `id:${subject.subjectId || subject.id}` : `name:${normalizeArabicText(subject.name)}`;
      subjectMap.set(key, {
        id: subject.id || key,
        name: subject.name || GENERAL_SUBJECT,
        subjectId: subject.subjectId || subject.id || '',
        count: subject.count || 0,
        order: subject.order ?? subject.sortOrder ?? 9999,
      });
    });

  yearLessons.forEach((lesson) => {
    const key = getLessonSubjectKey(lesson);
    const previous = subjectMap.get(key);
    subjectMap.set(key, {
      id: lesson.subjectId || previous?.id || key,
      name: previous?.name || getLessonSubjectName(lesson),
      subjectId: lesson.subjectId || previous?.subjectId || '',
      count: (previous?.count || 0) + 1,
      order: previous?.order ?? 9999,
    });
  });

  const materialLessons = yearLessons.filter((lesson) => lesson.pdfUrl).sort(sortByOrder);
  const materialSubjectMap = new Map();

  materialLessons.forEach((lesson) => {
    const key = getLessonSubjectKey(lesson);
    const previous = materialSubjectMap.get(key);
    materialSubjectMap.set(key, {
      id: lesson.subjectId || previous?.id || key,
      name: previous?.name || getLessonSubjectName(lesson),
      subjectId: lesson.subjectId || previous?.subjectId || '',
      count: (previous?.count || 0) + 1,
      order: previous?.order ?? 9999,
    });
  });

  return {
    accessYear,
    yearKey: normalizeArabicText(accessYear),
    lessons: yearLessons,
    subjects: Array.from(subjectMap.values()).sort(sortByOrder),
    materialLessons,
    materialSubjects: Array.from(materialSubjectMap.values()).sort(sortByOrder),
  };
});

const toFallbackProfile = (fallbackUser = {}, routeAccessYears = []) => ({
  id: fallbackUser?.id || fallbackUser?.uid || '',
  uid: fallbackUser?.uid || '',
  authUid: fallbackUser?.authUid || '',
  name: fallbackUser?.name || '',
  username: fallbackUser?.username || '',
  academicYear: fallbackUser?.academicYear || '',
  grade: fallbackUser?.grade || '',
  year: fallbackUser?.year || '',
  accessYear: fallbackUser?.accessYear || '',
  codeYear: fallbackUser?.codeYear || '',
  accessYears: Array.isArray(fallbackUser?.accessYears) ? fallbackUser.accessYears : [],
  routeAccessYears: Array.isArray(routeAccessYears) ? routeAccessYears : [],
  isBanned: !!fallbackUser?.isBanned,
  isSubscribed: !!fallbackUser?.isSubscribed,
  usedCode: fallbackUser?.usedCode || '',
  usedCodes: Array.isArray(fallbackUser?.usedCodes) ? fallbackUser.usedCodes : [],
});

const createFallbackProfileKey = (profile = {}) => JSON.stringify([
  profile.id,
  profile.uid,
  profile.academicYear,
  profile.grade,
  profile.year,
  profile.accessYear,
  profile.codeYear,
  profile.accessYears,
  profile.routeAccessYears,
  profile.isBanned,
  profile.isSubscribed,
  profile.usedCode,
  profile.usedCodes,
]);

const getPersistentCacheKey = (cacheKey) => `${PERSISTENT_CACHE_PREFIX}:${encodeURIComponent(cacheKey)}`;

const readCachedData = (cacheKey) => {
  const cached = dataCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    dataCache.delete(cacheKey);
    return null;
  }
  return cached.payload;
};

const readPersistentCachedData = async (cacheKey) => {
  try {
    const raw = await AsyncStorage.getItem(getPersistentCacheKey(cacheKey));
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached?.payload || Date.now() - Number(cached.createdAt || 0) > PERSISTENT_CACHE_TTL_MS) {
      await AsyncStorage.removeItem(getPersistentCacheKey(cacheKey));
      return null;
    }

    dataCache.set(cacheKey, { createdAt: cached.createdAt, payload: cached.payload });
    return cached.payload;
  } catch {
    return null;
  }
};

const writePersistentCachedData = async (cacheKey, payload) => {
  try {
    await AsyncStorage.setItem(
      getPersistentCacheKey(cacheKey),
      JSON.stringify({ createdAt: Date.now(), payload })
    );
  } catch {
    // Cache failures should never block the learning flow.
  }
};

const fetchStudentDataSnapshot = async ({ studentId, fallbackProfile, studentGrade, selectedYear, skipContent = false }) => {
  const profile = await fetchStudentProfile(studentId || fallbackProfile?.id, fallbackProfile);
  const accessYears = await resolveAuthorizedAccessYears(profile || fallbackProfile || {}, studentGrade, selectedYear);

  if (!accessYears.length || skipContent) {
    return { profile, accessYears, lessons: [], subjects: [], chapters: [] };
  }

  const yearPayloads = await Promise.all(accessYears.map((accessYear) => fetchContentForAccessYears([accessYear])));
  return {
    profile,
    accessYears,
    lessons: uniqueById(yearPayloads.flatMap((payload) => payload.lessons)).sort(sortByOrder),
    subjects: uniqueById(yearPayloads.flatMap((payload) => payload.subjects)).sort(sortByOrder),
    chapters: uniqueById(yearPayloads.flatMap((payload) => payload.chapters)).sort(sortByOrder),
  };
};

export default function useStudentData(studentGrade, options = {}) {
  const { studentId, fallbackUser, initialLoading = true } = options;
  const skipContent = options.skipContent === true;
  const requestIdRef = useRef(0);
  const routeAccessYears = Array.isArray(options.accessYears)
    ? options.accessYears
    : Array.isArray(options.routeParams?.accessYears)
      ? options.routeParams.accessYears
      : [];

  const gradeInputKey = typeof studentGrade === 'object'
    ? JSON.stringify([
      studentGrade?.accessYear,
      studentGrade?.year,
      studentGrade?.yearKey,
      studentGrade?.grade,
      studentGrade?.academicYear,
      studentGrade?.codeYear,
    ])
    : String(studentGrade || '');
  const optionGradeKey = JSON.stringify([
    options.accessYear,
    options.selectedYear,
    options.year,
    options.yearKey,
    options.grade,
    options.academicYear,
    routeAccessYears,
    options.routeParams?.accessYear,
    options.routeParams?.selectedYear,
    options.routeParams?.year,
    options.routeParams?.yearKey,
  ]);
  const selectedYearInput = useMemo(
    () => resolveExplicitSelectedYear(studentGrade, options),
    [gradeInputKey, optionGradeKey]
  );
  const selectedYearKey = useMemo(
    () => (selectedYearInput ? getCanonicalYearLabel(selectedYearInput) : ''),
    [selectedYearInput]
  );
  const fallbackGradeInput = useMemo(
    () => resolveFallbackGrade(studentGrade, options),
    [gradeInputKey, optionGradeKey]
  );
  const normalizedStudentGrade = useMemo(() => getCanonicalYearLabel(fallbackGradeInput || ''), [fallbackGradeInput]);
  const fallbackProfile = useMemo(() => toFallbackProfile(fallbackUser, routeAccessYears), [
    fallbackUser?.id,
    fallbackUser?.uid,
    fallbackUser?.name,
    fallbackUser?.username,
    fallbackUser?.academicYear,
    fallbackUser?.grade,
    fallbackUser?.year,
    fallbackUser?.accessYear,
    fallbackUser?.codeYear,
    fallbackUser?.isBanned,
    fallbackUser?.isSubscribed,
    fallbackUser?.usedCode,
    JSON.stringify(fallbackUser?.accessYears || []),
    JSON.stringify(fallbackUser?.usedCodes || []),
    JSON.stringify(routeAccessYears || []),
  ]);
  const fallbackProfileKey = useMemo(() => createFallbackProfileKey(fallbackProfile), [fallbackProfile]);
  const stableStudentId = useMemo(
    () => String(studentId || fallbackProfile.id || fallbackProfile.uid || ''),
    [fallbackProfile.id, fallbackProfile.uid, studentId]
  );
  const cacheKey = useMemo(
    () => `${skipContent ? 'profile' : 'content'}:${stableStudentId || 'guest'}:${selectedYearKey || 'all'}:${normalizedStudentGrade}:${fallbackProfileKey}`,
    [fallbackProfileKey, normalizedStudentGrade, selectedYearKey, skipContent, stableStudentId]
  );

  const [studentProfile, setStudentProfile] = useState(fallbackProfile || null);
  const [accessYears, setAccessYears] = useState(() => getAccessYears(fallbackProfile, normalizedStudentGrade, selectedYearKey));
  const [lessons, setLessons] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(initialLoading);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const applyPayload = useCallback((payload) => {
    setStudentProfile(payload.profile || fallbackProfile || null);
    setAccessYears(payload.accessYears || []);
    setLessons(payload.lessons || []);
    setSubjects(payload.subjects || []);
    setChapters(payload.chapters || []);
  }, [fallbackProfile]);

  const load = useCallback(async ({ force = false, silent = false } = {}) => {
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    let servedCachedPayload = false;

    if (!stableStudentId && !fallbackProfile.id) {
      applyPayload({
        profile: fallbackProfile,
        accessYears: getAccessYears(fallbackProfile, normalizedStudentGrade, selectedYearKey),
        lessons: [],
        subjects: [],
        chapters: [],
      });
      setLoading(false);
      setRefreshing(false);
      return null;
    }

    const memoryPayload = force ? null : readCachedData(cacheKey);
    if (!silent && !memoryPayload && initialLoading) setLoading(true);
    setError(null);

    try {
      let payload = memoryPayload;

      if (payload && requestIdRef.current === currentRequestId) {
        servedCachedPayload = true;
        applyPayload(payload);
        setLoading(false);
        setRefreshing(false);
      }

      if (!payload && !force) {
        const persistentPayload = await readPersistentCachedData(cacheKey);
        if (persistentPayload && requestIdRef.current === currentRequestId) {
          servedCachedPayload = true;
          payload = persistentPayload;
          applyPayload(persistentPayload);
          setLoading(false);
          setRefreshing(false);
        }
      }

      let pending = pendingRequests.get(cacheKey);
      if (!pending || force) {
        pending = fetchStudentDataSnapshot({
          studentId: stableStudentId,
          fallbackProfile,
          studentGrade: normalizedStudentGrade,
          selectedYear: selectedYearKey,
          skipContent,
        });
        pendingRequests.set(cacheKey, pending);
      }

      const freshPayload = await pending;
      dataCache.set(cacheKey, { createdAt: Date.now(), payload: freshPayload });
      writePersistentCachedData(cacheKey, freshPayload).catch(() => {});
      pendingRequests.delete(cacheKey);

      if (requestIdRef.current === currentRequestId) applyPayload(freshPayload);
      return freshPayload;
    } catch (loadError) {
      pendingRequests.delete(cacheKey);
      if (requestIdRef.current === currentRequestId) {
        setError(loadError);
        if (!servedCachedPayload) {
          setLessons([]);
          setSubjects([]);
          setChapters([]);
        }
      }
      return null;
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyPayload, cacheKey, fallbackProfile, initialLoading, normalizedStudentGrade, selectedYearKey, skipContent, stableStudentId]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    return load({ force: true, silent: true });
  }, [load]);

  const activateTeacherCode = useCallback(async (rawCode) => {
    const currentStudent = studentProfile || fallbackProfile || {};
    const trimmedCode = normalizeDigits(rawCode).replace(/\D/g, '').trim().toUpperCase();

    if (!trimmedCode) throw new Error('من فضلك أدخل رمز التسجيل.');

    const codeSnapshot = await getDocs(
      query(collection(db, 'codes'), where('code', '==', trimmedCode), where('isUsed', '==', false))
    );
    if (codeSnapshot.empty) throw new Error('رمز التسجيل غير صحيح أو غير متاح.');

    const codeDoc = codeSnapshot.docs[0];
    const codeData = codeDoc.data();
    if (codeData.isActive === false || codeData.disabled === true || codeData.revoked === true || codeData.isStopped === true) {
      throw new Error('رمز التسجيل غير متاح حاليًا.');
    }
    const accessYear = getCanonicalYearLabel(codeData.year || currentStudent.year || normalizedStudentGrade || '');
    const existingCodes = Array.isArray(currentStudent.usedCodes)
      ? currentStudent.usedCodes
      : (currentStudent.usedCode ? [currentStudent.usedCode] : []);
    const nextUsedCodes = Array.from(new Set([...existingCodes, trimmedCode].filter(Boolean)));
    const nextAccessYears = getAccessYears({
      ...currentStudent,
      accessYears: [...(Array.isArray(currentStudent.accessYears) ? currentStudent.accessYears : []), accessYear],
    }, normalizedStudentGrade);

    const batch = writeBatch(db);
    batch.update(doc(db, 'students', currentStudent.id), {
      isSubscribed: true,
      usedCode: trimmedCode,
      usedCodes: nextUsedCodes,
      accessYear,
      accessYears: nextAccessYears,
      codeYear: accessYear,
      pendingCode: '',
      codeReviewStatus: 'approved',
    });
    batch.update(doc(db, 'codes', codeDoc.id), {
      isUsed: true,
      usedByName: currentStudent.name || '',
      usedBy: currentStudent.username || '',
      usedById: currentStudent.id || null,
      usedAt: serverTimestamp(),
    });
    await batch.commit();

    await addDoc(collection(db, 'logs'), {
      studentId: currentStudent.id || null,
      studentName: currentStudent.name || '',
      action: `تأكيد تسجيل تلقائي لكورس ${accessYear}`,
      code: trimmedCode,
      alertType: 'code_activation',
      seen: true,
      deviceType: Platform.OS,
      time: serverTimestamp(),
    });

    dataCache.clear();
    collectionFallbackCache.clear();
    pendingRequests.delete(cacheKey);
    await load({ force: true, silent: true });
    return accessYear;
  }, [cacheKey, fallbackProfile, load, normalizedStudentGrade, studentProfile]);

  const data = useMemo(() => {
    const sections = buildSections({ accessYears, lessons, subjects });
    const availableMaterials = lessons.filter((lesson) => lesson.pdfUrl);
    const currentStudent = studentProfile || fallbackProfile || {};

    return {
      currentStudent,
      accessYears,
      lessons,
      subjects,
      chapters,
      chaptersBySubject: buildChaptersBySubject(chapters),
      sections,
      materialSections: sections,
      availableMaterials,
      isAccountBanned: !!currentStudent.isBanned,
      accessLocked: !!currentStudent.isBanned || accessYears.length === 0,
    };
  }, [accessYears, chapters, fallbackProfile, lessons, studentProfile, subjects]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
    activateTeacherCode,
  };
}
