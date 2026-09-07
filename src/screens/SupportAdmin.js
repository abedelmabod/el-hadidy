import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, 
  TouchableOpacity, Alert, Modal, ActivityIndicator, 
  SafeAreaView, ScrollView, Dimensions, Image, StatusBar, Platform,
  KeyboardAvoidingView
} from 'react-native';
import { auth, db } from '../firebase';
import { 
  collection, query, onSnapshot, doc, 
  updateDoc, orderBy 
} from 'firebase/firestore';
import { FontAwesome5, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import ThemeToggleButton from '../components/ThemeToggleButton';
import * as Clipboard from 'expo-clipboard';
import { sendSharedPasswordResetEmail } from '../services/auth-service';

const { width } = Dimensions.get('window');

export default function SupportAdmin({ setUser, theme, themeMode, toggleTheme }) {
  const COLORS = {
    text: theme.text,
    gold: theme.accent,
    goldDark: theme.accentAlt,
    bg: theme.bg,
    card: theme.card,
    cardAlt: theme.cardAlt,
    border: theme.border,
    danger: theme.danger,
    success: theme.success,
    textSub: theme.subText,
    buttonText: theme.buttonText,
    overlay: theme.overlay,
    shadow: theme.shadow,
  };

  const styles = createStyles(COLORS);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('الكل');

  const tabs = ['الكل', 'الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];

  useEffect(() => {
    const q = query(collection(db, "students"), orderBy("name"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const copyToClipboard = async (text, label) => {
    await Clipboard.setStringAsync(text);
    Alert.alert("تم النسخ", `تم نسخ ${label} إلى الحافظة`);
  };

  const filteredStudents = students.filter(s => {
    const matchSearch = s.name?.toLowerCase().includes(search.toLowerCase()) || 
                        s.username?.toLowerCase().includes(search.toLowerCase()) ||
                        s.phone?.includes(search);
    const matchTab = activeTab === 'الكل' || s.year === activeTab;
    return matchSearch && matchTab;
  });

  const stats = {
    total: students.length,
    banned: students.filter(s => s.isBanned).length,
    active: students.filter(s => !s.isBanned).length
  };

  const updateStudentStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "students", id), { isBanned: status });
      Alert.alert("تم", status ? "تم الحظر بنجاح" : "تم التفعيل بنجاح");
    } catch (e) { Alert.alert("خطأ", "فشل التحديث"); }
  };

  const resetDevices = async (id) => {
    Alert.alert("تأكيد", "هل أنت متأكد من تصفير جهاز الطالب؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "تصفير", onPress: async () => {
          try {
            await updateDoc(doc(db, "students", id), { deviceId: null, deviceType: null, deviceInfo: null });
            Alert.alert("نجاح", "تم تصفير ارتباط الجهاز");
          } catch (e) { Alert.alert("خطأ", "فشل العملية"); }
      }}
    ]);
  };

  const sendPasswordReset = async (student) => {
    if (!student?.email) {
      Alert.alert('تنبيه', 'لا يوجد بريد إلكتروني حقيقي لهذا الطالب.');
      return;
    }

    setPasswordResetLoading(true);
    try {
      await sendSharedPasswordResetEmail({ auth, db }, student.email);
      Alert.alert('تم الإرسال', 'تم إرسال رابط إعادة تعيين كلمة المرور إلى البريد المرتبط بحساب الطالب.');
    } catch (error) {
      Alert.alert('تعذر الإرسال', error?.message || 'لا يمكن إرسال رابط إعادة التعيين الآن.');
    } finally {
      setPasswordResetLoading(false);
    }
  };

  // --- المكونات الفرعية داخل النطاق (Scoped Components) ---
  const StatCard = ({ label, value, icon, color }) => (
    <View style={styles.statCard}>
        <FontAwesome5 name={icon} size={14} color={color} />
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const ControlBtn = ({ title, icon, color, onPress }) => (
    <TouchableOpacity style={[styles.controlBtn, { borderColor: color }]} onPress={onPress}>
        <Ionicons name={icon} size={20} color={color} />
        <Text style={[styles.controlBtnText, { color }]}>{title}</Text>
    </TouchableOpacity>
  );

  const renderStudentCard = ({ item, index }) => (
    <Animated.View 
      entering={FadeInDown.delay(index * 50).duration(400)}
      layout={Layout.springify()}
    >
      <TouchableOpacity 
        style={[styles.card, item.isBanned && styles.bannedCard]} 
        onLongPress={() => copyToClipboard(item.username, "اسم المستخدم")}
        onPress={() => { setSelectedStudent(item); setModalVisible(true); }}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusDot, { backgroundColor: item.isBanned ? COLORS.danger : COLORS.success }]} />
          <Text style={styles.studentName}>{item.name}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.badgeRow}>
             <View style={styles.miniBadge}><Text style={styles.miniBadgeText}>{item.year}</Text></View>
             <Text style={styles.cardInfo}>@{item.username}</Text>
          </View>
          <Text style={styles.cardInfo}>{item.phone || 'لا يوجد رقم هاتف'}</Text>
        </View>
        <Ionicons name="chevron-back-circle" size={24} color={COLORS.gold} style={styles.arrow} />
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={styles.safeArea}>
        
        <View style={styles.header}>
           <View style={styles.headerTop}>
              <TouchableOpacity onPress={() => setUser(null)} style={styles.powerBtn}>
                  <MaterialCommunityIcons name="power" size={24} color={COLORS.buttonText} />
              </TouchableOpacity>
              <View style={styles.headerInfo}>
                  <Text style={styles.headerSubtitle}>إدارة المنصة</Text>
                  <Text style={styles.headerTitle}>الدعم الفني</Text>
              </View>
              <ThemeToggleButton mode={themeMode} onPress={toggleTheme} theme={theme} />
           </View>

           <View style={styles.statsRow}>
              <StatCard label="الكل" value={stats.total} icon="users" color={COLORS.gold} />
              <StatCard label="نشط" value={stats.active} icon="check-circle" color={COLORS.success} />
              <StatCard label="محظور" value={stats.banned} icon="user-slash" color={COLORS.danger} />
           </View>

           <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={COLORS.textSub} style={styles.searchIcon} />
              <TextInput 
                placeholder="ابحث عن طالب أو رقم هاتف..." 
                placeholderTextColor={COLORS.textSub}
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
              />
           </View>
        </View>

        <View style={styles.tabsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
              {tabs.map(tab => (
                  <TouchableOpacity 
                      key={tab} 
                      style={[styles.tabBtn, activeTab === tab && styles.activeTabBtn]} 
                      onPress={() => setActiveTab(tab)}
                  >
                      <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.gold} size="large" style={{ marginTop: 50 }} />
        ) : (
          <FlatList 
            data={filteredStudents}
            keyExtractor={item => item.id}
            renderItem={renderStudentCard}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={<Text style={styles.emptyText}>لا يوجد نتائج للبحث</Text>}
          />
        )}

        <Modal visible={modalVisible} animationType="fade" transparent>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <Animated.View entering={FadeInDown} style={styles.modalContent}>
              <View style={styles.modalIndicator} />
              
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              <Text style={styles.modalTitle}>بيانات الطالب</Text>
              </View>

              {selectedStudent && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.profileSection}>
                      <View style={styles.avatarCircle}>
                         <Text style={styles.avatarText}>{selectedStudent.name.charAt(0)}</Text>
                      </View>
                      <Text style={styles.infoName}>{selectedStudent.name}</Text>
                      <TouchableOpacity onPress={() => copyToClipboard(selectedStudent.username, "اليوزر")}>
                        <Text style={styles.infoUser}>@{selectedStudent.username} <Ionicons name="copy-outline" size={12} /></Text>
                      </TouchableOpacity>
                      <Text style={styles.infoUser}>{selectedStudent.phone || 'لا يوجد رقم هاتف'}</Text>
                  </View>

                  <View style={styles.controlGrid}>
                      <ControlBtn 
                        title="تصفير الجهاز" 
                        icon="device-mobile" 
                        color={COLORS.gold} 
                        onPress={() => resetDevices(selectedStudent.id)} 
                      />
                      <ControlBtn 
                        title={selectedStudent.isBanned ? "تفعيل" : "حظر"} 
                        icon={selectedStudent.isBanned ? "unlock" : "lock-closed"} 
                        color={selectedStudent.isBanned ? COLORS.success : COLORS.danger} 
                        onPress={() => updateStudentStatus(selectedStudent.id, !selectedStudent.isBanned)} 
                      />
                  </View>

                  <View style={styles.passwordCard}>
                      <Text style={styles.cardLabel}>استعادة كلمة المرور</Text>
                      <Text style={styles.passLabel}>لا يتم عرض أو حفظ كلمة مرور الطالب داخل قاعدة البيانات. يتم إرسال رابط آمن لإعادة التعيين عبر Firebase Auth.</Text>
                      <TouchableOpacity
                        style={[styles.updateBtn, passwordResetLoading && { opacity: 0.6 }]}
                        disabled={passwordResetLoading}
                        onPress={() => sendPasswordReset(selectedStudent)}
                      >
                          {passwordResetLoading ? (
                            <ActivityIndicator color={COLORS.buttonText} />
                          ) : (
                            <Text style={styles.updateBtnText}>إرسال رابط إعادة التعيين</Text>
                          )}
                      </TouchableOpacity>
                  </View>
                  <View style={{height: 30}} />
                </ScrollView>
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

function createStyles(COLORS) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg, direction: 'rtl' },
    safeArea: { flex: 1, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    header: { 
        padding: 20, 
        backgroundColor: COLORS.card, 
        borderBottomLeftRadius: 30, 
        borderBottomRightRadius: 30,
        elevation: 10,
        shadowColor: COLORS.shadow || COLORS.text,
        shadowOpacity: 0.2,
        shadowRadius: 10
    },
    headerTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerInfo: { alignItems: 'flex-end' },
    headerTitle: { color: COLORS.text, fontSize: 24, fontWeight: '900' },
    headerSubtitle: { color: COLORS.gold, fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
    powerBtn: { backgroundColor: COLORS.danger, padding: 8, borderRadius: 12 },
    
    statsRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 20 },
    statCard: { backgroundColor: COLORS.bg, width: '30%', padding: 12, borderRadius: 18, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
    statValue: { color: COLORS.text, fontSize: 18, fontWeight: '900', marginVertical: 2 },
    statLabel: { color: COLORS.textSub, fontSize: 12, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },

    searchContainer: { 
        flexDirection: 'row-reverse', 
        alignItems: 'center', 
        backgroundColor: COLORS.cardAlt, 
        borderRadius: 15, 
        paddingHorizontal: 15, 
        height: 50 
    },
    searchIcon: { marginLeft: 10 },
    searchInput: { flex: 1, color: COLORS.text, textAlign: 'right', writingDirection: 'rtl', fontSize: 16, fontWeight: '700' },

    tabsWrapper: { paddingVertical: 15 },
    tabsScroll: { paddingHorizontal: 15 },
    tabBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginLeft: 8, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
    activeTabBtn: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
    tabText: { color: COLORS.textSub, fontSize: 13, fontWeight: '900' },
    activeTabText: { color: COLORS.buttonText },

    listContainer: { padding: 15, paddingBottom: 30 },
    card: { 
        backgroundColor: COLORS.card, 
        borderRadius: 22, 
        padding: 15, 
        marginBottom: 12, 
        borderWidth: 1, 
        borderColor: COLORS.border,
        flexDirection: 'column'
    },
    bannedCard: { borderColor: COLORS.danger + '50', opacity: 0.8 },
    cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 8 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 10 },
    studentName: { color: COLORS.text, fontSize: 18, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },
    badgeRow: { flexDirection: 'row-reverse', alignItems: 'center' },
    miniBadge: { backgroundColor: COLORS.gold + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 10 },
    miniBadgeText: { color: COLORS.gold, fontSize: 11, fontWeight: '900' },
    cardInfo: { color: COLORS.textSub, fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
    arrow: { position: 'absolute', right: 15, top: '40%' },
    emptyText: { color: COLORS.textSub, textAlign: 'center', writingDirection: 'rtl', marginTop: 40 },

    modalOverlay: { flex: 1, backgroundColor: COLORS.overlay || COLORS.bg + 'E6', justifyContent: 'flex-end' },
    modalContent: { 
        backgroundColor: COLORS.card, 
        borderTopLeftRadius: 40, 
        borderTopRightRadius: 40, 
        padding: 20, 
        maxHeight: '90%' 
    },
    modalIndicator: { width: 40, height: 5, backgroundColor: COLORS.border, alignSelf: 'center', borderRadius: 10, marginBottom: 15 },
    modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    closeBtn: { padding: 5 },
    modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', textAlign: 'right', writingDirection: 'rtl' },
    
    profileSection: { alignItems: 'center', marginBottom: 25 },
    avatarCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    avatarText: { color: COLORS.buttonText, fontSize: 30, fontWeight: 'bold' },
    infoName: { color: COLORS.text, fontSize: 20, fontWeight: 'bold', textAlign: 'center', writingDirection: 'rtl' },
    infoUser: { color: COLORS.gold, fontSize: 15, fontWeight: '800', textAlign: 'center', writingDirection: 'rtl' },

    controlGrid: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 25 },
    controlBtn: { width: '48%', padding: 15, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'center' },
    controlBtnText: { marginRight: 8, fontWeight: 'bold' },

    passwordCard: { backgroundColor: COLORS.cardAlt, padding: 20, borderRadius: 25 },
    cardLabel: { color: COLORS.text, fontWeight: 'bold', marginBottom: 15, textAlign: 'right', writingDirection: 'rtl' },
    currentPassBox: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 20, backgroundColor: COLORS.bg, padding: 15, borderRadius: 15 },
    passValue: { color: COLORS.success, fontSize: 18, fontWeight: 'bold' },
    passLabel: { color: COLORS.textSub, fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
    modalInput: { backgroundColor: COLORS.bg, borderRadius: 15, padding: 15, color: COLORS.text, textAlign: 'right', writingDirection: 'rtl', marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
    updateBtn: { backgroundColor: COLORS.gold, padding: 15, borderRadius: 15, alignItems: 'center' },
    updateBtnText: { color: COLORS.buttonText, fontWeight: 'bold', textAlign: 'center', writingDirection: 'rtl' }
  });
}
