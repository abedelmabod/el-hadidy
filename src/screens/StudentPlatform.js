import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Pressable,
  StatusBar,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  Image,
  TextInput,
  Platform,
  Linking,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { collection, addDoc, doc, onSnapshot, updateDoc, where, serverTimestamp, getDocs, query, writeBatch } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { Video } from 'expo-av';
import { WebView } from 'react-native-webview';
import * as ScreenCapture from 'expo-screen-capture';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
import Animated, { 
  FadeInRight, 
  FadeInUp,
  FadeIn,
  SlideInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { db } from '../firebase';
import { subscribeToLiveCollection } from '../services/firestore-service';
import ThemeToggleButton from '../components/ThemeToggleButton';
const HOME_CARDS = [
  { id: 'videos', title: 'الفيديوهات', icon: 'play-circle' },
  { id: 'codes', title: 'تسجيل كود', icon: 'qrcode' },
  { id: 'materials', title: 'الملازم', icon: 'book' },
  { id: 'support', title: 'الدعم الفني', icon: 'headset' },
];

const normalizeYear = (value = '') =>
  String(value)
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();

const uniqByNormalized = (values = [], normalize) => {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result;
};
const normalizeYoutubeUrl = (url) => {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = url.match(regExp);
  const videoId = (match && match[2].length === 11) ? match[2] : null;
  
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
  }
  return url;
};
// زر متحرك احترافي بتأثير Spring
const AnimatedPressable = ({ children, onPress, style, disabled }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={disabled}
        onPressIn={() => (scale.value = withSpring(0.92, { damping: 15, stiffness: 200 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 15, stiffness: 200 }))}
        onPress={onPress}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function StudentPlatform({ user, setUser, navigation, theme, themeMode, toggleTheme }) {
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 360;
  const isWide = screenWidth >= 390;
  const horizontalPadding = isCompact ? 14 : 20;
  const quickCardWidth = '48%';
  const supportCardWidth = isCompact ? '100%' : '48%';
  const bottomInset = Platform.OS === 'ios' ? 22 : 12;
  const COLORS = {
    accent: theme.accent,
    accentAlt: theme.accentAlt,
    accentBlue: theme.accentBlue,
    accentGreen: theme.accentGreen,
    accentOrange: theme.accentOrange,
    bg: theme.bg,
    card: theme.card,
    cardAlt: theme.cardAlt,
    border: theme.border,
    text: theme.text,
    subText: theme.subText,
    danger: theme.danger,
    success: theme.success,
    bottomBar: theme.bottomBar,
    shadow: theme.shadow,
  };

  const styles = createStyles(COLORS, {
    bottomInset,
    horizontalPadding,
    isCompact,
    isWide,
    quickCardWidth,
    supportCardWidth,
  });
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  // ===== 3-Screen Navigation =====
  const [videoScreen, setVideoScreen] = useState('subjects'); // 'subjects' | 'chapters' | 'lessons'
  const [selectedSubject, setSelectedSubject] = useState(null); // { name, subjectId, count }
  const [selectedChapter, setSelectedChapter] = useState(null); // { id, name, notes, ... }
  const [subjectChapters, setSubjectChapters] = useState({});
  const [lastWatched, setLastWatched] = useState(null);
  const [teacherCode, setTeacherCode] = useState('');
  const [submittingCode, setSubmittingCode] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');
  const [studentProfile, setStudentProfile] = useState(user || null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [webPlayerLoading, setWebPlayerLoading] = useState(false);
  const [webPlayerError, setWebPlayerError] = useState('');
  const [webPlayerKey, setWebPlayerKey] = useState(0);
  const [nativeBuffering, setNativeBuffering] = useState(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const [showVideoControls, setShowVideoControls] = useState(true);
  const controlsTimerRef = useRef(null);
  const nativeVideoRef = useRef(null);
  const [motivationMsg, setMotivationMsg] = useState(null);

  const MOTIVATION_MESSAGES = [
    { emoji: '🎉', title: 'أحسنت!', msg: 'درس جديد خلصته، استمر كده وهتوصل لأي هدف!' },
    { emoji: '🔥', title: 'رائع!', msg: 'كل درس بتخلصه هو خطوة للأمام. أنت على الطريق الصح!' },
    { emoji: '⭐', title: 'ممتاز!', msg: 'التركيز والمثابرة هما سر النجاح. فخور بيك!' },
    { emoji: '💪', title: 'هتنجح!', msg: 'استمر في التعلم، النجاح قريب جداً!' },
    { emoji: '🏆', title: 'أبطال!', msg: 'كل فيديو بتشوفه بيقربك أكتر من هدفك!' },
    { emoji: '🚀', title: 'إلى الأمام!', msg: 'تقدمك يوم بعد يوم هو أقوى دليل على جديتك!' },
    { emoji: '✨', title: 'بالتوفيق!', msg: 'أنت تستحق كل نجاح. استمر ولا تتوقف!' },
  ];

  const showMotivation = () => {
    const msg = MOTIVATION_MESSAGES[Math.floor(Math.random() * MOTIVATION_MESSAGES.length)];
    setMotivationMsg(msg);
    setTimeout(() => setMotivationMsg(null), 4000);
  };

  // إعدادات أنيميشن السكرول (Parallax Header)
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, [-100, 0, 100], [1.1, 1, 0.95], Extrapolation.CLAMP);
    const opacity = interpolate(scrollY.value, [0, 100], [1, 0.8], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  useEffect(() => {
    if (!user?.id) return;

    const docRef = doc(db, 'students', user.id);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const freshData = { id: snapshot.id, ...snapshot.data() };
        setStudentProfile(freshData);
        if (freshData.isBanned) {
           setUser(null);
        }
      } else {
        console.log("المستند غير موجود في Firestore");
      }
    });

    return () => unsubscribe();
  }, [user?.id]);

 useEffect(() => {
    if (studentProfile?.isBanned) {
      Alert.alert('حسابك محظور', 'تم حظر حسابك لمخالفة سياسات المنصة.');
      setUser(null);
      return;
    }

    let screenshotSubscription;

    // حماية الويب: الكود بالأسفل سيعمل فقط على الموبايل
    if (Platform.OS !== 'web') {
      const enableProtection = async () => {
        try {
          const available = await ScreenCapture.isAvailableAsync();
          if (available) {
            await ScreenCapture.preventScreenCaptureAsync();
          }
        } catch (error) {
          console.log('Protection Error', error);
        }
      };

      enableProtection();

      screenshotSubscription = ScreenCapture.addScreenshotListener(async () => {
        if (!studentProfile?.id || studentProfile?.isBanned) return;
        try {
          await updateDoc(doc(db, 'students', studentProfile.id), { isBanned: true });
          await addDoc(collection(db, 'security_logs'), {
            action: 'محاولة تصوير شاشة',
            studentName: studentProfile.name,
            studentId: studentProfile.id,
            time: serverTimestamp(),
            deviceType: Platform.OS,
          });
          Alert.alert('تحذير أمني', 'تم رصد محاولة تصوير شاشة وتم إيقاف الحساب تلقائياً.');
          setUser(null);
        } catch (error) {
          console.error('Screenshot Log Error:', error);
        }
      });
    }

    return () => {
      if (Platform.OS !== 'web') {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
        if (screenshotSubscription && screenshotSubscription.remove) {
          screenshotSubscription.remove();
        }
      }
    };
  }, [studentProfile, setUser]);

  useEffect(() => {
    async function registerForPushNotificationsAsync() {
      let token;

      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') return;
        token = (await Notifications.getExpoPushTokenAsync()).data;
      }

      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: COLORS.accent,
        });
      }

      return token;
    }

    registerForPushNotificationsAsync().then((token) => {
      if (token && studentProfile?.id) {
        setExpoPushToken(token);
        updateDoc(doc(db, 'students', studentProfile.id), { pushToken: token }).catch(() => null);
      }
    });
  }, [studentProfile?.id, COLORS.accent]);

  const accessYears = useMemo(() => {
    const profile = studentProfile || user || {};
    const legacyYears = [
      profile?.accessYear,
      profile?.codeYear,
    ].filter(Boolean);
    const list = Array.isArray(profile?.accessYears) ? profile.accessYears : legacyYears;
    return uniqByNormalized(list, normalizeYear);
  }, [studentProfile, user]);

  const accessYearsSet = useMemo(() => new Set(accessYears.map((y) => normalizeYear(y))), [accessYears]);

  const fetchLessons = useCallback(() => {
    if (!accessYears.length) {
      setLessons([]);
      setLastWatched(null);
      setLoading(false);
      setRefreshing(false);
      return undefined;
    }

    setLoading(true);
    return subscribeToLiveCollection(db, 'lessons', {
      onData: (lessonsData) => {
        const visibleLessons = lessonsData.filter((lesson) => {
          const sameYear = accessYearsSet.has(normalizeYear(lesson.year));
          const isVisible = lesson.isActive !== false;
          return sameYear && isVisible;
        });
        setLessons(visibleLessons);
        setLastWatched(visibleLessons[0] || null);
        setLoading(false);
        setRefreshing(false);
      },
      onError: () => {
        setLoading(false);
        setRefreshing(false);
      },
    });
  }, [accessYears.length, accessYearsSet]);

  useEffect(() => {
    const unsub = fetchLessons();
    return () => unsub && unsub();
  }, [fetchLessons]);

  const currentStudent = studentProfile || user || {};
  const isCodeValid = accessYears.length > 0;
  const accessLocked = !isCodeValid;

  const lessonsByAccessYear = useMemo(() => {
    return accessYears.map((accessYear) => {
      const yearKey = normalizeYear(accessYear);
      const yearLessons = lessons.filter((lesson) => normalizeYear(lesson.year) === yearKey);
      const subjectMap = {};

      yearLessons.forEach((lesson) => {
        if (!lesson.subject) return;
        if (!subjectMap[lesson.subject]) {
          subjectMap[lesson.subject] = { name: lesson.subject, subjectId: lesson.subjectId || '', count: 0 };
        } else if (!subjectMap[lesson.subject].subjectId && lesson.subjectId) {
          subjectMap[lesson.subject].subjectId = lesson.subjectId;
        }
        subjectMap[lesson.subject].count++;
      });

      return {
        accessYear,
        yearKey,
        lessons: yearLessons,
        subjects: Object.values(subjectMap),
      };
    });
  }, [accessYears, lessons]);

  const groupedLessons = useMemo(() => {
    return lessons.reduce((acc, lesson) => {
      const key = lesson.subject || 'عام';
      if (!acc[key]) acc[key] = [];
      acc[key].push(lesson);
      return acc;
    }, {});
  }, [lessons]);

  const filteredLessons = useMemo(
    () => {
      if (!selectedSubject) return lessons;
      const yearKey = normalizeYear(selectedSubject.accessYear);
      return lessons.filter((lesson) => lesson.subject === selectedSubject.name && normalizeYear(lesson.year) === yearKey);
    },
    [lessons, selectedSubject]
  );

  const currentChapters = useMemo(() => {
    if (!selectedSubject) return [];
    // نحاول بـ subjectId الأول، لو مش موجود نجرب بالاسم
    const byId = selectedSubject.subjectId ? (subjectChapters[selectedSubject.subjectId] || []) : [];
    const byName = (subjectChapters[`name:${selectedSubject.name}`] || []);
    // نجمع الاتنين بدون تكرار
    const merged = [...byId];
    byName.forEach(ch => { if (!merged.find(m => m.id === ch.id)) merged.push(ch); });
    const yearKey = normalizeYear(selectedSubject.accessYear);
    return merged
      .filter((ch) => !ch.year || ch.year === 'مشترك' || normalizeYear(ch.year) === yearKey)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }, [subjectChapters, selectedSubject]);

  const chapterLessons = useMemo(() => {
    if (!selectedChapter) return filteredLessons;
    if (selectedChapter.id === 'no-chapter') return filteredLessons.filter(l => !l.chapterId);
    return filteredLessons.filter(l => l.chapterId === selectedChapter.id);
  }, [filteredLessons, selectedChapter]);

  // جلب الشابترات من Firestore — مفلترة حسب فرقة الطالب أو "مشترك"
  useEffect(() => {
    const allowedYears = accessYears.map((y) => normalizeYear(y));
    const unsubChapters = onSnapshot(collection(db, 'chapters'), (s) => {
      const grouped = {};
      s.docs.forEach(d => {
        const data = { id: d.id, ...d.data() };
        const dataYear = normalizeYear(data.year);
        const yearMatch = !data.year || data.year === 'مشترك' || allowedYears.includes(dataYear);
        if (!yearMatch) return;
        // نجمع بـ subjectId الأساسي
        const key = data.subjectId || '';
        if (key) {
          if (!grouped[key]) grouped[key] = [];
          if (!grouped[key].find(ch => ch.id === data.id)) grouped[key].push(data);
        }
        // كـ fallback نجمع بـ subjectName كمان
        const nameKey = `name:${data.subjectName || ''}`;
        if (data.subjectName) {
          if (!grouped[nameKey]) grouped[nameKey] = [];
          if (!grouped[nameKey].find(ch => ch.id === data.id)) grouped[nameKey].push(data);
        }
      });
      setSubjectChapters(grouped);
    });
    return () => unsubChapters();
  }, [studentProfile, user, accessYears]);

  const availableMaterials = useMemo(() => lessons.filter((lesson) => lesson.pdfUrl), [lessons]);

  const isYoutubeUrl = (url = '') => /youtu\.be|youtube\.com/.test(url);
  const isDriveUrl = (url = '') => /drive\.google\.com|docs\.google\.com/.test(url);

  // النطاقات المسموح بها فقط داخل WebView - يُمنع كل ما عداها
  const ALLOWED_VIDEO_DOMAINS = [
    'youtube-nocookie.com',
    'youtube.com',
    'youtu.be',
    'googlevideo.com',
    'ytimg.com',
    'ggpht.com',
    'drive.google.com',
    'docs.google.com',
    'googleapis.com',
    'googleusercontent.com',
  ];

  const isAllowedVideoDomain = (url = '') => {
    if (!url || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return true;
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      return ALLOWED_VIDEO_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d));
    } catch {
      return false;
    }
  };

  const extractYoutubeId = (url = '') => {
    if (!url) return '';
    try {
      const normalized = url.startsWith('http') ? url : `https://${url}`;
      const parsed = new URL(normalized);
      const hostname = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');
      const pathname = parsed.pathname || '';

      if (hostname === 'youtu.be') {
        const id = pathname.split('/').filter(Boolean)[0] || '';
        return id;
      }

      if (hostname.endsWith('youtube.com')) {
        if (pathname.startsWith('/watch')) return parsed.searchParams.get('v') || '';
        if (pathname.startsWith('/shorts/')) return pathname.split('/').filter(Boolean)[1] || '';
        if (pathname.startsWith('/live/')) return pathname.split('/').filter(Boolean)[1] || '';
        if (pathname.startsWith('/embed/')) return pathname.split('/').filter(Boolean)[1] || '';
        if (pathname.startsWith('/v/')) return pathname.split('/').filter(Boolean)[1] || '';
      }
    } catch {
      return '';
    }
    return '';
  };

  const normalizeYoutubeUrl = (url = '') => {
    const id = extractYoutubeId(url);
    if (!id) return url;
    return `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&fs=1&disablekb=0&controls=1&enablejsapi=1`;
  };

  const extractDriveId = (url = '') => {
    if (!url) return '';
    try {
      const normalized = url.startsWith('http') ? url : `https://${url}`;
      const parsed = new URL(normalized);
      const pathname = parsed.pathname || '';

      const match = pathname.match(/\/file\/d\/([^/]+)/) || pathname.match(/\/d\/([^/]+)/);
      if (match?.[1]) return match[1];

      const idParam = parsed.searchParams.get('id');
      if (idParam) return idParam;
    } catch {
      return '';
    }
    return '';
  };

  const normalizeDriveUrl = (url = '') => {
    const id = extractDriveId(url);
    if (!id) return url || '';
    return `https://drive.google.com/file/d/${id}/preview`;
  };

  const getInAppVideoUrl = (url = '') => {
    if (isYoutubeUrl(url)) return normalizeYoutubeUrl(url);
    if (isDriveUrl(url)) return normalizeDriveUrl(url);
    return url;
  };

  const needsEmbeddedWebPlayer = (url = '') => isYoutubeUrl(url) || isDriveUrl(url);

  const openExternalLink = async (url) => {
    if (!url) {
      Alert.alert('تنبيه', 'لا يوجد رابط متاح حالياً.');
      return;
    }
    const finalUrl = isDriveUrl(url) ? normalizeDriveUrl(url) : url;
    const canOpen = await Linking.canOpenURL(finalUrl);
    if (!canOpen) {
      Alert.alert('تعذر الفتح', 'الرابط غير صالح أو لا يمكن فتحه على هذا الجهاز.');
      return;
    }
    await Linking.openURL(finalUrl);
  };

  const openVideoInsideApp = (lesson) => {
    if (!lesson?.url) {
      Alert.alert('تنبيه', 'لا يوجد رابط فيديو متاح حالياً.');
      return;
    }
    const shouldUseWebPlayer = needsEmbeddedWebPlayer(lesson.url);
    setWebPlayerLoading(shouldUseWebPlayer);
    setWebPlayerError('');
    setNativeBuffering(false);
    setWebPlayerKey((value) => value + 1);
    setSelectedVideo(lesson);
    setLastWatched(lesson);
  };

  // ===== الحماية الأساسية: يمنع أي تنقل لخارج النطاقات المسموحة =====
  const shouldKeepVideoInsideApp = (request) => {
    const url = request?.url || '';
    if (!url) return false;
    // السماح فقط بالنطاقات المعروفة
    if (!isAllowedVideoDomain(url)) {
      // تسجيل محاولة الخروج في Firestore إن وُجد بروفايل
      if (studentProfile?.id) {
        addDoc(collection(db, 'security_logs'), {
          action: 'محاولة الوصول لمصدر الفيديو',
          blockedUrl: url.substring(0, 200),
          studentName: studentProfile.name,
          studentId: studentProfile.id,
          time: serverTimestamp(),
          deviceType: Platform.OS,
        }).catch(() => null);
      }
      return false; // ← يمنع تحميل الرابط
    }
    return true;
  };


  // ===== إخفاء أزرار التحكم تلقائياً =====
  const startControlsTimer = () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setShowVideoControls(false);
    }, 3500);
  };

  const handleVideoAreaPress = () => {
    setShowVideoControls((prev) => {
      if (!prev) {
        startControlsTimer();
        return true;
      }
      return false;
    });
  };

  // ===== Fullscreen: قلب الاتجاه + إخفاء Header و InfoPanel =====
  const toggleVideoFullscreen = async () => {
    try {
      if (!isVideoFullscreen) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsVideoFullscreen(true);
        setShowVideoControls(true);
        startControlsTimer();
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsVideoFullscreen(false);
        setShowVideoControls(true);
      }
    } catch {
      // جهاز لا يدعم قفل الاتجاه - نكتفي بتكبير المشغل مرئياً
      setIsVideoFullscreen((prev) => !prev);
      setShowVideoControls(true);
    }
  };

  const closeVideoPlayer = async () => {
    if (isVideoFullscreen) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => null);
      setIsVideoFullscreen(false);
    }
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    setShowVideoControls(true);
    setWebPlayerLoading(false);
    setWebPlayerError('');
    setNativeBuffering(false);
    const wasWatching = !!selectedVideo;
    setSelectedVideo(null);
    if (wasWatching) setTimeout(() => showMotivation(), 600);
  };

  const handleLogout = () => {
  const performLogout = () => {
    // مسح بيانات المستخدم وتوجيهه لصفحة اللوجين
    if (setUser) {
      setUser(null);
    }
  };

  if (Platform.OS === 'web') {
    // في الويب نستخدم confirm العادية لأن Alert.alert قد لا تعمل دائماً
    if (window.confirm("هل أنت متأكد من تسجيل الخروج؟")) {
      performLogout();
    }
  } else {
    // في الموبايل نستخدم Alert.alert الأصلية
    Alert.alert(
      "تسجيل الخروج",
      "هل أنت متأكد من رغبتك في الخروج؟",
      [
        { text: "إلغاء", style: "cancel" },
        { text: "خروج", style: "destructive", onPress: performLogout }
      ]
    );
  }
};

  const submitTeacherCode = async () => {
    const trimmedCode = teacherCode.trim().toUpperCase();

    if (!trimmedCode) {
      return Alert.alert('تنبيه', 'من فضلك أدخل كود المعلم.');
    }

    setSubmittingCode(true);
    try {
      const codeSnapshot = await getDocs(query(collection(db, 'codes'), where('code', '==', trimmedCode), where('isUsed', '==', false)));

      if (codeSnapshot.empty) {
        return Alert.alert('كود غير صحيح', 'الكود غير موجود أو تم استخدامه من قبل.');
      }

      const codeDoc = codeSnapshot.docs[0];
      const codeData = codeDoc.data();
      const accessYear = codeData.year || currentStudent?.year || '';
      const existingCodes = Array.isArray(currentStudent?.usedCodes)
        ? currentStudent.usedCodes
        : (currentStudent?.usedCode ? [currentStudent.usedCode] : []);
      const nextUsedCodes = Array.from(new Set([...existingCodes, trimmedCode].filter(Boolean)));
      const nextAccessYears = uniqByNormalized([...accessYears, accessYear].filter(Boolean), normalizeYear);
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
        usedByName: currentStudent?.name || '',
        usedBy: currentStudent?.username || '',
        usedById: currentStudent?.id || null,
        usedAt: serverTimestamp(),
      });
      await batch.commit();

      await addDoc(collection(db, 'logs'), {
        studentId: currentStudent?.id || null,
        studentName: currentStudent?.name || '',
        action: `تفعيل كود تلقائي لفرقة ${accessYear}`,
        code: trimmedCode,
        alertType: 'code_activation',
        seen: true,
        deviceType: Platform.OS,
        time: serverTimestamp(),
      });

      setTeacherCode('');
      Alert.alert('تم التفعيل', `تم إضافة محتوى ${accessYear} إلى حسابك.`);
    } catch (error) {
      Alert.alert('خطأ', 'حدثت مشكلة أثناء إرسال الكود.');
    } finally {
      setSubmittingCode(false);
    }
  };

  const renderAccessLocked = () => (
    <Animated.View entering={FadeInUp.duration(400).springify()} style={styles.lockedCard}>
      <View style={styles.lockedIcon}>
        <FontAwesome5 name="lock" size={20} color={COLORS.danger} />
      </View>
      <Text style={styles.lockedTitle}>تم إيقاف المحتوى مؤقتًا</Text>
      <Text style={styles.lockedText}>
        الكود الحالي ملغي أو غير مفعل. أدخل كودًا جديدًا حتى تعود الفيديوهات والملازم للعمل.
      </Text>
      <AnimatedPressable onPress={() => setActiveTab('codes')}>
        <LinearGradient colors={[COLORS.danger, '#ff7b8f']} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>إدخال كود جديد</Text>
        </LinearGradient>
      </AnimatedPressable>
    </Animated.View>
  );

  const renderHome = () => (
    <Animated.View entering={FadeInRight.duration(400).springify().damping(15)}>
      {lastWatched && !accessLocked && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>آخر فيديو</Text>
          <AnimatedPressable onPress={() => setActiveTab('videos')}>
            <LinearGradient colors={[COLORS.card, COLORS.cardAlt]} style={styles.heroCard}>
              <View style={styles.heroIconBubble}>
                <FontAwesome5 name="play" size={18} color={COLORS.accent} />
              </View>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroCardTitle} numberOfLines={2}>{lastWatched.title}</Text>
                <Text style={styles.heroCardSubtitle} numberOfLines={1}>{lastWatched.subject || 'عام'}</Text>
              </View>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>الخدمات</Text>
        <View style={styles.quickGrid}>
          {HOME_CARDS.map((card, index) => (
            <Animated.View key={card.id} entering={FadeInUp.delay(index * 100).duration(400).springify()} style={styles.quickCardWrap}>
              <AnimatedPressable
                onPress={() => setActiveTab(card.id)}
              >
                <LinearGradient colors={[COLORS.card, COLORS.cardAlt]} style={styles.quickCard}>
                  <View style={styles.quickIconBubble}>
                    <FontAwesome5 name={card.icon} size={20} color={COLORS.accent} />
                  </View>
                  <Text style={styles.quickCardText} numberOfLines={2}>{card.title}</Text>
                </LinearGradient>
              </AnimatedPressable>
            </Animated.View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>حالة الاشتراك</Text>
        <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: accessLocked ? `${COLORS.danger}18` : `${COLORS.success}18` }]}>
            <FontAwesome5
              name={accessLocked ? 'times-circle' : 'check-circle'}
              size={18}
              color={accessLocked ? COLORS.danger : COLORS.success}
            />
          </View>
          <View style={styles.statusTextWrap}>
            <Text style={styles.statusTitle}>{accessLocked ? 'الكود يحتاج تجديد' : 'الحساب مفعل'}</Text>
            <Text style={styles.statusText}>
              {accessLocked
                ? 'لن تظهر المحاضرات والملازم حتى يتم تسجيل كود صحيح.'
                : `الكود المستخدم: ${currentStudent?.usedCode || 'مفعل'}`}
            </Text>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );

  // ── شاشة 1: المواد ──
  const renderSubjectsList = () => (
    <Animated.View entering={FadeInRight.duration(380).springify()}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenHeaderTitle}>اختر المادة</Text>
        <Text style={styles.screenHeaderSub}>
          {lessonsByAccessYear.reduce((acc, item) => acc + (item.subjects?.length || 0), 0)} مادة دراسية
        </Text>
      </View>

      {lessonsByAccessYear.every((section) => (section.subjects?.length || 0) === 0) ? (
        <View style={styles.emptyState}>
          <FontAwesome5 name="book-open" size={36} color={COLORS.subText} style={{ opacity: 0.3 }} />
          <Text style={styles.emptyStateText}>لا توجد مواد متاحة لفرقتك حالياً</Text>
        </View>
      ) : (
        lessonsByAccessYear.map((section, sectionIndex) => {
          const subjects = section.subjects || [];
          if (!subjects.length) return null;
          return (
            <View key={section.yearKey} style={{ marginBottom: 18 }}>
              <View style={[styles.chapterBanner, { paddingVertical: 12 }]}>
                <View style={styles.chapterBannerIcon}>
                  <FontAwesome5 name="graduation-cap" size={16} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.chapterBannerTitle}>{section.accessYear}</Text>
                  <Text style={styles.chapterBannerSub}>{section.lessons.length} فيديو</Text>
                </View>
              </View>

              {subjects.map((sub, i) => {
                const itemIndex = sectionIndex * 100 + i;
                const byId = sub.subjectId ? (subjectChapters[sub.subjectId] || []) : [];
                const byName = subjectChapters[`name:${sub.name}`] || [];
                const uniqueChaps = [...byId, ...byName.filter(c => !byId.find(b => b.id === c.id))].filter((ch) => !ch.year || ch.year === 'مشترك' || normalizeYear(ch.year) === section.yearKey);
                const chapCount = uniqueChaps.length;

                return (
                  <Animated.View key={`${section.yearKey}:${sub.name}`} entering={FadeInUp.delay(itemIndex * 20).duration(400).springify().damping(14)}>
                    <TouchableOpacity
                      style={styles.rowCard}
                      activeOpacity={0.82}
                      onPress={() => {
                        setSelectedSubject({ ...sub, accessYear: section.accessYear });
                        setSelectedChapter(null);
                        setVideoScreen(chapCount > 0 ? 'chapters' : 'lessons');
                      }}
                    >
                      <FontAwesome5 name="chevron-left" size={11} color={COLORS.subText} style={{ opacity: 0.4 }} />
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.rowCardTitle}>{sub.name}</Text>
                        <Text style={styles.rowCardMeta}>
                          {sub.count} فيديو{chapCount > 0 ? ` • ${chapCount} شابتر` : ''}
                        </Text>
                      </View>
                      <View style={[styles.rowCardIcon, { backgroundColor: `${COLORS.accent}18`, borderColor: `${COLORS.accent}30` }]}>
                        <FontAwesome5 name="book" size={18} color={COLORS.accent} />
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          );
        })
      )}
    </Animated.View>
  );

  // ── شاشة 2: الشابترات ──
  const renderChaptersList = () => {
    const unassigned = filteredLessons.filter(l => !l.chapterId).length;
    return (
      <Animated.View entering={FadeInRight.duration(380).springify()}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setVideoScreen('subjects')}>
          <FontAwesome5 name="arrow-right" size={13} color={COLORS.accent} />
          <Text style={styles.backBtnText}>المواد</Text>
        </TouchableOpacity>

        <View style={styles.screenHeader}>
          <View style={styles.screenHeaderIcon}>
            <FontAwesome5 name="book" size={16} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.screenHeaderTitle}>{selectedSubject?.name}</Text>
            <Text style={styles.screenHeaderSub}>{currentChapters.length} شابتر • {filteredLessons.length} فيديو</Text>
          </View>
        </View>

        {currentChapters.map((ch, i) => {
          const cnt = filteredLessons.filter(l => l.chapterId === ch.id).length;
          return (
            <Animated.View key={ch.id} entering={FadeInUp.delay(i * 70).duration(400).springify().damping(14)}>
              <TouchableOpacity
                style={styles.rowCard}
                activeOpacity={0.82}
                onPress={() => { setSelectedChapter(ch); setVideoScreen('lessons'); }}
              >
                <FontAwesome5 name="chevron-left" size={11} color={COLORS.subText} style={{ opacity: 0.4 }} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.rowCardTitle}>{ch.name}</Text>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <Text style={styles.rowCardMeta}>{cnt} فيديو</Text>
                    {!!ch.notes && (
                      <View style={styles.notesBadge}>
                        <FontAwesome5 name="sticky-note" size={8} color={COLORS.subText} />
                        <Text style={styles.notesBadgeText}>ملاحظات</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={[styles.rowCardIcon, { backgroundColor: `${COLORS.accent}18`, borderColor: `${COLORS.accent}30` }]}>
                  <FontAwesome5 name="layer-group" size={16} color={COLORS.accent} />
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        {unassigned > 0 && (
          <Animated.View entering={FadeInUp.delay(currentChapters.length * 70).duration(400).springify()}>
            <TouchableOpacity
              style={[styles.rowCard, { borderStyle: 'dashed', opacity: 0.8 }]}
              activeOpacity={0.82}
              onPress={() => {
                setSelectedChapter({ id: 'no-chapter', name: 'محاضرات عامة', notes: '' });
                setVideoScreen('lessons');
              }}
            >
              <FontAwesome5 name="chevron-left" size={11} color={COLORS.subText} style={{ opacity: 0.4 }} />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.rowCardTitle}>محاضرات عامة</Text>
                <Text style={styles.rowCardMeta}>{unassigned} فيديو</Text>
              </View>
              <View style={[styles.rowCardIcon, { backgroundColor: `${COLORS.subText}18`, borderColor: `${COLORS.subText}30` }]}>
                <FontAwesome5 name="film" size={16} color={COLORS.subText} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}
      </Animated.View>
    );
  };

  // ── شاشة 3: الفيديوهات ──
  const renderLessonsList = () => {
    const hasChapters = currentChapters.length > 0;
    return (
      <Animated.View entering={FadeInRight.duration(380).springify()}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setVideoScreen(hasChapters ? 'chapters' : 'subjects')}
        >
          <FontAwesome5 name="arrow-right" size={13} color={COLORS.accent} />
          <Text style={styles.backBtnText}>
            {hasChapters ? (selectedChapter?.name || 'الشابترات') : (selectedSubject?.name || 'المواد')}
          </Text>
        </TouchableOpacity>

        {selectedChapter && selectedChapter.id !== 'no-chapter' && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.chapterBanner}>
            <View style={styles.chapterBannerIcon}>
              <FontAwesome5 name="layer-group" size={18} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.chapterBannerTitle}>{selectedChapter.name}</Text>
              <Text style={styles.chapterBannerSub}>{chapterLessons.length} فيديو</Text>
              {!!selectedChapter.notes && (
                <View style={styles.chapterBannerNotes}>
                  <FontAwesome5 name="info-circle" size={11} color={COLORS.accent} style={{ marginLeft: 6 }} />
                  <Text style={styles.chapterBannerNotesText}>{selectedChapter.notes}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {chapterLessons.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="video-slash" size={30} color={COLORS.subText} style={{ opacity: 0.3 }} />
            <Text style={styles.emptyStateText}>لا يوجد فيديوهات هنا بعد</Text>
          </View>
        ) : (
          chapterLessons.map((lesson, i) => (
            <Animated.View key={lesson.id} entering={FadeInUp.delay(i * 65).duration(400).springify().damping(14)}>
              <TouchableOpacity
                style={styles.lessonRowCard}
                activeOpacity={0.85}
                onPress={() => openVideoInsideApp(lesson)}
              >
                <View style={styles.lessonRowPlay}>
                  <LinearGradient colors={[COLORS.accent, COLORS.accentAlt]} style={styles.lessonRowPlayGrad}>
                    <FontAwesome5 name="play" size={12} color={COLORS.bg} style={{ marginLeft: 2 }} />
                  </LinearGradient>
                </View>
                <View style={styles.lessonRowInfo}>
                  <Text style={styles.lessonRowTitle} numberOfLines={2}>{lesson.title}</Text>
                  {!!lesson.description && (
                    <Text style={styles.lessonRowDesc} numberOfLines={2}>{lesson.description}</Text>
                  )}
                  <View style={styles.lessonRowBadges}>
                    <View style={styles.lessonRowBadge}>
                      <FontAwesome5 name="video" size={9} color={COLORS.accent} />
                      <Text style={styles.lessonRowBadgeText}>فيديو</Text>
                    </View>
                    {!!lesson.pdfUrl && (
                      <View style={[styles.lessonRowBadge, { backgroundColor: `${COLORS.danger}15`, borderColor: `${COLORS.danger}35` }]}>
                        <FontAwesome5 name="file-pdf" size={9} color={COLORS.danger} />
                        <Text style={[styles.lessonRowBadgeText, { color: COLORS.danger }]}>PDF</Text>
                      </View>
                    )}
                  </View>
                </View>
                <FontAwesome5 name="chevron-left" size={11} color={COLORS.subText} style={{ opacity: 0.35 }} />
              </TouchableOpacity>
            </Animated.View>
          ))
        )}
      </Animated.View>
    );
  };

 const renderVideoPlayer = () => {
  if (!selectedVideo) return null;

  const videoUrl = normalizeYoutubeUrl(selectedVideo.url);

  return (
    <View style={styles.videoWrapper}>
      {Platform.OS === 'web' ? (
        // مشغل الويب باستخدام iframe
        <iframe
          src={videoUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 12,
          }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        // مشغل الموبايل باستخدام WebView
        <WebView
          source={{ uri: videoUrl }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          startInLoadingState={true}
          renderLoading={() => (
            <ActivityIndicator 
              color={COLORS.accent} 
              size="large" 
              style={StyleSheet.absoluteFill} 
            />
          )}
        />
      )}
    </View>
  );
};

// ── الدالة الناقصة: المسؤولة عن تجميع شاشات الفيديوهات ──
  const renderVideos = () => (
    <Animated.View entering={FadeInRight.duration(400)} style={styles.tabPage}>
      <View style={styles.videosTopRow}>
        <View style={styles.videosTopDot} />
        <Text style={styles.videosTopTitle}>المحاضرات</Text>
      </View>
      {accessLocked ? renderAccessLocked() : (
        <>
          {videoScreen === 'subjects' && renderSubjectsList()}
          {videoScreen === 'chapters' && renderChaptersList()}
          {videoScreen === 'lessons'  && renderLessonsList()}
        </>
      )}
    </Animated.View>
  );

  const renderCodeTab = () => (
    <Animated.View entering={FadeInRight.duration(400).springify()} style={styles.tabPage}>
      <Text style={styles.sectionTitle}>تسجيل كود المعلم</Text>
      <View style={styles.infoCard}>
        {accessLocked && (
          <View style={styles.inlineWarning}>
            <FontAwesome5 name="exclamation-triangle" size={14} color={COLORS.danger} />
            <Text style={styles.inlineWarningText}>الحساب غير مفعل حالياً وسيتم فتح المحتوى فور إدخال كود صحيح.</Text>
          </View>
        )}
        <Text style={styles.infoHint}>
          أدخل الكود الصحيح وسيتم فتح محتوى هذه الفرقة فوراً. لو استخدمت أكثر من كود هتلاقي المحتوى مقسم حسب الفرقة في صفحة الفيديوهات والملازم.
        </Text>
        <TextInput
          style={styles.codeInput}
          placeholder="اكتب الكود هنا"
          placeholderTextColor={COLORS.subText}
          autoCapitalize="characters"
          value={teacherCode}
          onChangeText={setTeacherCode}
        />
        <AnimatedPressable onPress={submitTeacherCode} disabled={submittingCode}>
          <LinearGradient colors={[COLORS.accent, COLORS.accentAlt]} style={styles.primaryButton}>
            {submittingCode ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>تفعيل الكود</Text>}
          </LinearGradient>
        </AnimatedPressable>
      </View>
    </Animated.View>
  );

  const renderMaterials = () => (
    <Animated.View entering={FadeInRight.duration(400)} style={styles.tabPage}>
      <Text style={styles.sectionTitle}>الملازم والملفات</Text>
      {accessLocked ? (
        renderAccessLocked()
      ) : lessonsByAccessYear.some((section) => section.lessons.some((lesson) => lesson.pdfUrl)) ? (
        lessonsByAccessYear.map((section, sectionIndex) => {
          const materials = section.lessons.filter((lesson) => lesson.pdfUrl);
          if (!materials.length) return null;
          return (
            <View key={section.yearKey} style={{ marginBottom: 18 }}>
              <View style={[styles.chapterBanner, { paddingVertical: 12 }]}>
                <View style={styles.chapterBannerIcon}>
                  <FontAwesome5 name="file-pdf" size={16} color={COLORS.accentOrange} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.chapterBannerTitle}>{section.accessYear}</Text>
                  <Text style={styles.chapterBannerSub}>{materials.length} ملف</Text>
                </View>
              </View>

              {materials.map((lesson, index) => (
                <Animated.View key={lesson.id} entering={FadeInUp.delay((sectionIndex * 100 + index) * 20).springify()}>
                  <AnimatedPressable style={styles.materialCard} onPress={() => openExternalLink(lesson.pdfUrl)}>
                    <View style={styles.materialIcon}>
                      <FontAwesome5 name="file-pdf" size={20} color={COLORS.accentOrange} />
                    </View>
                    <View style={styles.lessonTextWrap}>
                      <Text style={styles.lessonTitle} numberOfLines={2}>{lesson.title}</Text>
                      {!!lesson.description && <Text style={styles.lessonDescription} numberOfLines={3}>{lesson.description}</Text>}
                      <Text style={styles.lessonMeta}>
                        {lesson.subject || 'عام'} • {lesson.pdfUrl.includes('drive.google.com') ? 'Google Drive PDF' : 'PDF'}
                      </Text>
                    </View>
                    <FontAwesome5 name="external-link-alt" size={14} color={COLORS.subText} />
                  </AnimatedPressable>
                </Animated.View>
              ))}
            </View>
          );
        })
      ) : (
        <View style={styles.placeholderCard}>
          <FontAwesome5 name="file-pdf" size={28} color={COLORS.accentOrange} />
          <Text style={styles.placeholderText}>لم يتم إضافة ملازم لهذه المحتويات بعد.</Text>
        </View>
      )}
    </Animated.View>
  );

  const renderSupport = () => (
    <Animated.View entering={FadeInRight.duration(400).springify()} style={styles.tabPage}>
      <Text style={styles.sectionTitle}>الدعم الفني</Text>
      <View style={styles.supportGrid}>
        <AnimatedPressable style={styles.supportCard} onPress={() => navigation.navigate('Support')}>
          <FontAwesome5 name="headset" size={24} color={COLORS.accent} />
          <Text style={styles.supportCardTitle}>تواصل الآن</Text>
          <Text style={styles.supportCardText}>افتح صفحة الدعم الفني والتواصل المباشر.</Text>
        </AnimatedPressable>

        <AnimatedPressable style={styles.supportCard}>
          <FontAwesome5 name="bell" size={22} color={COLORS.accentBlue} />
          <Text style={styles.supportCardTitle}>الإشعارات</Text>
          <Text style={styles.supportCardText}>
            {expoPushToken ? 'الإشعارات مفعلة على هذا الجهاز.' : 'الإشعارات غير مفعلة حالياً.'}
          </Text>
        </AnimatedPressable>
      </View>
    </Animated.View>
  );

  const renderProfile = () => (
    <Animated.View entering={FadeInRight.duration(400).springify()} style={styles.tabPage}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <FontAwesome5 name="user" size={28} color="#fff" />
        </View>
        <View style={styles.profileHeaderText}>
          <Text style={styles.profileName}>{currentStudent?.name}</Text>
          <Text style={styles.profileEmail}>{currentStudent?.email || currentStudent?.username}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>المعلومات الشخصية</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoValue}>{currentStudent?.name || '-'}</Text>
          <Text style={styles.infoLabel}>الاسم بالكامل</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowBorder]}>
          <Text style={styles.infoValue}>{currentStudent?.email || '-'}</Text>
          <Text style={styles.infoLabel}>البريد الإلكتروني</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowBorder]}>
          <Text style={styles.infoValue}>{currentStudent?.phone || '-'}</Text>
          <Text style={styles.infoLabel}>رقم الهاتف</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowBorder]}>
          <Text style={styles.infoValue}>{currentStudent?.year || '-'}</Text>
          <Text style={styles.infoLabel}>الصف الدراسي</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowBorder]}>
          <Text style={styles.infoValue}>{accessYears.length ? accessYears.join(' • ') : '-'}</Text>
          <Text style={styles.infoLabel}>محتوى الكود الحالي</Text>
        </View>
      </View>

      <AnimatedPressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
        <FontAwesome5 name="sign-out-alt" size={16} color="#fff" />
      </AnimatedPressable>
    </Animated.View>
  );

  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={{ color: COLORS.subText, marginTop: 12 }}>جاري تحميل بيانات الطالب...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchLessons} tintColor={COLORS.accent} />}
        contentContainerStyle={styles.screenContent}
      >
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <ThemeToggleButton mode={themeMode} onPress={toggleTheme} theme={theme} />
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => setActiveTab('support')} style={styles.headerIconButton}>
                <FontAwesome5 name="headset" size={15} color={COLORS.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogout} style={styles.headerIconButton}>
                <FontAwesome5 name="power-off" size={15} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          </View>

          <Animated.View style={headerAnimatedStyle}>
            <LinearGradient colors={[COLORS.accent, COLORS.accentAlt]} style={styles.mainHero}>
              <View style={styles.logoBox}>
                <Image source={require('../icon.png')} style={styles.logoImage} />
              </View>
              {/* <View style={styles.heroText}>
                <Text style={styles.heroWelcome}>مرحباً</Text>
                <Text style={styles.heroTitle}>في منصة الحديدي</Text>
              </View> */}
            </LinearGradient>
          </Animated.View>
        </View>

        {activeTab === 'home' && renderHome()}
        {activeTab === 'videos' && renderVideos()}
        {activeTab === 'codes' && renderCodeTab()}
        {activeTab === 'materials' && renderMaterials()}
        {activeTab === 'support' && renderSupport()}
        {activeTab === 'profile' && renderProfile()}
      </Animated.ScrollView>

      {motivationMsg && (
        <Animated.View entering={SlideInDown.duration(450).springify()} style={styles.motivationToast}>
          <Text style={styles.motivationEmoji}>{motivationMsg.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.motivationTitle}>{motivationMsg.title}</Text>
            <Text style={styles.motivationMsg}>{motivationMsg.msg}</Text>
          </View>
          <TouchableOpacity onPress={() => setMotivationMsg(null)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
            <FontAwesome5 name="times" size={13} color={COLORS.subText} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ===== مشغل الفيديو المتطور والآمن ===== */}
      <Modal
        visible={Boolean(selectedVideo)}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeVideoPlayer}
      >
        <StatusBar hidden={isVideoFullscreen} />
        <View style={[styles.videoModal, isVideoFullscreen && styles.videoModalFullscreen]}>

          {/* ── Header: يظهر/يختفي بالضغط ── */}
          {!isVideoFullscreen && (
            <SafeAreaView edges={['top']} style={{ backgroundColor: COLORS.card }}>
              <LinearGradient colors={[COLORS.card, COLORS.bg]} style={styles.videoModalHeader}>
                <TouchableOpacity onPress={closeVideoPlayer} style={styles.videoCloseBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <FontAwesome5 name="arrow-right" size={15} color={COLORS.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'flex-end', marginHorizontal: 10 }}>
                  <Text style={styles.videoModalTitle} numberOfLines={1}>{selectedVideo?.title || 'الفيديو'}</Text>
                  {!!selectedVideo?.subject && (
                    <Text style={{ color: COLORS.subText, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 2 }}>
                      {selectedVideo.subject}
                    </Text>
                  )}
                </View>
                <View style={styles.videoSecureBadge}>
                  <FontAwesome5 name="shield-alt" size={11} color={COLORS.success} />
                  <Text style={styles.videoSecureBadgeText}>محمي</Text>
                </View>
              </LinearGradient>
            </SafeAreaView>
          )}

          {/* ── منطقة المشغل + Overlay أزرار التحكم ── */}
          <Pressable style={styles.videoPlayerArea} onPress={handleVideoAreaPress}>

            {/* المشغل الفعلي */}
           // غيرها لتكون:
{selectedVideo?.url && needsEmbeddedWebPlayer(selectedVideo.url) ? (
  <WebView
                key={`web-${webPlayerKey}`}
                source={{ uri: getInAppVideoUrl(selectedVideo.url) }}
                style={styles.webVideo}
                allowsFullscreenVideo
                javaScriptEnabled
                domStorageEnabled
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                originWhitelist={[
                  'https://www.youtube-nocookie.com',
                  'https://youtube.com',
                  'https://*.youtube.com',
                  'https://drive.google.com',
                  'https://*.googleapis.com',
                  'https://*.googleusercontent.com',
                ]}
                onShouldStartLoadWithRequest={shouldKeepVideoInsideApp}
                setSupportMultipleWindows={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
                mixedContentMode="never"
                onLoadStart={() => {
                  setWebPlayerLoading(true);
                  setWebPlayerError('');
                }}
                onLoadEnd={() => {
                  setWebPlayerLoading(false);
                }}
                onError={() => {
                  setWebPlayerLoading(false);
                  setWebPlayerError('تعذر تحميل الفيديو داخل التطبيق.');
                }}
                onHttpError={() => {
                  setWebPlayerLoading(false);
                  setWebPlayerError('تعذر تحميل الفيديو داخل التطبيق.');
                }}
                injectedJavaScript={`
                  (function() {
                    document.addEventListener('contextmenu', function(e) { e.preventDefault(); }, true);
                    document.addEventListener('selectstart', function(e) { e.preventDefault(); }, true);
                    document.addEventListener('copy', function(e) { e.preventDefault(); }, true);
                    window.open = function() { return null; };
                  })();
                  true;
                `}
                onNavigationStateChange={(navState) => {
                  if (navState?.url && !isAllowedVideoDomain(navState.url)) {
                    closeVideoPlayer();
                  }
                }}
              />
            ) : selectedVideo?.url && !needsEmbeddedWebPlayer(selectedVideo.url) ? (
              <Video
                source={{ uri: selectedVideo.url }}
                style={styles.nativeVideo}
                useNativeControls
                resizeMode="contain"
                shouldPlay
                ref={nativeVideoRef}
                onPlaybackStatusUpdate={(status) => {
                  if (!status || !status.isLoaded) {
                    setNativeBuffering(false);
                    return;
                  }
                  setNativeBuffering(Boolean(status.isBuffering));
                }}
              />
            ) : (
              <View style={styles.webFallback}>
                <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: `${COLORS.danger}14`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <FontAwesome5 name="exclamation-triangle" size={26} color={COLORS.danger} />
                </View>
                <Text style={styles.webFallbackTitle}>مشغل الفيديو غير جاهز</Text>
                <Text style={styles.webFallbackText}>اقفل التطبيق وافتحه مرة أخرى بعد تحديث الحزمة.</Text>
              </View>
            )}

            {selectedVideo?.url && needsEmbeddedWebPlayer(selectedVideo.url) && Boolean(webPlayerError) && (
              <View style={styles.playerErrorOverlay}>
                <View style={styles.playerErrorCard}>
                  <FontAwesome5 name="exclamation-circle" size={18} color={COLORS.danger} />
                  <Text style={styles.playerErrorTitle}>{webPlayerError}</Text>
                  <View style={styles.playerErrorActions}>
                    <TouchableOpacity
                      style={[styles.playerActionBtn, { borderColor: COLORS.accent }]}
                      onPress={() => {
                        setWebPlayerError('');
                        setWebPlayerLoading(true);
                        setWebPlayerKey((value) => value + 1);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.playerActionText, { color: COLORS.accent }]}>إعادة المحاولة</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.playerActionBtn, { borderColor: COLORS.subText }]}
                      onPress={() => openExternalLink(selectedVideo.url)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.playerActionText, { color: COLORS.subText }]}>فتح خارجي</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {(webPlayerLoading || nativeBuffering) && (
              <View style={styles.playerLoadingOverlay} pointerEvents="none">
                <ActivityIndicator color="#fff" />
                <Text style={styles.playerLoadingText}>جاري التحميل...</Text>
              </View>
            )}

            {/* ── Overlay أزرار التحكم (يظهر/يختفي) ── */}
            {showVideoControls && (
              <View style={styles.videoControlsOverlay} pointerEvents="box-none">
                {/* زر الإغلاق في fullscreen */}
                {isVideoFullscreen && (
                  <TouchableOpacity
                    style={styles.videoOverlayClose}
                    onPress={closeVideoPlayer}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <FontAwesome5 name="times" size={16} color="#fff" />
                  </TouchableOpacity>
                )}

                {/* زر Fullscreen في الزاوية السفلية اليمين */}
                <TouchableOpacity
                  style={styles.videoFullscreenBtn}
                  onPress={() => {
                    toggleVideoFullscreen();
                    startControlsTimer();
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <FontAwesome5
                    name={isVideoFullscreen ? 'compress' : 'expand'}
                    size={15}
                    color="#fff"
                  />
                </TouchableOpacity>
              </View>
            )}
          </Pressable>

          {/* ── Info Panel: يُخفى في fullscreen ── */}
          {!isVideoFullscreen && selectedVideo && (
            <View style={[styles.videoInfoPanel, { backgroundColor: COLORS.card }]}>
              <View style={styles.videoInfoRow}>
                <View style={styles.videoInfoIconBox}>
                  <FontAwesome5 name="play-circle" size={20} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.videoInfoTitle} numberOfLines={2}>{selectedVideo.title}</Text>
                  {!!selectedVideo.description && (
                    <Text style={styles.videoInfoDesc} numberOfLines={3}>{selectedVideo.description}</Text>
                  )}
                </View>
              </View>
              <View style={styles.videoInfoDivider} />
              <View style={styles.videoInfoMeta}>
                <View style={styles.videoInfoMetaChip}>
                  <FontAwesome5 name="shield-alt" size={10} color={COLORS.success} />
                  <Text style={[styles.videoInfoMetaText, { color: COLORS.success }]}>محتوى محمي</Text>
                </View>
                {!!selectedVideo.subject && (
                  <View style={styles.videoInfoMetaChip}>
                    <FontAwesome5 name="book" size={10} color={COLORS.accentBlue} />
                    <Text style={[styles.videoInfoMetaText, { color: COLORS.accentBlue }]}>{selectedVideo.subject}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>

      <View style={styles.bottomBar}>
        {[
          { id: 'home', icon: 'home', label: 'الرئيسية' },
          { id: 'videos', icon: 'play-circle', label: 'الفيديوهات' },
          { id: 'codes', icon: 'qrcode', label: 'الكود' },
          { id: 'materials', icon: 'book', label: 'الملازم' },
          { id: 'profile', icon: 'user', label: 'حسابي' },
        ].map((tab) => (
          <TouchableOpacity key={tab.id} style={styles.bottomItem} onPress={() => {
            if (tab.id !== 'videos') setVideoScreen('subjects');
            setActiveTab(tab.id);
          }} activeOpacity={0.7}>
            <Animated.View style={activeTab === tab.id && { transform: [{ scale: 1.1 }] }}>
              <FontAwesome5 name={tab.icon} size={19} color={activeTab === tab.id ? COLORS.accent : COLORS.subText} />
            </Animated.View>
            <Text style={[styles.bottomLabel, { color: activeTab === tab.id ? COLORS.accent : COLORS.subText }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

export function createStyles(COLORS, layout = {}) {
  const {
    bottomInset = Platform.OS === 'ios' ? 22 : 12,
    horizontalPadding = 20,
    isCompact = false,
    isWide = false,
    quickCardWidth = '100%',
    supportCardWidth = '48%',
  } = layout;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    center: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
    screenContent: { paddingBottom: bottomInset + 92 },
    header: { paddingHorizontal: horizontalPadding, paddingTop: Platform.OS === 'android' ? 44 : 20, paddingBottom: 14 },
    headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    headerActions: { flexDirection: 'row', gap: 10 },
    headerIconButton: {
      width: isCompact ? 42 : 46,
      height: isCompact ? 42 : 46,
      backgroundColor: COLORS.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: COLORS.border,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    mainHero: {
      borderRadius: 24,
      padding: isCompact ? 16 : 20,
      flexDirection: 'row-reverse',
      alignItems: 'center',
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 8,
    },
    logoBox: {
      width: isCompact ? 58 : 68,
      height: isCompact ? 58 : 68,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.16)',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    logoImage: { width: '100%', height: '100%' },
    heroText: { flex: 1, alignItems: 'flex-end', marginRight: 12, minWidth: 0 },
    heroWelcome: { color: '#efe7ff', fontSize: 14, fontWeight: '700' },
    heroTitle: { color: '#fff', fontSize: isCompact ? 22 : 25, fontWeight: '900', marginTop: 6, textAlign: 'right' },
    section: { paddingHorizontal: horizontalPadding, marginBottom: 18 },
    sectionTitle: { color: COLORS.text, fontSize: isCompact ? 22 : 24, fontWeight: '900', textAlign: 'right', marginBottom: 12 },
    heroCard: { borderRadius: 20, overflow: 'hidden', padding: 16, flexDirection: 'row-reverse', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
    heroGradient: { padding: 22, flexDirection: 'row-reverse', alignItems: 'center' },
    heroIconBubble: {
      width: isCompact ? 46 : 52,
      height: isCompact ? 46 : 52,
      borderRadius: 18,
      backgroundColor: `${COLORS.accent}18`,
      borderWidth: 1,
      borderColor: `${COLORS.accent}44`,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 14,
    },
    heroTextWrap: { flex: 1, alignItems: 'flex-end', minWidth: 0 },
    heroCardTitle: { color: COLORS.text, fontSize: isCompact ? 18 : 22, fontWeight: '900', textAlign: 'right', lineHeight: isCompact ? 24 : 29, writingDirection: 'rtl' },
    heroCardSubtitle: { color: COLORS.subText, fontSize: 13, marginTop: 6, textAlign: 'right' },
    
    // --- تعديل قسم الكروت السريعة ---
    quickGrid: {
      flexDirection: 'row-reverse',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 12,
    },
    quickCardWrap: { 
      width: quickCardWidth,
      marginBottom: 0,
    },
    quickCard: { 
      borderRadius: 18,
      minHeight: isCompact ? 116 : 128,
      paddingVertical: isCompact ? 14 : 16,
      paddingHorizontal: 10,
      justifyContent: 'center',
      alignItems: 'center', 
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: COLORS.border,
      elevation: 5,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
    },
    quickIconBubble: {
      width: isCompact ? 44 : 50,
      height: isCompact ? 44 : 50,
      borderRadius: 15,
      backgroundColor: `${COLORS.accent}18`,
      borderWidth: 1,
      borderColor: `${COLORS.accent}44`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    quickCardText: { 
      color: COLORS.text,
      fontSize: isCompact ? 16 : 18,
      fontWeight: '900', 
      textAlign: 'center', 
      lineHeight: isCompact ? 22 : 25,
      writingDirection: 'rtl',
      includeFontPadding: false,
      maxWidth: '100%',
    },
    // ----------------------------

    tabPage: { paddingHorizontal: horizontalPadding, paddingBottom: 20 },
    chipsScroll: { flexDirection: 'row-reverse', paddingBottom: 12 },
    chip: {
      paddingHorizontal: isCompact ? 14 : 18,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
      marginLeft: 10,
    },
    activeChip: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
    chipText: { color: COLORS.subText, fontWeight: '800', fontSize: 14 },
    activeChipText: { color: '#fff' },
    videoSectionList: { marginTop: 4 },
    subjectSection: { marginBottom: 18 },
    subjectTitle: { color: COLORS.text, fontSize: 18, fontWeight: '900', textAlign: 'right', marginBottom: 10 },
    lessonCard: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: isCompact ? 12 : 14,
      marginBottom: 12,
      flexDirection: 'row-reverse',
      alignItems: 'center',
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 4,
    },
    lessonIcon: {
      width: isCompact ? 48 : 54,
      height: isCompact ? 48 : 54,
      borderRadius: 16,
      backgroundColor: COLORS.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lessonTextWrap: { flex: 1, alignItems: 'flex-end', marginHorizontal: 12, minWidth: 0 },
    lessonTitle: { color: COLORS.text, fontSize: isCompact ? 16 : 18, fontWeight: '900', textAlign: 'right' },
    lessonDescription: { color: COLORS.text, opacity: 0.84, fontSize: 13, marginTop: 6, lineHeight: 20, textAlign: 'right' },
    lessonMeta: { color: COLORS.subText, fontSize: 12, marginTop: 6, textAlign: 'right' },
    infoCard: {
      backgroundColor: COLORS.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: isCompact ? 14 : 18,
    },
    infoHint: { color: COLORS.subText, fontSize: 15, lineHeight: 24, textAlign: 'right', marginBottom: 18 },
    inlineWarning: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      backgroundColor: `${COLORS.danger}12`,
      borderRadius: 16,
      padding: 12,
      marginBottom: 16,
      gap: 8,
    },
    inlineWarningText: { color: COLORS.danger, fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' },
    codeInput: {
      backgroundColor: COLORS.cardAlt,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 15,
      color: COLORS.text,
      textAlign: 'right',
      marginBottom: 16,
      fontSize: 17,
      fontWeight: '700',
    },
    primaryButton: {
      borderRadius: 20,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 58,
    },
    primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '900' },
    placeholderCard: {
      backgroundColor: COLORS.card,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: 24,
      alignItems: 'center',
    },
    placeholderText: { color: COLORS.subText, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 24 },
    lockedCard: {
      backgroundColor: COLORS.card,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: 22,
      alignItems: 'center',
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 5,
    },
    lockedIcon: {
      width: 58,
      height: 58,
      borderRadius: 20,
      backgroundColor: `${COLORS.danger}14`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    lockedTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', marginBottom: 10, textAlign: 'center' },
    lockedText: { color: COLORS.subText, fontSize: 15, lineHeight: 24, textAlign: 'center', marginBottom: 16 },
    statusCard: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: isCompact ? 14 : 18,
      flexDirection: 'row-reverse',
      alignItems: 'center',
    },
    statusBadge: {
      width: isCompact ? 48 : 54,
      height: isCompact ? 48 : 54,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 14,
    },
    statusTextWrap: { flex: 1, alignItems: 'flex-end' },
    statusTitle: { color: COLORS.text, fontSize: 18, fontWeight: '900', textAlign: 'right' },
    statusText: { color: COLORS.subText, fontSize: 14, marginTop: 6, lineHeight: 22, textAlign: 'right' },
    materialCard: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: isCompact ? 13 : 16,
      marginBottom: 12,
      flexDirection: 'row-reverse',
      alignItems: 'center',
    },
    materialIcon: {
      width: 50,
      height: 50,
      borderRadius: 16,
      backgroundColor: COLORS.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    supportGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', gap: supportCardWidth === '100%' ? 12 : 0 },
    supportCard: {
      width: supportCardWidth,
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 20,
      padding: isCompact ? 14 : 18,
      marginBottom: 12,
      minHeight: supportCardWidth === '100%' ? 128 : 154,
      aspectRatio: supportCardWidth === '100%' ? undefined : 0.92,
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    supportCardTitle: { color: COLORS.text, fontSize: isCompact ? 16 : 17, fontWeight: '900', marginTop: 12, textAlign: 'right' },
    supportCardText: { color: COLORS.subText, fontSize: 13, lineHeight: 20, textAlign: 'right' },
    profileHeader: {
      borderRadius: 22,
      padding: isCompact ? 14 : 18,
      backgroundColor: COLORS.accent,
      flexDirection: 'row-reverse',
      alignItems: 'center',
      marginBottom: 18,
    },
    avatarCircle: {
      width: 64,
      height: 64,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 14,
    },
    profileHeaderText: { flex: 1, alignItems: 'flex-end' },
    profileName: { color: '#fff', fontSize: isCompact ? 20 : 23, fontWeight: '900', textAlign: 'right' },
    profileEmail: { color: '#f1eaff', fontSize: 15, marginTop: 6, textAlign: 'right' },
    infoRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    infoRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
    infoLabel: { color: COLORS.subText, fontSize: 14, fontWeight: '700' },
    infoValue: { color: COLORS.text, fontSize: 16, fontWeight: '900', maxWidth: '60%', textAlign: 'right' },
    logoutButton: {
      marginTop: 16,
      borderRadius: 20,
      backgroundColor: COLORS.danger,
      paddingVertical: 16,
      paddingHorizontal: 18,
      flexDirection: 'row-reverse',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
    },
    logoutText: { color: '#fff', fontSize: 15, fontWeight: '900' },
    bottomBar: {
      position: 'absolute',
      bottom: bottomInset,
      left: isCompact ? 10 : 16,
      right: isCompact ? 10 : 16,
      backgroundColor: COLORS.bottomBar,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: COLORS.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: isCompact ? 6 : 10,
      paddingVertical: 8,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.16,
      shadowRadius: 20,
      elevation: 10,
      zIndex: 100,
    },
    bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: isCompact ? 50 : 54 },
    bottomLabel: { marginTop: 4, fontSize: isCompact ? 11 : 12, fontWeight: '800' },
    // ===== 3-Screen Navigation Styles =====
    videosTopRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 16 },
    videosTopDot: { width: 4, height: 20, borderRadius: 2, backgroundColor: COLORS.accent },
    videosTopTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900' },

    screenHeader: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 12,
      backgroundColor: COLORS.card,
      borderRadius: 18,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    screenHeaderIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: `${COLORS.accent}18`,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: `${COLORS.accent}30`,
    },
    screenHeaderTitle: { color: COLORS.text, fontSize: 19, fontWeight: '900', textAlign: 'right' },
    screenHeaderSub: { color: COLORS.subText, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 2 },

    backBtn: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-end',
      marginBottom: 12,
      backgroundColor: `${COLORS.accent}12`,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: `${COLORS.accent}30`,
    },
    backBtnText: { color: COLORS.accent, fontSize: 13, fontWeight: '900' },

    rowCard: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      backgroundColor: COLORS.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: COLORS.border,
      gap: 12,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.07,
      shadowRadius: 10,
      elevation: 3,
    },
    rowCardIcon: {
      width: 48, height: 48, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, flexShrink: 0,
    },
    rowCardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900', textAlign: 'right' },
    rowCardMeta: { color: COLORS.subText, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 3 },

    notesBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: `${COLORS.subText}18`, borderRadius: 8,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    notesBadgeText: { color: COLORS.subText, fontSize: 10, fontWeight: '700' },

    chapterBanner: {
      flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12,
      backgroundColor: `${COLORS.accent}10`, borderRadius: 18, padding: 14,
      marginBottom: 14, borderWidth: 1, borderColor: `${COLORS.accent}28`,
    },
    chapterBannerIcon: {
      width: 44, height: 44, borderRadius: 13,
      backgroundColor: `${COLORS.accent}20`,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: `${COLORS.accent}35`, flexShrink: 0,
    },
    chapterBannerTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900', textAlign: 'right' },
    chapterBannerSub: { color: COLORS.subText, fontSize: 12, fontWeight: '700', marginTop: 2, textAlign: 'right' },
    chapterBannerNotes: {
      flexDirection: 'row-reverse', alignItems: 'flex-start',
      backgroundColor: `${COLORS.accent}0E`, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 7, marginTop: 8, gap: 5,
    },
    chapterBannerNotesText: { color: COLORS.subText, fontSize: 12, lineHeight: 18, flex: 1, textAlign: 'right' },

    lessonRowCard: {
      flexDirection: 'row-reverse', alignItems: 'center',
      backgroundColor: COLORS.card, borderRadius: 18,
      padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, gap: 12,
      shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
    },
    lessonRowPlay: { width: 46, height: 46, borderRadius: 14, overflow: 'hidden', flexShrink: 0 },
    lessonRowPlayGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    lessonRowInfo: { flex: 1, alignItems: 'flex-end', gap: 4 },
    lessonRowTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900', textAlign: 'right', lineHeight: 22 },
    lessonRowDesc: { color: COLORS.subText, fontSize: 12, textAlign: 'right', lineHeight: 17 },
    lessonRowBadges: { flexDirection: 'row-reverse', gap: 6, marginTop: 2 },
    lessonRowBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: `${COLORS.accent}18`, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.accent}30`,
    },
    lessonRowBadgeText: { color: COLORS.accent, fontSize: 10, fontWeight: '800' },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50 },
    emptyStateText: { color: COLORS.subText, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 12, opacity: 0.7 },

    // Motivation Toast
    motivationToast: {
      position: 'absolute', bottom: 90, left: 16, right: 16, zIndex: 999,
      flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
      backgroundColor: COLORS.card, borderRadius: 20, padding: 16,
      borderWidth: 1, borderColor: `${COLORS.accent}40`,
      shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22, shadowRadius: 16, elevation: 10,
    },
    motivationEmoji: { fontSize: 30 },
    motivationTitle: { color: COLORS.text, fontSize: 15, fontWeight: '900', textAlign: 'right' },
    motivationMsg: { color: COLORS.subText, fontSize: 12, lineHeight: 18, textAlign: 'right', marginTop: 2 },

    videoModal: { flex: 1, backgroundColor: COLORS.bg },
    videoModalHeader: {
      minHeight: 64,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    videoModalTitle: { color: COLORS.text, fontSize: 15, fontWeight: '900', textAlign: 'right' },
    videoCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: COLORS.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    videoSecureBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${COLORS.success}18`,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 5,
      gap: 4,
      borderWidth: 1,
      borderColor: `${COLORS.success}30`,
    },
    videoSecureBadgeText: { color: COLORS.success, fontSize: 11, fontWeight: '800' },
    videoPlayerArea: { flex: 1, backgroundColor: '#000' },
    webVideo: { flex: 1, backgroundColor: '#000' },
    nativeVideo: { flex: 1, backgroundColor: '#000' },
    webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: COLORS.bg },
    webFallbackTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
    webFallbackText: { color: COLORS.subText, fontSize: 14, lineHeight: 24, textAlign: 'center' },
    videoInfoPanel: {
      backgroundColor: COLORS.card,
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: Platform.OS === 'ios' ? 10 : 14,
    },
    videoInfoRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
    videoInfoIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: `${COLORS.accent}14`,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: `${COLORS.accent}30`,
    },
    videoInfoTitle: { color: COLORS.text, fontSize: 15, fontWeight: '900', textAlign: 'right', lineHeight: 22 },
    videoInfoDesc: { color: COLORS.subText, fontSize: 13, marginTop: 4, lineHeight: 20, textAlign: 'right' },
    videoInfoDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 10 },
    videoInfoMeta: { flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
    videoInfoMetaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: COLORS.cardAlt,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    videoInfoMetaText: { fontSize: 12, fontWeight: '800' },

    // ===== Chapters Styles (Student) =====
    chapterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      marginLeft: 8,
      borderWidth: 1.5,
      borderColor: COLORS.accent,
      backgroundColor: 'transparent',
      gap: 6,
    },
    chapterChipActive: {
      backgroundColor: COLORS.accent,
    },
    chapterChipText: {
      color: COLORS.accent,
      fontSize: 18,
      fontWeight: '900',
    },
    chapterChipTextActive: {
      color: COLORS.bg,
    },
    chapterChipBadge: {
      backgroundColor: `${COLORS.accent}30`,
      borderRadius: 99,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    chapterChipBadgeText: {
      color: COLORS.accent,
      fontSize: 15,
      fontWeight: '900',
    },
    chapterHeaderBanner: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 8,
      backgroundColor: `${COLORS.accent}14`,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: `${COLORS.accent}30`,
    },
    chapterHeaderText: {
      flex: 1,
      color: COLORS.text,
      fontWeight: '900',
      fontSize:20,
      textAlign: 'right',
    },
    chapterHeaderCount: {
      color: COLORS.subText,
      fontSize: 12,
      fontWeight: '700',
    },
    emptyChapter: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    chapterNotesBox: {
      flexDirection: 'row-reverse',
      alignItems: 'flex-start',
      backgroundColor: `${COLORS.subText}14`,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginTop: 6,
      width: '100%',
    },
    chapterNotesText: {
      color: COLORS.subText,
      fontSize: 14,
      lineHeight: 18,
      flex: 1,
      textAlign: 'right',
    },
    lessonChapterTag: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 4,
      marginBottom: 4,
    },
    lessonChapterTagText: {
      color: COLORS.accent,
      fontSize: 13,
      fontWeight: '800',
    },

    // ── Fullscreen & Controls Overlay ──
    videoModalFullscreen: {
      flex: 1,
      backgroundColor: '#000',
    },
    playerLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.25)',
      gap: 10,
      padding: 18,
    },
    playerLoadingText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    playerErrorOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    },
    playerErrorCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: COLORS.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: 16,
      alignItems: 'center',
      gap: 10,
    },
    playerErrorTitle: { color: COLORS.text, fontSize: 15, fontWeight: '900', textAlign: 'center' },
    playerErrorActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
    playerActionBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: COLORS.cardAlt,
      minWidth: 120,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playerActionText: { fontSize: 13, fontWeight: '900' },
    videoControlsOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      alignItems: 'flex-end',
      padding: 12,
    },
    videoFullscreenBtn: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    videoOverlayClose: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    videoWrapper: {
  width: '100%',
  aspectRatio: 16 / 9,
  backgroundColor: '#000',
  borderRadius: 12,
  overflow: 'hidden',
  elevation: 5,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
},
webView: {
  flex: 1,
  backgroundColor: '#000',
},
  });
}
