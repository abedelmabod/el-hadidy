import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, 
  FlatList, Alert, ActivityIndicator, Dimensions, Platform, SafeAreaView,
  Image, Linking
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  writeBatch, onSnapshot, query, orderBy, serverTimestamp 
} from "firebase/firestore";

const { width } = Dimensions.get('window');

export default function AdminDashboard({ setUser, navigation, theme, themeMode, toggleTheme }) {
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
  
  // Form States
  const emptyLesson = {
    title: '',
    description: '',
    url: '',
    pdfUrl: '',
    subject: '',
    year: 'الفرقة الأولى',
    semester: 'الأول',
    videoKind: 'direct',
    isActive: true,
  };
  const [newLesson, setNewLesson] = useState(emptyLesson);
  const [newSubject, setNewSubject] = useState("");
  const [codeQty, setCodeQty] = useState("1");
  const [selectedYear, setSelectedYear] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState('all');

  const isFirstLoad = useRef(true);

  const BUNNY_CONFIG = {
    storageName: 'el-hadidy-files', 
    accessKey: process.env.EXPO_PUBLIC_BUNNY_ACCESS_KEY,
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

    return () => { unsubStudents(); unsubLessons(); unsubCodes(); unsubSubs(); unsubLogs(); };
  }, []);

  // --- Functions ---
  const confirmAction = (title, text, action, isDanger = false) => {
    Alert.alert(title, text, [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", style: isDanger ? "destructive" : "default", onPress: action }
    ]);
  };

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل أنت متأكد أنك تريد الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      { 
        text: "تأكيد", 
        style: "destructive",
        onPress: async () => {
          try {
            if (auth) await auth.signOut(); 
            if (setUser) setUser(null);
          } catch (error) {
            Alert.alert("خطأ", "حدث مشكلة أثناء تسجيل الخروج");
          }
        } 
      }
    ]);
  };

  const handleAddSubject = async () => {
    if (!newSubject.trim()) return;
    await addDoc(collection(db, "subjects"), { name: newSubject.trim() });
    setNewSubject("");
    Alert.alert("نجاح", "تم إضافة المادة");
  };

  const saveLesson = async () => {
    if (!newLesson.title || !newLesson.url || !newLesson.subject) return Alert.alert("تنبيه", "أكمل كافة البيانات ومسار الفيديو");
    
    await addDoc(collection(db, "lessons"), { 
      ...newLesson, 
      description: newLesson.description?.trim() || "",
      videoKind: /youtu\.be|youtube\.com/.test(newLesson.url) ? "youtube" : newLesson.videoKind,
      year: normalizeText(newLesson.year), 
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

  const handleDeleteSingleCode = (codeId, usedById) => {
    confirmAction("تأكيد الحذف", "سيتم إلغاء تفعيل الطالب المرتبط به.", async () => {
      const batch = writeBatch(db);
      batch.delete(doc(db, "codes", codeId));
      if (usedById) batch.update(doc(db, "students", usedById), { isSubscribed: false, usedCode: "" });
      await batch.commit();
    }, true);
  };

  const deleteAllCodes = () => {
    confirmAction("تطهير شامل ⚠️", "سيتم حذف كل الأكواد وإلغاء تفعيل كل الطلاب!", async () => {
      const batch = writeBatch(db);
      codesDB.forEach(c => batch.delete(doc(db, "codes", c.id)));
      studentsDB.forEach(s => batch.update(doc(db, "students", s.id), { isSubscribed: false, usedCode: "" }));
      await batch.commit();
    }, true);
  };

  // --- واجهات العرض (Render) ---
  const renderStats = () => (
    <ScrollView style={styles.content}>
      <View style={styles.statsHeaderContainer}>
        <Image 
          source={require('../icon.png')} 
          style={styles.mainLogo} 
          resizeMode="contain" 
        />
        <Text style={styles.welcomeText}>مرحباً بك في لوحة التحكم 👋</Text>
      </View>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}><Text style={styles.statNum}>{studentsDB.length}</Text><Text style={styles.statLabel}>طالب مسجل</Text></View>
        <View style={styles.statCard}><Text style={styles.statNum}>{lessons.length}</Text><Text style={styles.statLabel}>محاضرة</Text></View>
        <View style={styles.statCard}><Text style={styles.statNum}>{codesDB.filter(c=>!c.isUsed).length}</Text><Text style={styles.statLabel}>كود متاح</Text></View>
        <View style={styles.statCard}><Text style={styles.statNum}>{codesDB.filter(c=>c.isUsed).length}</Text><Text style={styles.statLabel}>كود مستخدم</Text></View>
      </View>
    </ScrollView>
  );

  const renderAddLesson = () => (
    <ScrollView style={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>نشر محتوى جديد</Text>
        <TextInput style={styles.input} placeholder="عنوان المحاضرة" placeholderTextColor={COLORS.subText} value={newLesson.title} onChangeText={t => setNewLesson({...newLesson, title: t})} />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="وصف مختصر يظهر للطالب تحت اسم الفيديو"
          placeholderTextColor={COLORS.subText}
          multiline
          value={newLesson.description}
          onChangeText={t => setNewLesson({...newLesson, description: t})}
        />
        <Text style={styles.label}>الفرقة:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexDirection: 'row-reverse', marginBottom: 15}}>
          {['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'].map(y => (
            <TouchableOpacity key={y} style={[styles.chip, newLesson.year === y && styles.chipActive]} onPress={() => setNewLesson({...newLesson, year: y})}><Text style={styles.chipText}>{y}</Text></TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.label}>المادة:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexDirection: 'row-reverse', marginBottom: 15}}>
          {subjects.map(s => (
            <TouchableOpacity key={s.id} style={[styles.chip, newLesson.subject === s.name && styles.chipActive]} onPress={() => setNewLesson({...newLesson, subject: s.name})}><Text style={styles.chipText}>{s.name}</Text></TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.label}>نوع رابط الفيديو:</Text>
        <View style={styles.optionRow}>
          {[
            { id: 'direct', label: 'رابط مباشر' },
            { id: 'youtube', label: 'يوتيوب' },
          ].map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[styles.optionChip, newLesson.videoKind === option.id && styles.optionChipActive]}
              onPress={() => setNewLesson({ ...newLesson, videoKind: option.id })}
            >
              <Text style={[styles.optionChipText, newLesson.videoKind === option.id && styles.optionChipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder={newLesson.videoKind === 'youtube' ? 'رابط فيديو يوتيوب' : 'رابط الفيديو المباشر'}
          placeholderTextColor={COLORS.subText}
          value={newLesson.url}
          onChangeText={t => setNewLesson({...newLesson, url: t})}
        />
        <TextInput
          style={styles.input}
          placeholder="رابط الملزمة PDF أو Google Drive"
          placeholderTextColor={COLORS.subText}
          value={newLesson.pdfUrl}
          onChangeText={t => setNewLesson({...newLesson, pdfUrl: t})}
        />
        <View style={styles.uploadGrid}>
           <TouchableOpacity style={styles.uploadBox} onPress={() => uploadFileToBunny('video')}>
              <FontAwesome5 name="video" color={COLORS.gold} size={24} />
              <Text style={styles.uploadText}>{isUploading.video ? "جاري الرفع.." : (newLesson.url ? "تم تجهيز الرابط" : "أو ارفع فيديو مباشر")}</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.uploadBox} onPress={() => uploadFileToBunny('pdf')}>
              <FontAwesome5 name="file-pdf" color={COLORS.red} size={24} />
              <Text style={styles.uploadText}>{isUploading.pdf ? "جاري الرفع.." : (newLesson.pdfUrl ? "تم تجهيز الملزمة" : "أو ارفع ملف PDF")}</Text>
           </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.mainBtn} onPress={saveLesson}><Text style={styles.mainBtnText}>نشر المحاضرة الآن</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );

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
            <TouchableOpacity onPress={() => handleDeleteSingleCode(item.id, item.usedById)} style={{position: 'absolute', top: 5, left: 5}}><FontAwesome5 name="times" color={COLORS.red} size={12} opacity={0.5}/></TouchableOpacity>
          </View>
        )}
      />
    </View>
  );

  const renderSubjects = () => (
    <ScrollView style={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📚 إدارة المواد</Text>
        <View style={{flexDirection: 'row-reverse', gap: 10, marginBottom: 20}}>
          <TextInput style={[styles.input, {flex: 1, marginBottom: 0}]} placeholder="اسم المادة الجديدة" placeholderTextColor={COLORS.subText} value={newSubject} onChangeText={setNewSubject} />
          <TouchableOpacity style={[styles.mainBtn, {width: 100, padding: 0, justifyContent: 'center'}]} onPress={handleAddSubject}><Text style={styles.mainBtnText}>إضافة</Text></TouchableOpacity>
        </View>
        {subjects.map(sub => (
          <View key={sub.id} style={styles.listItem}>
            <Text style={{color: COLORS.text, textAlign: 'right', flex: 1}}>{sub.name}</Text>
            <TouchableOpacity onPress={() => confirmAction('حذف؟', '', () => deleteDoc(doc(db, "subjects", sub.id)), true)}><FontAwesome5 name="trash" color={COLORS.red} size={16}/></TouchableOpacity>
          </View>
        ))}
      </View>
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

      <View style={{flex: 1}}>
        {activeTab === 'stats' && renderStats()}
        {activeTab === 'add_lesson' && renderAddLesson()}
        {activeTab === 'subjects' && renderSubjects()}
        {activeTab === 'lessons' && renderLessons()}
        {activeTab === 'students' && renderStudents()}
        {activeTab === 'codes' && renderCodes()}
        {activeTab === 'logs' && renderLogs()}
      </View>

      <View style={styles.bottomNavContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bottomNavScroll}>
          {[
            { id: 'logs', icon: 'shield-alt', label: 'رقابة', color: COLORS.red },
            { id: 'codes', icon: 'ticket-alt', label: 'أكواد' },
            { id: 'students', icon: 'users', label: 'طلاب' },
            { id: 'lessons', icon: 'play-circle', label: 'محاضرات' },
            { id: 'subjects', icon: 'book', label: 'مواد' },
            { id: 'add_lesson', icon: 'plus-circle', label: 'نشر' },
            { id: 'stats', icon: 'chart-pie', label: 'الرئيسية' },
          ].map(item => (
            <TouchableOpacity key={item.id} style={styles.navItem} onPress={() => setActiveTab(item.id)}>
              <View style={[styles.iconWrapper, activeTab === item.id && styles.iconWrapperActive]}>
                <FontAwesome5 name={item.icon} color={activeTab === item.id ? COLORS.gold : (item.color || COLORS.subText)} size={18} />
              </View>
              <Text style={[styles.navLabel, { color: activeTab === item.id ? COLORS.gold : (item.color || COLORS.subText) }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
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
    fontSize: 16, 
    fontWeight: 'bold', 
    color: '#fff',
    flex: 1,
    textAlign: 'center'
  },
  headerLogo: {
    width: 35,
    height: 35,
  },
  content: { flex: 1, padding: 15 },
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
  welcomeText: { color: COLORS.gold, fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: { width: '48%', backgroundColor: COLORS.card, padding: 20, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', marginBottom: 15 },
  statNum: { color: COLORS.gold, fontSize: 24, fontWeight: 'bold' },
  statLabel: { color: COLORS.text, marginTop: 5, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: COLORS.card, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 15 },
  cardTitle: { color: COLORS.gold, fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'right' },
  label: { color: COLORS.text, marginBottom: 8, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: COLORS.cardAlt || '#fff', color: COLORS.text, padding: 12, borderRadius: 12, marginBottom: 15, textAlign: 'right', borderWidth: 1, borderColor: COLORS.border },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  chip: { paddingHorizontal: 15, paddingVertical: 8, backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 20, marginLeft: 8, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.gold + '22' },
  chipText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  optionRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 15 },
  optionChip: { flex: 1, paddingVertical: 12, backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  optionChipActive: { backgroundColor: COLORS.gold + '22', borderColor: COLORS.gold },
  optionChipText: { color: COLORS.subText, fontWeight: '700' },
  optionChipTextActive: { color: COLORS.gold },
  uploadGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 10 },
  uploadBox: { flex: 1, height: 90, backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  uploadText: { color: COLORS.text, fontSize: 10, marginTop: 8, fontWeight: '700' },
  mainBtn: { backgroundColor: COLORS.gold, padding: 15, borderRadius: 12, alignItems: 'center' },
  mainBtnText: { color: '#000', fontWeight: 'bold' },
  listItem: { backgroundColor: COLORS.card, padding: 15, borderRadius: 15, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  iconBtn: { padding: 8, backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 8 },
  lessonCard: { width: '48%', backgroundColor: COLORS.card, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, marginBottom: 15 },
  videoPlaceholder: { width: '100%', height: 100, backgroundColor: COLORS.cardAlt || '#fff', position: 'relative' },
  badge: { position: 'absolute', top: 5, left: 5, backgroundColor: COLORS.red, paddingHorizontal: 5, borderRadius: 5 },
  actionBtn: { flex: 1, padding: 8, borderRadius: 8, alignItems: 'center' },
  metaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaBadge: { backgroundColor: COLORS.cardAlt || '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  metaBadgeText: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  codeCard: { width: '48%', padding: 15, backgroundColor: COLORS.card, borderWidth: 1, borderRadius: 15, alignItems: 'center', marginBottom: 15, position: 'relative' },
  bottomNavContainer: { backgroundColor: COLORS.bottomBar || COLORS.card, borderTopWidth: 1, borderColor: COLORS.border, paddingBottom: Platform.OS === 'ios' ? 20 : 10 },
  bottomNavScroll: { flexDirection: 'row-reverse', paddingHorizontal: 10, alignItems: 'center', height: 70 },
  navItem: { alignItems: 'center', marginHorizontal: 12, minWidth: 50 },
  iconWrapper: { padding: 8, borderRadius: 12 },
  iconWrapperActive: { backgroundColor: COLORS.gold + '22' },
  navLabel: { fontSize: 10, marginTop: 2, fontWeight: 'bold' },
  statusBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.cardAlt, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statusBtnText: { fontSize: 11, fontWeight: 'bold', color: COLORS.text },
}); }