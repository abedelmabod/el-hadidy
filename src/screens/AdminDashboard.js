import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, 
  FlatList, Alert, ActivityIndicator, Dimensions, Platform, SafeAreaView,
  Image, Linking, useWindowDimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { FontAwesome5 } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import ThemeToggleButton from '../components/ThemeToggleButton';

// استدعاء Firebase
import { db, auth } from '../firebase'; 
import { 
  collection, addDoc, doc, updateDoc, deleteDoc, 
  writeBatch, onSnapshot, query, orderBy, serverTimestamp, getDoc, getDocs, where 
} from "firebase/firestore";

const { width } = Dimensions.get('window');

export default function AdminDashboard({ setUser, navigation, theme, themeMode, toggleTheme }) {
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 980;
  const COLORS = {
    bg: theme.bg,
    card: theme.card,
    cardAlt: theme.cardAlt,
    gold: theme.accent,
    goldDark: theme.accentAlt,
    red: theme.danger,
    green: theme.success,
    text: theme.text,
    subText: theme.subText,
    border: theme.border,
    blue: theme.info,
  };
  const styles = createStyles(COLORS);
  const [activeTab, setActiveTab] = useState('stats');
  const [isUploading, setIsUploading] = useState({ video: false, pdf: false });
  const [searchTerm, setSearchTerm] = useState('');
  const [playingVideoId, setPlayingVideoId] = useState(null);
  const [isLoading, setIsLoading] = useState(true); 
  
  // Data States
  const [studentsDB, setStudentsDB] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [codesDB, setCodesDB] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [logsDB, setLogsDB] = useState([]);
  const [codeRequests, setCodeRequests] = useState([]);
  
  // Form States
  const emptyLesson = {
    title: '',
    description: '',
    url: '',
    pdfUrl: '',
    subject: '',
    subjectId: '',
    chapterId: '',
    chapterName: '',
    year: 'الفرقة الأولى',
    semester: 'الأول',
    videoKind: 'direct',
    isActive: true,
  };
  const [newLesson, setNewLesson] = useState(emptyLesson);
  const [newSubject, setNewSubject] = useState("");
  const [codeQty, setCodeQty] = useState("1");

  // ===== Chapters System =====
  const [chapters, setChapters] = useState({});           // { subjectId: [chapters] }
  const [expandedSubject, setExpandedSubject] = useState(null);
  const [editingChapter, setEditingChapter] = useState(null);
  const [newChapter, setNewChapter] = useState({ name: '', year: 'الفرقة الأولى', notes: '' });
  const [chapterContentTab, setChapterContentTab] = useState({}); // { chapterId: 'videos'|'notes' }
  const [selectedYear, setSelectedYear] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState('all');

  const isFirstLoad = useRef(true);

  const BUNNY_CONFIG = {
    storageName: 'el-hadidy-files', 
    accessKey: 'a9869cf5-e131-4930-8b9e87e4901f-b514-4817', 
    regionEndpoint: 'uk.storage.bunnycdn.com', 
    pullZoneUrl: 'https://elhadidy-streaming.b-cdn.net'
  };

  // --- دالة معالجة النصوص ---
  const normalizeText = (text) => {
    if (!text) return "";
    return text
      .replace(/[أإآ]/g, 'ا') 
      .replace(/ة/g, 'ه')     
      .replace(/\s+/g, ' ')
      .trim();
  };

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

  // --- Real-time Listeners ---
  useEffect(() => {
    const unsubStudents = onSnapshot(collection(db, "students"), (s) => {
        setStudentsDB(s.docs.map(d => ({ id: d.id, ...d.data() })));
        setIsLoading(false); 
    });

    const unsubLessons = onSnapshot(query(collection(db, "lessons"), orderBy("createdAt", "desc")), (s) => 
        setLessons(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    
    const unsubCodes = onSnapshot(collection(db, "codes"), (s) => 
        setCodesDB(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    
    const unsubSubs = onSnapshot(collection(db, "subjects"), (s) => 
        setSubjects(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    
    const unsubLogs = onSnapshot(query(collection(db, "logs"), orderBy("time", "desc")), (snapshot) => {
        setLogsDB(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        
        if (!isFirstLoad.current) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const logData = change.doc.data();
                    if (logData.action && logData.action.includes('تصوير')) {
                        Alert.alert(
                            "🚨 تنبيه أمني عاجل!", 
                            `الطالب "${logData.studentName}" يحاول التقاط شاشة للمحتوى الآن!`
                        );
                    }
                }
            });
        } else {
            setTimeout(() => { isFirstLoad.current = false; }, 2000);
        }
    });

    const unsubCodeRequests = onSnapshot(query(collection(db, "teacher_code_requests"), orderBy("createdAt", "desc")), (snapshot) => {
        setCodeRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Chapters listener - يراقب sub-collections الخاصة بكل مادة
    const unsubChapters = onSnapshot(collection(db, "chapters"), (s) => {
      const grouped = {};
      s.docs.forEach(d => {
        const data = { id: d.id, ...d.data() };
        if (!grouped[data.subjectId]) grouped[data.subjectId] = [];
        grouped[data.subjectId].push(data);
      });
      // ترتيب حسب order
      Object.keys(grouped).forEach(k => {
        grouped[k].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      });
      setChapters(grouped);
    });

    return () => { unsubStudents(); unsubLessons(); unsubCodes(); unsubSubs(); unsubLogs(); unsubCodeRequests(); unsubChapters(); };
  }, []);

  // --- Functions ---
  const confirmAction = (title, text, action, isDanger = false) => {
    Alert.alert(title, text, [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", style: isDanger ? "destructive" : "default", onPress: action }
    ]);
  };

  const handleLogout = () => {
  // دالة الخروج الفعلية التي سيتم استدعاؤها بعد التأكيد
  const performLogout = async () => {
    try {
      // تأكد أن auth معرفة لديك (Firebase Auth)
      if (typeof auth !== 'undefined' && auth.signOut) {
        await auth.signOut();
      }
      // تحديث الحالة لتوجيه المستخدم لصفحة تسجيل الدخول
      if (setUser) {
        setUser(null);
      }
    } catch (error) {
      console.error("Logout Error:", error);
      if (Platform.OS === 'web') {
        alert("حدث مشكلة أثناء تسجيل الخروج");
      } else {
        Alert.alert("خطأ", "حدث مشكلة أثناء تسجيل الخروج");
      }
    }
  };

  // التحقق من نوع الجهاز
  if (Platform.OS === 'web') {
    // استخدام نافذة التأكيد الخاصة بالمتصفح
    const confirmed = window.confirm("هل أنت متأكد أنك تريد الخروج؟");
    if (confirmed) {
      performLogout();
    }
  } else {
    // استخدام نافذة التنبيه الخاصة بالموبايل (Android/iOS)
    Alert.alert("تسجيل الخروج", "هل أنت متأكد أنك تريد الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      { 
        text: "تأكيد", 
        style: "destructive",
        onPress: performLogout 
      }
    ]);
  }
};

  // ===== دوال إدارة الشابترات =====
  const handleAddChapter = async (subjectId, subjectName) => {
    const name = newChapter.name.trim();
    if (!name) return Alert.alert('تنبيه', 'أدخل اسم الشابتر');
    const subjectChapters = chapters[subjectId] || [];
    await addDoc(collection(db, "chapters"), {
      name,
      subjectId,
      subjectName: subjectName || '',
      year: newChapter.year,
      notes: newChapter.notes.trim(),
      order: subjectChapters.length,
      createdAt: serverTimestamp(),
    });
    setNewChapter({ name: '', year: 'الفرقة الأولى', notes: '' });
  };

  const handleDeleteChapter = (chapterId) => {
    confirmAction('حذف الشابتر؟', 'سيتم حذف الشابتر وكل دروسه مع بعض.', async () => {
      // حذف الدروس المرتبطة بالشابتر
      const lessonsSnap = await getDocs(query(collection(db, "lessons"), where("chapterId", "==", chapterId)));
      const batch = writeBatch(db);
      lessonsSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, "chapters", chapterId));
      await batch.commit();
    }, true);
  };

  const handleRenameChapter = async () => {
    if (!editingChapter || !editingChapter.name.trim()) return;
    await updateDoc(doc(db, "chapters", editingChapter.id), {
      name: editingChapter.name.trim(),
      year: editingChapter.year || 'الفرقة الأولى',
      notes: editingChapter.notes || '',
    });
    setEditingChapter(null);
  };

  const handleMoveChapter = async (subjectId, chapterId, direction) => {
    const list = [...(chapters[subjectId] || [])];
    const idx = list.findIndex(c => c.id === chapterId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "chapters", list[idx].id), { order: swapIdx });
    batch.update(doc(db, "chapters", list[swapIdx].id), { order: idx });
    await batch.commit();
  };

  const handleAddSubject = async () => {
    if (!newSubject.trim()) return;
    await addDoc(collection(db, "subjects"), { name: newSubject.trim() });
    setNewSubject("");
    Alert.alert("نجاح", "تم إضافة المادة");
  };

  const saveLesson = async () => {
    if (!newLesson.title || !newLesson.url || !newLesson.subject || !newLesson.year || !newLesson.semester) {
      return Alert.alert("تنبيه", "أكمل العنوان والرابط والفرقة والترم والمادة");
    }

    const urlValue = String(newLesson.url || '');
    const detectedVideoKind = /youtu\.be|youtube\.com/.test(urlValue)
      ? "youtube"
      : (/drive\.google\.com|docs\.google\.com/.test(urlValue) ? "google_drive" : newLesson.videoKind);
    
    await addDoc(collection(db, "lessons"), { 
      ...newLesson, 
      description: newLesson.description?.trim() || "",
      videoKind: detectedVideoKind,
      year: normalizeText(newLesson.year), 
      chapterId: newLesson.chapterId || "",
      chapterName: newLesson.chapterName || "",
      views: 0, 
      createdAt: serverTimestamp() 
    });
    
    setNewLesson(emptyLesson);
    Alert.alert("تم", "نُشرت المحاضرة بنجاح 🚀");
    setActiveTab('lessons');
  };

  const generateCodes = async () => {
    if (selectedYear === 'الكل') return Alert.alert("تنبيه", "اختر فرقة محددة أولاً");
    const qty = parseInt(codeQty);
    if (isNaN(qty) || qty <= 0) return Alert.alert("تنبيه", "أدخل كمية صحيحة");

    confirmAction("تأكيد", `توليد ${qty} كود (أرقام فقط) للفرقة ${selectedYear}؟`, async () => {
      const batch = writeBatch(db);
      
      for (let i = 0; i < qty; i++) {
        let codeStr = "";
        for (let j = 0; j < 8; j++) {
          codeStr += Math.floor(Math.random() * 10).toString();
        }

        const codeRef = doc(collection(db, "codes"));
        batch.set(codeRef, { 
          code: codeStr,
          year: selectedYear, 
          isUsed: false, 
          usedByName: "", 
          usedById: "", 
          createdAt: serverTimestamp() 
        });
      }
      
      await batch.commit();
      Alert.alert("تم", `تم توليد ${qty} كود أرقام بنجاح ✅`);
    });
  };

  const pendingCodeRequests = codeRequests.filter((request) => request.status === 'pending');

  const approveCodeRequest = async (request) => {
    confirmAction("تفعيل الكود", `تفعيل حساب ${request.studentName}؟`, async () => {
      const codeSnapshot = await getDocs(query(collection(db, "codes"), where("code", "==", request.code)));
      if (codeSnapshot.empty) return Alert.alert("خطأ", "الكود غير موجود");

      const codeDoc = codeSnapshot.docs[0];
      const codeData = codeDoc.data();
      if (codeData.isUsed) return Alert.alert("خطأ", "الكود مستخدم مسبقاً");
      if (codeData.year && codeData.year !== request.year) return Alert.alert("تنبيه", `الكود مخصص لـ ${codeData.year}`);

      const accessYear = codeData.year || request.year || '';
      const studentSnap = await getDoc(doc(db, "students", request.studentId));
      const studentData = studentSnap.exists() ? studentSnap.data() : {};
      const existingCodes = Array.isArray(studentData?.usedCodes)
        ? studentData.usedCodes
        : (studentData?.usedCode ? [studentData.usedCode] : []);
      const nextUsedCodes = Array.from(new Set([...existingCodes, request.code].filter(Boolean)));
      const legacyYears = [studentData?.accessYear, studentData?.codeYear].filter(Boolean);
      const existingYears = Array.isArray(studentData?.accessYears) ? studentData.accessYears : legacyYears;
      const nextAccessYears = uniqByNormalized([...existingYears, accessYear].filter(Boolean), normalizeText);

      const batch = writeBatch(db);
      batch.update(doc(db, "students", request.studentId), {
        isSubscribed: true,
        usedCode: request.code,
        usedCodes: nextUsedCodes,
        accessYear,
        accessYears: nextAccessYears,
        codeYear: accessYear,
        pendingCode: "",
        codeReviewStatus: "approved",
      });
      batch.update(doc(db, "codes", codeDoc.id), {
        isUsed: true,
        usedByName: request.studentName,
        usedBy: request.username,
        usedById: request.studentId,
        usedAt: serverTimestamp(),
      });
      batch.update(doc(db, "teacher_code_requests", request.id), {
        status: "approved",
        reviewedAt: serverTimestamp(),
      });
      await batch.commit();
      Alert.alert("تم", "تم تفعيل الطالب");
    });
  };

  const rejectCodeRequest = async (request) => {
    confirmAction("رفض الطلب", `رفض كود ${request.studentName}؟`, async () => {
      const batch = writeBatch(db);
      batch.update(doc(db, "teacher_code_requests", request.id), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
      });
      batch.update(doc(db, "students", request.studentId), {
        pendingCode: "",
        codeReviewStatus: "rejected",
      });
      await batch.commit();
      Alert.alert("تم", "تم رفض الطلب");
    }, true);
  };

 const exportCodesToExcel = async () => {
    try {
      // 1. فلترة الأكواد بناءً على السنة والحالة المختارة
      const filteredCodes = codesDB.filter(c => {
        const yearMatch = selectedYear === 'الكل' || c.year === selectedYear;
        const statusMatch = 
          statusFilter === 'all' ? true : 
          statusFilter === 'used' ? c.isUsed : !c.isUsed;
        return yearMatch && statusMatch;
      });

      if (filteredCodes.length === 0) {
        return Alert.alert("تنبيه", "لا توجد أكواد لتصديرها في هذه الفئة");
      }

      // 2. تجهيز البيانات حسب نوع الفلتر المختارة
      let dataToExport;

      if (statusFilter === 'unused') {
        // إذا اختار "متاحة" فقط -> يخرج عمود الكود فقط لسهولة النسخ
        dataToExport = filteredCodes.map(item => ({
          "الكود": item.code
        }));
      } else {
        // إذا اختار "الكل" أو "مستخدمة" -> يخرج البيانات كاملة مع تاريخ الاستخدام
        dataToExport = filteredCodes.map(item => {
          // تحويل تاريخ الاستخدام لشكل مقروء إذا كان الكود مستخدماً
          let usedDate = "---";
          if (item.isUsed && item.usedAt) {
            // إذا كنت تخزن تاريخ الاستخدام في حقل usedAt في الفايربيس
            usedDate = item.usedAt?.toDate ? item.usedAt.toDate().toLocaleString('ar-EG') : "مسجل";
          }

          return {
            "الكود": item.code,
            "الفرقة": item.year,
            "الحالة": item.isUsed ? "مستخدم 👤" : "متاح ✅",
            "اسم الطالب": item.usedByName || "---",
            "تاريخ الاستخدام": usedDate, // العمود الجديد
            "تاريخ الإنشاء": item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('ar-EG') : "غير مسجل"
          };
        });
      }

      // 3. إنشاء ملف Excel
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "بيانات الأكواد");

      // 4. تحويل لـ Base64 وحفظ الملف
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `CodesReport_${Date.now()}.xlsx`;
      const uri = FileSystem.cacheDirectory + fileName;

      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: 'base64' });
      
      // 5. مشاركة وتحميل الملف
      await Sharing.shareAsync(uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'تصدير بيانات الأكواد',
        UTI: 'com.microsoft.excel.xlsx'
      });

    } catch (error) {
      console.error(error);
      Alert.alert("خطأ", "حدث خطأ أثناء تصدير ملف الإكسيل");
    }
  };

  const uploadFileToBunny = async (type) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: type === 'video' ? 'video/*' : 'application/pdf',
      copyToCacheDirectory: true,
    });

    if (result.type === 'cancel') return;

    const file = result.assets?.[0] ?? result;
    if (!file?.uri) throw new Error("ملف غير صالح");

    const folder = type === 'video' ? 'lectures_videos' : 'lectures_pdf';
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const uploadUrl = `https://${BUNNY_CONFIG.regionEndpoint}/${BUNNY_CONFIG.storageName}/${folder}/${fileName}`;

    const response = await fetch(file.uri);
    const blob = await response.blob();
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_CONFIG.accessKey,
        'Content-Type': 'application/octet-stream'
      },
      body: blob
    });

    if (uploadRes.ok) {
      setNewLesson(prev => ({
        ...prev,
        [type === 'video' ? 'url' : 'pdfUrl']: `${BUNNY_CONFIG.pullZoneUrl}/${folder}/${fileName}`
      }));
      Alert.alert("نجاح", "تم الرفع بنجاح ✅");
    }
  };

  const handleDeleteSingleCode = (codeId, usedById, codeValue, codeYear) => {
    confirmAction("تأكيد الحذف", "سيتم إلغاء تفعيل الطالب المرتبط به.", async () => {
      const batch = writeBatch(db);
      batch.delete(doc(db, "codes", codeId));

      if (usedById) {
        const studentSnap = await getDoc(doc(db, "students", usedById));
        const studentData = studentSnap.exists() ? studentSnap.data() : {};
        const existingCodes = Array.isArray(studentData?.usedCodes)
          ? studentData.usedCodes
          : (studentData?.usedCode ? [studentData.usedCode] : []);
        const nextUsedCodes = existingCodes.filter((c) => String(c || '').toUpperCase() !== String(codeValue || '').toUpperCase());

        const legacyYears = [studentData?.accessYear, studentData?.codeYear].filter(Boolean);
        const existingYears = Array.isArray(studentData?.accessYears) ? studentData.accessYears : legacyYears;
        const removedYearKey = normalizeText(codeYear);
        const nextAccessYears = existingYears.filter((y) => normalizeText(y) !== removedYearKey);

        const keepSubscribed = nextAccessYears.length > 0;
        const lastYear = keepSubscribed ? nextAccessYears[nextAccessYears.length - 1] : "";
        const lastCode = nextUsedCodes.length ? nextUsedCodes[nextUsedCodes.length - 1] : "";

        batch.update(doc(db, "students", usedById), {
          isSubscribed: keepSubscribed,
          usedCode: lastCode,
          usedCodes: nextUsedCodes,
          accessYear: lastYear,
          accessYears: nextAccessYears,
          codeYear: lastYear,
        });
      }

      await batch.commit();
    }, true);
  };

  const deleteAllCodes = () => {
    confirmAction("تطهير شامل ⚠️", "سيتم حذف كل الأكواد وإلغاء تفعيل كل الطلاب!", async () => {
      const batch = writeBatch(db);
      codesDB.forEach(c => batch.delete(doc(db, "codes", c.id)));
      studentsDB.forEach(s => batch.update(doc(db, "students", s.id), { isSubscribed: false, usedCode: "", usedCodes: [], accessYear: "", accessYears: [], codeYear: "" }));
      await batch.commit();
    }, true);
  };

  // --- واجهات العرض (Render) ---
  const STAT_CARDS = [
    { num: studentsDB.length, label: 'طالب مسجل', icon: 'users', color: COLORS.blue },
    { num: lessons.length, label: 'محاضرة', icon: 'play-circle', color: COLORS.gold },
    { num: codesDB.filter(c=>!c.isUsed).length, label: 'كود متاح', icon: 'ticket-alt', color: COLORS.green },
    { num: codesDB.filter(c=>c.isUsed).length, label: 'كود مستخدم', icon: 'check-circle', color: COLORS.red },
  ];

  const renderStats = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      {/* Hero Header */}
      <Animated.View entering={FadeInDown.duration(500).springify()} style={styles.statsHero}>
        <LinearGradient colors={[COLORS.gold + 'CC', COLORS.goldDark]} style={styles.statsHeroGradient}>
          <View style={styles.statsHeroCircle1} />
          <View style={styles.statsHeroCircle2} />
          <Animated.View entering={ZoomIn.delay(200).duration(600)}>
            <Image source={require('../icon.png')} style={styles.mainLogo} resizeMode="contain" />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(300)} style={styles.statsHeroTitle}>
            لوحة التحكم
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(400)} style={styles.statsHeroSub}>
            إدارة كاملة للمنصة التعليمية
          </Animated.Text>
        </LinearGradient>
      </Animated.View>

      {/* Stat Cards */}
      <View style={styles.statsGrid}>
        {STAT_CARDS.map((card, i) => (
          <Animated.View key={card.label} entering={FadeInUp.delay(i * 100).duration(450).springify()} style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: card.color + '20' }]}>
              <FontAwesome5 name={card.icon} size={18} color={card.color} />
            </View>
            <Text style={[styles.statNum, { color: card.color }]}>{card.num}</Text>
            <Text style={styles.statLabel}>{card.label}</Text>
          </Animated.View>
        ))}
      </View>

      {/* Pending Requests Alert */}
      {pendingCodeRequests.length > 0 && (
        <Animated.View entering={FadeInUp.delay(400)} style={styles.pendingAlert}>
          <FontAwesome5 name="bell" size={16} color={COLORS.gold} />
          <Text style={styles.pendingAlertText}>
            {pendingCodeRequests.length} طلب تفعيل بانتظار المراجعة
          </Text>
          <TouchableOpacity onPress={() => setActiveTab('code_requests')} style={styles.pendingAlertBtn}>
            <Text style={{ color: COLORS.bg, fontWeight: '900', fontSize: 12 }}>مراجعة</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ScrollView>
  );

  const renderAddLesson = () => {
    const steps = [
      { num: '١', label: 'المعلومات الأساسية' },
      { num: '٢', label: 'التصنيف' },
      { num: '٣', label: 'الرابط والملفات' },
    ];
    const isReady = newLesson.title && newLesson.url && newLesson.subject && newLesson.year && newLesson.semester;

    return (
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero Header */}
        <Animated.View entering={FadeInDown.duration(450)}>
          <LinearGradient colors={[COLORS.gold, COLORS.goldDark]} style={styles.publishHero}>
            <View style={styles.publishHeroCircle} />
            <FontAwesome5 name="paper-plane" size={28} color="#fff" style={{ marginBottom: 10 }} />
            <Text style={styles.publishHeroTitle}>نشر محاضرة جديدة</Text>
            <Text style={styles.publishHeroSub}>أكمل الخطوات الثلاث لنشر المحتوى للطلاب</Text>
          </LinearGradient>
        </Animated.View>

        {/* Step 1: Basic Info */}
        <Animated.View entering={FadeInUp.delay(100).springify()} style={styles.publishStep}>
          <View style={styles.publishStepHeader}>
            <View style={styles.publishStepNum}><Text style={styles.publishStepNumText}>١</Text></View>
            <Text style={styles.publishStepTitle}>المعلومات الأساسية</Text>
          </View>

          <TextInput
            style={styles.publishInput}
            placeholder="عنوان المحاضرة"
            placeholderTextColor={COLORS.subText}
            value={newLesson.title}
            onChangeText={t => setNewLesson({...newLesson, title: t})}
          />
          <TextInput
            style={[styles.publishInput, styles.publishTextArea]}
            placeholder="وصف مختصر يظهر للطالب تحت اسم الفيديو (اختياري)"
            placeholderTextColor={COLORS.subText}
            multiline
            value={newLesson.description}
            onChangeText={t => setNewLesson({...newLesson, description: t})}
          />
        </Animated.View>

        {/* Step 2: Classification */}
        <Animated.View entering={FadeInUp.delay(180).springify()} style={styles.publishStep}>
          <View style={styles.publishStepHeader}>
            <View style={styles.publishStepNum}><Text style={styles.publishStepNumText}>٢</Text></View>
            <Text style={styles.publishStepTitle}>التصنيف</Text>
          </View>

          <Text style={styles.publishLabel}>الفرقة الدراسية</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.publishChipsRow}>
            {['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'].map(y => (
              <TouchableOpacity key={y} style={[styles.publishChip, newLesson.year === y && styles.publishChipActive]} onPress={() => setNewLesson({...newLesson, year: y})}>
                <Text style={[styles.publishChipText, newLesson.year === y && styles.publishChipTextActive]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.publishLabel}>الترم</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.publishChipsRow}>
            {['الأول', 'الثاني'].map(sem => (
              <TouchableOpacity key={sem} style={[styles.publishChip, newLesson.semester === sem && styles.publishChipActive]} onPress={() => setNewLesson({...newLesson, semester: sem})}>
                <Text style={[styles.publishChipText, newLesson.semester === sem && styles.publishChipTextActive]}>الترم {sem}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.publishLabel}>المادة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.publishChipsRow}>
            {subjects.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.publishChip, newLesson.subjectId === s.id && styles.publishChipActive]}
                onPress={() => setNewLesson({...newLesson, subject: s.name, subjectId: s.id, chapterId: '', chapterName: ''})}
              >
                <FontAwesome5 name="book" size={10} color={newLesson.subjectId === s.id ? COLORS.bg : COLORS.subText} style={{marginLeft: 4}} />
                <Text style={[styles.publishChipText, newLesson.subjectId === s.id && styles.publishChipTextActive]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {!!newLesson.subjectId && (
            <>
              <Text style={styles.publishLabel}>الشابتر (اختياري)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.publishChipsRow}>
                <TouchableOpacity style={[styles.publishChip, !newLesson.chapterId && styles.publishChipActive]} onPress={() => setNewLesson({...newLesson, chapterId: '', chapterName: ''})}>
                  <Text style={[styles.publishChipText, !newLesson.chapterId && styles.publishChipTextActive]}>بدون شابتر</Text>
                </TouchableOpacity>
                {(chapters[newLesson.subjectId] || []).map(ch => (
                  <TouchableOpacity key={ch.id} style={[styles.publishChip, newLesson.chapterId === ch.id && styles.publishChipActive]} onPress={() => setNewLesson({...newLesson, chapterId: ch.id, chapterName: ch.name})}>
                    <Text style={[styles.publishChipText, newLesson.chapterId === ch.id && styles.publishChipTextActive]}>{ch.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </Animated.View>

        {/* Step 3: Links */}
        <Animated.View entering={FadeInUp.delay(260).springify()} style={styles.publishStep}>
          <View style={styles.publishStepHeader}>
            <View style={styles.publishStepNum}><Text style={styles.publishStepNumText}>٣</Text></View>
            <Text style={styles.publishStepTitle}>الرابط والملفات</Text>
          </View>

          <Text style={styles.publishLabel}>نوع رابط الفيديو</Text>
          <View style={styles.optionRow}>
            {[{ id: 'direct', label: 'مباشر', icon: 'link' }, { id: 'youtube', label: 'يوتيوب', icon: 'youtube' }, { id: 'google_drive', label: 'Drive', icon: 'google-drive' }].map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.videoKindBtn, newLesson.videoKind === opt.id && styles.videoKindBtnActive]}
                onPress={() => setNewLesson({...newLesson, videoKind: opt.id})}
              >
                <FontAwesome5 name={opt.icon} size={14} color={newLesson.videoKind === opt.id ? COLORS.bg : COLORS.subText} />
                <Text style={[styles.videoKindText, newLesson.videoKind === opt.id && { color: COLORS.bg }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.publishInput}
            placeholder={newLesson.videoKind === 'youtube' ? 'رابط YouTube' : newLesson.videoKind === 'google_drive' ? 'رابط Google Drive' : 'رابط الفيديو المباشر'}
            placeholderTextColor={COLORS.subText}
            value={newLesson.url}
            onChangeText={t => setNewLesson({...newLesson, url: t})}
          />
          <TextInput
            style={styles.publishInput}
            placeholder="رابط الملزمة PDF (اختياري)"
            placeholderTextColor={COLORS.subText}
            value={newLesson.pdfUrl}
            onChangeText={t => setNewLesson({...newLesson, pdfUrl: t})}
          />

          {/* Upload Boxes */}
          <View style={styles.uploadGrid}>
            <TouchableOpacity style={[styles.uploadBox, newLesson.url && styles.uploadBoxDone]} onPress={() => uploadFileToBunny('video')}>
              <FontAwesome5 name={newLesson.url ? 'check-circle' : 'video'} color={newLesson.url ? COLORS.green : COLORS.gold} size={26} />
              <Text style={[styles.uploadText, newLesson.url && { color: COLORS.green }]}>{isUploading.video ? 'جاري الرفع...' : newLesson.url ? 'تم ✓' : 'رفع فيديو'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.uploadBox, newLesson.pdfUrl && styles.uploadBoxDone]} onPress={() => uploadFileToBunny('pdf')}>
              <FontAwesome5 name={newLesson.pdfUrl ? 'check-circle' : 'file-pdf'} color={newLesson.pdfUrl ? COLORS.green : COLORS.red} size={26} />
              <Text style={[styles.uploadText, newLesson.pdfUrl && { color: COLORS.green }]}>{isUploading.pdf ? 'جاري الرفع...' : newLesson.pdfUrl ? 'تم ✓' : 'رفع PDF'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Publish Button */}
        <Animated.View entering={FadeInUp.delay(340).springify()} style={{ padding: 20, paddingTop: 0 }}>
          <TouchableOpacity
            onPress={saveLesson}
            disabled={!isReady}
            style={[styles.publishBtn, !isReady && { opacity: 0.4 }]}
          >
            <LinearGradient colors={[COLORS.gold, COLORS.goldDark]} style={styles.publishBtnGradient}>
              <FontAwesome5 name="paper-plane" size={16} color="#fff" style={{ marginLeft: 8 }} />
              <Text style={styles.publishBtnText}>نشر المحاضرة الآن 🚀</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    );
  };

  const renderCodes = () => (
    <View style={styles.content}>
      <View style={styles.card}>
        <View style={{flexDirection: 'row-reverse', gap: 10, marginBottom: 15, alignItems: 'center'}}>
           <TouchableOpacity onPress={generateCodes} style={[styles.mainBtn, {flex: 1, padding: 10}]}><Text style={styles.mainBtnText}>توليد</Text></TouchableOpacity>
           <TextInput style={[styles.input, {width: 60, marginBottom: 0, textAlign: 'center'}]} keyboardType="numeric" value={codeQty} onChangeText={setCodeQty} />
           <Text style={styles.label}>الكمية:</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexDirection: 'row-reverse', marginBottom: 15}}>
          {['الكل', 'الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'].map(y => (
            <TouchableOpacity key={y} style={[styles.chip, selectedYear === y && styles.chipActive]} onPress={() => setSelectedYear(y)}><Text style={styles.chipText}>{y}</Text></TouchableOpacity>
          ))}
        </ScrollView> 
        <View style={{flexDirection: 'row-reverse', gap: 8, marginBottom: 15}}>
          {[
            { id: 'all', label: 'الكل' },
            { id: 'unused', label: 'متاحة ✅' },
            { id: 'used', label: 'مستخدمة 👤' }
          ].map(filter => (
            <TouchableOpacity 
              key={filter.id}
              style={[styles.statusBtn, statusFilter === filter.id && { backgroundColor: COLORS.gold }]} 
              onPress={() => setStatusFilter(filter.id)}
            >
              <Text style={[styles.statusBtnText, statusFilter === filter.id && { color: '#000' }]}>{filter.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* أزرار التحكم: تحميل إكسل وتصفير الأكواد */}
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          <TouchableOpacity 
            style={[styles.mainBtn, { flex: 1, backgroundColor: COLORS.green + '22', borderWidth: 1, borderColor: COLORS.green }]} 
            onPress={exportCodesToExcel}
          >
            <Text style={{ color: COLORS.green, fontWeight: 'bold' }}>
              <FontAwesome5 name="file-excel" /> تحميل Excel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.mainBtn, { flex: 1, backgroundColor: '#ff444422', borderWidth: 1, borderColor: COLORS.red }]} 
            onPress={deleteAllCodes}
          >
            <Text style={{ color: COLORS.red, fontWeight: 'bold' }}>تصفير الكل ⚠️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList 
        data={codesDB.filter(c => selectedYear === 'الكل' || c.year === selectedYear)}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={{justifyContent: 'space-between'}}
        renderItem={({item}) => (
          <View style={[styles.codeCard, {borderColor: item.isUsed ? '#222' : '#D4AF3744'}]}>
            <Text style={{color: item.isUsed ? '#555' : COLORS.gold, fontWeight: 'bold', fontSize: 16}}>{item.code}</Text>
            <Text style={{color: '#666', fontSize: 10}}>{item.year}</Text>
            {item.isUsed ? <Text style={{color: COLORS.blue, fontSize: 10, marginTop: 5}}>👤 {item.usedByName}</Text> : <Text style={{color: COLORS.green, fontSize: 10, marginTop: 5}}>• متاح</Text>}
            <TouchableOpacity onPress={() => handleDeleteSingleCode(item.id, item.usedById, item.code, item.year)} style={{position: 'absolute', top: 5, left: 5}}><FontAwesome5 name="times" color={COLORS.red} size={12} opacity={0.5}/></TouchableOpacity>
          </View>
        )}
      />
    </View>
  );

  const renderCodeRequests = () => (
    <View style={styles.content}>
      <Text style={styles.welcomeText}>طلبات تفعيل الأكواد</Text>
      <FlatList
        data={pendingCodeRequests}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={{color: COLORS.subText, textAlign: 'center', marginTop: 30}}>لا توجد طلبات معلقة حالياً</Text>}
        renderItem={({item}) => (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, {marginBottom: 8}]}>{item.studentName}</Text>
            <Text style={styles.label}>@{item.username} • {item.year}</Text>
            <Text style={styles.label}>الهاتف: {item.phone || 'غير مسجل'}</Text>
            <Text style={[styles.cardTitle, {fontSize: 20, textAlign: 'center'}]}>{item.code}</Text>
            <View style={{flexDirection: 'row-reverse', gap: 10}}>
              <TouchableOpacity onPress={() => approveCodeRequest(item)} style={[styles.mainBtn, {flex: 1, backgroundColor: COLORS.green}]}>
                <Text style={styles.mainBtnText}>تفعيل</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => rejectCodeRequest(item)} style={[styles.mainBtn, {flex: 1, backgroundColor: COLORS.red}]}>
                <Text style={[styles.mainBtnText, {color: '#fff'}]}>رفض</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );

  const renderSubjects = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── إضافة مادة جديدة ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📚 إدارة المواد والشابترات</Text>
        <View style={{flexDirection: 'row-reverse', gap: 10}}>
          <TextInput
            style={[styles.input, {flex: 1, marginBottom: 0}]}
            placeholder="اسم المادة الجديدة"
            placeholderTextColor={COLORS.subText}
            value={newSubject}
            onChangeText={setNewSubject}
          />
          <TouchableOpacity
            style={[styles.mainBtn, {paddingHorizontal: 18, paddingVertical: 0, justifyContent: 'center'}]}
            onPress={handleAddSubject}
          >
            <Text style={styles.mainBtnText}>+ إضافة</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── قائمة المواد ── */}
      {subjects.map(sub => {
        const subChapters = (chapters[sub.id] || []).sort((a,b) => (a.order??99)-(b.order??99));
        const isExpanded = expandedSubject === sub.id;

        return (
          <View key={sub.id} style={[styles.card, {padding: 0, overflow: 'hidden'}]}>

            {/* هيدر المادة */}
            <TouchableOpacity
              style={styles.subjectHeader}
              onPress={() => setExpandedSubject(isExpanded ? null : sub.id)}
              activeOpacity={0.8}
            >
              <TouchableOpacity
                onPress={() => confirmAction('حذف المادة؟', 'سيتم حذف المادة وكل شابتراتها ودروسها.', async () => {
                  const batch = writeBatch(db);
                  (chapters[sub.id] || []).forEach(ch => batch.delete(doc(db, "chapters", ch.id)));
                  const snap = await getDocs(query(collection(db, "lessons"), where("subjectId", "==", sub.id)));
                  snap.docs.forEach(d => batch.delete(d.ref));
                  batch.delete(doc(db, "subjects", sub.id));
                  await batch.commit();
                }, true)}
                hitSlop={{top:8,bottom:8,left:8,right:8}}
              >
                <FontAwesome5 name="trash" color={COLORS.red} size={14} />
              </TouchableOpacity>

              <View style={{flex: 1, alignItems: 'flex-end', marginHorizontal: 12}}>
                <Text style={{color: COLORS.text, fontWeight: '900', fontSize: 15}}>{sub.name}</Text>
                <Text style={{color: COLORS.subText, fontSize: 11, marginTop: 2}}>
                  {subChapters.length} شابتر • {lessons.filter(l => l.subjectId === sub.id).length} درس
                </Text>
              </View>
              <View style={[styles.subjectIconBox, {backgroundColor: COLORS.gold + '22'}]}>
                <FontAwesome5 name="book-open" size={16} color={COLORS.gold} />
              </View>
              <FontAwesome5 name={isExpanded ? "chevron-up" : "chevron-down"} size={12} color={COLORS.subText} style={{marginLeft: 4}} />
            </TouchableOpacity>

            {/* ── قسم الشابترات ── */}
            {isExpanded && (
              <View style={styles.chaptersContainer}>

                {/* فورم إضافة شابتر */}
                <View style={styles.addChapterForm}>
                  <Text style={styles.addChapterFormTitle}>➕ شابتر جديد</Text>

                  <TextInput
                    style={styles.addChapterInput}
                    placeholder="اسم الشابتر (مثال: الشابتر الأول)"
                    placeholderTextColor={COLORS.subText}
                    value={newChapter.name}
                    onChangeText={t => setNewChapter({...newChapter, name: t})}
                  />

                  {/* اختيار الفرقة */}
                  <Text style={styles.addChapterLabel}>الفرقة:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexDirection:'row-reverse', gap: 8, marginBottom: 12}}>
                    {['الفرقة الأولى','الفرقة الثانية','الفرقة الثالثة','الفرقة الرابعة','مشترك'].map(y => (
                      <TouchableOpacity
                        key={y}
                        style={[styles.chip, newChapter.year === y && styles.chipActive]}
                        onPress={() => setNewChapter({...newChapter, year: y})}
                      >
                        <Text style={styles.chipText}>{y}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* ملاحظات الشابتر */}
                  <TextInput
                    style={[styles.addChapterInput, {minHeight: 70, textAlignVertical: 'top'}]}
                    placeholder="ملاحظات الشابتر (اختياري — تظهر للطالب)"
                    placeholderTextColor={COLORS.subText}
                    multiline
                    value={newChapter.notes}
                    onChangeText={t => setNewChapter({...newChapter, notes: t})}
                  />

                  <TouchableOpacity
                    style={styles.mainBtn}
                    onPress={() => handleAddChapter(sub.id, sub.name)}
                  >
                    <Text style={styles.mainBtnText}>حفظ الشابتر</Text>
                  </TouchableOpacity>
                </View>

                {/* قائمة الشابترات */}
                {subChapters.length === 0 ? (
                  <Text style={{color: COLORS.subText, textAlign: 'center', padding: 16, fontSize: 13}}>
                    لا يوجد شابترات بعد ☝️
                  </Text>
                ) : (
                  subChapters.map((ch, idx) => (
                    <View key={ch.id} style={styles.chapterItem}>

                      {/* أزرار الترتيب */}
                      <View style={styles.chapterOrderBtns}>
                        <TouchableOpacity onPress={() => handleMoveChapter(sub.id, ch.id, 'up')} disabled={idx===0} style={[styles.orderBtn, idx===0 && {opacity:0.2}]}>
                          <FontAwesome5 name="chevron-up" size={10} color={COLORS.subText} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleMoveChapter(sub.id, ch.id, 'down')} disabled={idx===subChapters.length-1} style={[styles.orderBtn, idx===subChapters.length-1 && {opacity:0.2}]}>
                          <FontAwesome5 name="chevron-down" size={10} color={COLORS.subText} />
                        </TouchableOpacity>
                      </View>

                      {/* محتوى الشابتر أو فورم التعديل */}
                      {editingChapter?.id === ch.id ? (
                        <View style={{flex: 1, gap: 8}}>
                          <TextInput
                            style={styles.addChapterInput}
                            value={editingChapter.name}
                            onChangeText={t => setEditingChapter({...editingChapter, name: t})}
                            placeholder="اسم الشابتر"
                            placeholderTextColor={COLORS.subText}
                            autoFocus
                          />
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexDirection:'row-reverse', gap:6}}>
                            {['الفرقة الأولى','الفرقة الثانية','الفرقة الثالثة','الفرقة الرابعة','مشترك'].map(y => (
                              <TouchableOpacity key={y} style={[styles.chip, editingChapter.year===y && styles.chipActive]} onPress={() => setEditingChapter({...editingChapter, year: y})}>
                                <Text style={styles.chipText}>{y}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                          <TextInput
                            style={[styles.addChapterInput, {minHeight: 60, textAlignVertical:'top'}]}
                            value={editingChapter.notes || ''}
                            onChangeText={t => setEditingChapter({...editingChapter, notes: t})}
                            placeholder="ملاحظات..."
                            placeholderTextColor={COLORS.subText}
                            multiline
                          />
                          <View style={{flexDirection:'row-reverse', gap: 10}}>
                            <TouchableOpacity onPress={handleRenameChapter} style={[styles.mainBtn, {flex:1, padding: 10}]}>
                              <Text style={styles.mainBtnText}>حفظ</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setEditingChapter(null)} style={[styles.mainBtn, {flex:1, padding: 10, backgroundColor: COLORS.red + '22', borderWidth:1, borderColor: COLORS.red}]}>
                              <Text style={{color: COLORS.red, fontWeight:'bold'}}>إلغاء</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={{flex: 1, alignItems: 'flex-end'}}>
                          <View style={{flexDirection:'row-reverse', alignItems:'center', gap: 8}}>
                            <Text style={{color: COLORS.text, fontWeight: '900', fontSize: 14}}>{ch.name}</Text>
                            {/* بادج الفرقة */}
                            <View style={[styles.yearBadge, {backgroundColor: COLORS.gold + '22'}]}>
                              <Text style={{color: COLORS.gold, fontSize: 10, fontWeight:'800'}}>{ch.year || 'مشترك'}</Text>
                            </View>
                          </View>
                          <Text style={{color: COLORS.subText, fontSize: 11, marginTop: 3}}>
                            {lessons.filter(l => l.chapterId === ch.id).length} درس
                            {ch.notes ? ' • فيه ملاحظات 📝' : ''}
                          </Text>
                          {!!ch.notes && (
                            <Text style={{color: COLORS.subText, fontSize: 11, marginTop: 4, textAlign:'right'}} numberOfLines={2}>
                              {ch.notes}
                            </Text>
                          )}
                        </View>
                      )}

                      {/* أزرار التحكم */}
                      {editingChapter?.id !== ch.id && (
                        <View style={{flexDirection: 'row', gap: 8, marginRight: 8}}>
                          <TouchableOpacity
                            onPress={() => setEditingChapter({id: ch.id, name: ch.name, year: ch.year || 'الفرقة الأولى', notes: ch.notes || '', subjectId: sub.id})}
                            style={styles.chapterActionBtn}
                          >
                            <FontAwesome5 name="pen" size={11} color={COLORS.gold} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteChapter(ch.id)} style={styles.chapterActionBtn}>
                            <FontAwesome5 name="trash" size={11} color={COLORS.red} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );

  const renderLessons = () => (
    <ScrollView style={styles.content}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {lessons.map(l => (
          <View key={l.id} style={styles.lessonCard}>
            <View style={styles.videoPlaceholder}>
              {playingVideoId === l.id && l.videoKind !== 'youtube' ? (
                <Video source={{ uri: l.url }} useNativeControls resizeMode="contain" style={{width: '100%', height: '100%'}} />
              ) : (
                <TouchableOpacity onPress={() => (l.videoKind === 'youtube' ? Linking.openURL(l.url) : setPlayingVideoId(l.id))} style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
                  <FontAwesome5 name={l.videoKind === 'youtube' ? 'youtube' : 'play-circle'} size={40} color={l.videoKind === 'youtube' ? COLORS.red : COLORS.gold} />
                  {!l.isActive && <View style={styles.badge}><Text style={{fontSize:10, color:'#fff'}}>مخفي</Text></View>}
                </TouchableOpacity>
              )}
            </View>
            <View style={{padding: 15}}>
              <Text style={{color: COLORS.text, fontWeight: 'bold', textAlign: 'right'}}>{l.title}</Text>
              <Text style={{color: COLORS.gold, fontSize: 12, textAlign: 'right'}}>{l.subject} • {l.year}</Text>
              {!!l.description && <Text style={{color: COLORS.subText, fontSize: 12, textAlign: 'right', marginTop: 8, lineHeight: 18}}>{l.description}</Text>}
              <View style={styles.metaRow}>
                <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>{l.videoKind === 'youtube' ? 'YouTube' : 'Video'}</Text></View>
                {!!l.pdfUrl && <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>PDF</Text></View>}
              </View>
              <View style={{flexDirection: 'row', gap: 10, marginTop: 15}}>
                <TouchableOpacity onPress={() => updateDoc(doc(db, "lessons", l.id), {isActive: !l.isActive})} style={[styles.actionBtn, {backgroundColor: l.isActive ? '#ff980022' : '#28a74522'}]}>
                  <Text style={{color: l.isActive ? '#ff9800' : '#28a745', fontSize: 12}}>{l.isActive ? 'إخفاء' : 'إظهار'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmAction('حذف؟', '', () => deleteDoc(doc(db, "lessons", l.id)), true)} style={[styles.actionBtn, {backgroundColor: '#ff444422'}]}>
                  <Text style={{color: COLORS.red, fontSize: 12}}>حذف</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderStudents = () => (
    <View style={styles.content}>
      <View style={{flexDirection: 'row-reverse', gap: 10, marginBottom: 15}}>
        <TextInput style={[styles.input, {flex: 1, marginBottom: 0}]} placeholder="🔍 ابحث..." placeholderTextColor={COLORS.subText} value={searchTerm} onChangeText={setSearchTerm} />
      </View>
      <FlatList 
        data={studentsDB.filter(s => s.name?.includes(searchTerm) || s.username?.includes(searchTerm))}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <View style={styles.listItem}>
            <View style={{flexDirection: 'row', gap: 10}}>
              <TouchableOpacity onPress={() => confirmAction('تصفير الجهاز؟', '', () => updateDoc(doc(db, "students", item.id), {deviceId: null}))} style={styles.iconBtn}><FontAwesome5 name="sync-alt" color={COLORS.blue} size={14}/></TouchableOpacity>
              <TouchableOpacity onPress={() => updateDoc(doc(db, "students", item.id), {isBanned: !item.isBanned})} style={styles.iconBtn}><FontAwesome5 name={item.isBanned ? "unlock" : "ban"} color={item.isBanned ? COLORS.green : '#ff9800'} size={14}/></TouchableOpacity>
              <TouchableOpacity onPress={() => confirmAction('حذف؟', '', () => deleteDoc(doc(db, "students", item.id)), true)} style={styles.iconBtn}><FontAwesome5 name="trash" color={COLORS.red} size={14}/></TouchableOpacity>
            </View>
            <View style={{alignItems: 'flex-end', flex: 1}}>
              <Text style={{color: COLORS.text, fontWeight: 'bold'}}>{item.name}</Text>
              <Text style={{color: COLORS.subText, fontSize: 11}}>{item.year} | {item.isBanned ? '🚫 محظور' : '✅ نشط'}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );

  const renderLogs = () => (
    <View style={styles.content}>
      <Text style={[styles.welcomeText, {color: COLORS.red}]}><FontAwesome5 name="shield-alt" /> سجل الرقابة</Text>
      <FlatList 
        data={logsDB}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <View style={[styles.listItem, {borderColor: item.action.includes('تصوير') ? COLORS.red : COLORS.border}]}>
            <View style={{alignItems: 'center'}}><FontAwesome5 name="mobile-alt" color="#888" size={16}/></View>
            <View style={{alignItems: 'flex-end', flex: 1, marginRight: 15}}>
              <Text style={{color: COLORS.text, fontWeight: 'bold', fontSize: 13}}>{item.studentName}</Text>
              <Text style={{color: item.action.includes('تصوير') ? COLORS.red : COLORS.blue, fontSize: 11}}>{item.action}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const NAV_ITEMS = [
    { id: 'stats', icon: 'chart-pie', label: 'الرئيسية' },
    { id: 'add_lesson', icon: 'plus-circle', label: 'نشر' },
    { id: 'subjects', icon: 'book', label: 'مواد' },
    { id: 'lessons', icon: 'play-circle', label: 'محاضرات' },
    { id: 'students', icon: 'users', label: 'طلاب' },
    { id: 'codes', icon: 'ticket-alt', label: 'أكواد' },
    { id: 'logs', icon: 'shield-alt', label: 'رقابة', color: COLORS.red },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[COLORS.gold, COLORS.goldDark]} style={styles.header}>
        <TouchableOpacity onPress={handleLogout}>
          <FontAwesome5 name="sign-out-alt" color="#000" size={20} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>لوحة التحكم الكاملة</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemeToggleButton mode={themeMode} onPress={toggleTheme} theme={theme} />
          <Image 
            source={require('../icon.png')} 
            style={styles.headerLogo} 
            resizeMode="contain" 
          />
        </View>
      </LinearGradient>

      <View style={[styles.dashboardBody, isDesktop && styles.dashboardBodyDesktop]}>
        {isDesktop && (
          <View style={styles.sidebar}>
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              const itemColor = active ? COLORS.gold : (item.color || COLORS.subText);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.sidebarItem, active && styles.sidebarItemActive]}
                  onPress={() => setActiveTab(item.id)}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name={item.icon} color={itemColor} size={18} />
                  <Text style={[styles.sidebarLabel, { color: itemColor }]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.contentHost}>
          {activeTab === 'stats' && renderStats()}
          {activeTab === 'add_lesson' && renderAddLesson()}
          {activeTab === 'subjects' && renderSubjects()}
          {activeTab === 'lessons' && renderLessons()}
          {activeTab === 'students' && renderStudents()}
          {activeTab === 'code_requests' && renderCodeRequests()}
          {activeTab === 'codes' && renderCodes()}
          {activeTab === 'logs' && renderLogs()}
        </View>
      </View>

      {!isDesktop && (
        <View style={styles.bottomNavContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bottomNavScroll}>
            {NAV_ITEMS.slice().reverse().map(item => (
              <TouchableOpacity key={item.id} style={styles.navItem} onPress={() => setActiveTab(item.id)}>
                <View style={[styles.iconWrapper, activeTab === item.id && styles.iconWrapperActive]}>
                  <FontAwesome5 name={item.icon} color={activeTab === item.id ? COLORS.gold : (item.color || COLORS.subText)} size={18} />
                </View>
                <Text style={[styles.navLabel, { color: activeTab === item.id ? COLORS.gold : (item.color || COLORS.subText) }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(COLORS) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { 
    paddingTop: Platform.OS === 'android' ? 40 : 15, 
    paddingBottom: 15, 
    paddingHorizontal: 20, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  headerTitle: { 
    fontSize: 18, 
    fontWeight: '900', 
    color: '#fff',
    flex: 1,
    textAlign: 'center'
  },
  headerLogo: {
    width: 38,
    height: 38,
  },
  dashboardBody: { flex: 1 },
  dashboardBodyDesktop: { flexDirection: 'row-reverse' },
  sidebar: {
    width: 230,
    backgroundColor: COLORS.card,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  sidebarItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
    marginBottom: 10,
  },
  sidebarItemActive: { backgroundColor: COLORS.gold + '22', borderColor: COLORS.gold },
  sidebarLabel: { fontSize: 13, fontWeight: '900' },
  contentHost: { flex: 1 },
  content: { flex: 1, padding: 18, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  statsHeaderContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10
  },
  mainLogo: {
    width: 100,
    height: 100,
    marginBottom: 10,
  },
  welcomeText: { color: COLORS.gold, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: { width: '48%', backgroundColor: COLORS.card, padding: 20, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', marginBottom: 15 },
  statNum: { color: COLORS.gold, fontSize: 28, fontWeight: '900' },
  statLabel: { color: COLORS.text, marginTop: 6, fontSize: 13, fontWeight: '800' },
  card: { backgroundColor: COLORS.card, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 15 },
  cardTitle: { color: COLORS.gold, fontSize: 18, fontWeight: '900', marginBottom: 15, textAlign: 'right' },
  label: { color: COLORS.text, marginBottom: 8, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  input: { backgroundColor: COLORS.cardAlt || '#fff', color: COLORS.text, padding: 14, borderRadius: 14, marginBottom: 15, textAlign: 'right', borderWidth: 1, borderColor: COLORS.border, fontSize: 15, minHeight: 50 },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  chip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 20, marginLeft: 8, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.gold + '22' },
  chipText: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  optionRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 15 },
  optionChip: { flex: 1, paddingVertical: 12, backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  optionChipActive: { backgroundColor: COLORS.gold + '22', borderColor: COLORS.gold },
  optionChipText: { color: COLORS.subText, fontWeight: '700' },
  optionChipTextActive: { color: COLORS.gold },
  uploadGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 10 },
  uploadBox: { flex: 1, height: 100, backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  uploadText: { color: COLORS.text, fontSize: 12, marginTop: 10, fontWeight: '800' },
  mainBtn: { backgroundColor: COLORS.gold, padding: 16, borderRadius: 14, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  mainBtnText: { color: '#000', fontWeight: '900', fontSize: 15 },
  listItem: { backgroundColor: COLORS.card, padding: 16, borderRadius: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  iconBtn: { padding: 8, backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 8 },
  lessonCard: { width: '48%', backgroundColor: COLORS.card, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, marginBottom: 15 },
  videoPlaceholder: { width: '100%', height: 100, backgroundColor: COLORS.cardAlt || '#fff', position: 'relative' },
  badge: { position: 'absolute', top: 5, left: 5, backgroundColor: COLORS.red, paddingHorizontal: 5, borderRadius: 5 },
  actionBtn: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  metaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaBadge: { backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  metaBadgeText: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  codeCard: { width: '48%', padding: 15, backgroundColor: COLORS.card, borderWidth: 1, borderRadius: 15, alignItems: 'center', marginBottom: 15, position: 'relative' },
  bottomNavContainer: { backgroundColor: COLORS.bottomBar || COLORS.card, borderTopWidth: 1, borderColor: COLORS.border, paddingBottom: Platform.OS === 'ios' ? 20 : 10 },
  bottomNavScroll: { flexDirection: 'row-reverse', paddingHorizontal: 10, alignItems: 'center', height: 70 },
  navItem: { alignItems: 'center', marginHorizontal: 12, minWidth: 50 },
  iconWrapper: { padding: 8, borderRadius: 12 },
  iconWrapperActive: { backgroundColor: COLORS.gold + '22' },
  navLabel: { fontSize: 11, marginTop: 4, fontWeight: '900' },
  statusBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.cardAlt, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statusBtnText: { fontSize: 12, fontWeight: '900', color: COLORS.text },

  // ===== Stats =====
  statsHero: { margin: 15, marginBottom: 0, borderRadius: 24, overflow: 'hidden' },
  statsHeroGradient: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20, position: 'relative' },
  statsHeroCircle1: { position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.1)' },
  statsHeroCircle2: { position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.08)' },
  statsHeroTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 10 },
  statsHeroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4, fontWeight: '600' },
  statIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  pendingAlert: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: COLORS.gold + '18', borderRadius: 16, padding: 14, margin: 15, marginTop: 10, borderWidth: 1, borderColor: COLORS.gold + '40' },
  pendingAlertText: { flex: 1, color: COLORS.text, fontWeight: '800', fontSize: 13, textAlign: 'right' },
  pendingAlertBtn: { backgroundColor: COLORS.gold, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },

  // ===== Publish Step =====
  publishHero: { margin: 15, borderRadius: 24, overflow: 'hidden', padding: 24, alignItems: 'center' },
  publishHeroCircle: { position: 'absolute', top: -20, left: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.12)' },
  publishHeroTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 4 },
  publishHeroSub: { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 4, textAlign: 'center', fontWeight: '600' },
  publishStep: { backgroundColor: COLORS.card, marginHorizontal: 15, marginBottom: 12, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  publishStepHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 14 },
  publishStepNum: { width: 28, height: 28, borderRadius: 10, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  publishStepNumText: { color: '#000', fontWeight: '900', fontSize: 14 },
  publishStepTitle: { color: COLORS.text, fontWeight: '900', fontSize: 15 },
  publishLabel: { color: COLORS.subText, fontSize: 12, fontWeight: '800', textAlign: 'right', marginBottom: 8, marginTop: 4 },
  publishChipsRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 10, paddingRight: 2 },
  publishChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt, gap: 5 },
  publishChipActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  publishChipText: { color: COLORS.subText, fontWeight: '800', fontSize: 12 },
  publishChipTextActive: { color: '#000' },
  publishInput: { backgroundColor: COLORS.cardAlt, color: COLORS.text, padding: 13, borderRadius: 14, marginBottom: 10, textAlign: 'right', borderWidth: 1, borderColor: COLORS.border, fontSize: 14 },
  publishTextArea: { minHeight: 90, textAlignVertical: 'top' },
  videoKindBtn: { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt },
  videoKindBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  videoKindText: { color: COLORS.subText, fontSize: 11, fontWeight: '800' },
  uploadBoxDone: { borderColor: COLORS.green + '60', backgroundColor: COLORS.green + '10' },
  publishBtn: { borderRadius: 18, overflow: 'hidden' },
  publishBtnGradient: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', padding: 18, gap: 10 },
  publishBtnText: { color: '#fff', fontWeight: '900', fontSize: 17 },

  // ===== Chapters Styles =====
  subjectHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.card,
  },
  subjectIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chaptersContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  addChapterRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addChapterInput: {
    flex: 1,
    color: COLORS.text,
    textAlign: 'right',
    fontSize: 14,
    paddingVertical: 6,
  },
  addChapterBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.gold + '22',
    borderWidth: 1,
    borderColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  chapterOrderBtns: {
    gap: 4,
  },
  orderBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chapterActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  saveChapterBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChapterForm: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addChapterFormTitle: {
    color: COLORS.gold,
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'right',
    marginBottom: 10,
  },
  addChapterLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 6,
  },
  yearBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
}); }
