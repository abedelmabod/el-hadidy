import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 } from '@expo/vector-icons';
import * as ScreenCapture from 'expo-screen-capture';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { app, auth, db, storage } from '../firebase';
import ThemeToggleButton from '../components/ThemeToggleButton';
import ThemePickerModal from '../components/ThemePickerModal';
import { THEME_CHOICES } from '../theme/theme-config';
import {
  keepEnglishDigitsOnly,
  isValidEmail,
  normalizeEnglishDigits,
  registerStudentWithCode,
  sendSharedPasswordResetEmail,
  SharedAuthError,
  signInWithSharedCredentials,
} from '../services/auth-service';
import { getClientDevice } from '../utils/deviceIdentity';
const { width } = Dimensions.get('window');

const OFFICIAL_LINKS = {
  privacy: 'https://el-hadidy-ei6w.vercel.app/privacy',
  terms: 'https://el-hadidy-ei6w.vercel.app/terms',
  deleteAccount: 'https://el-hadidy-ei6w.vercel.app/delete-account',
};

const EDUCATION_TYPES = [
  {
    key: 'college',
    label: 'المرحلة الجامعية',
    icon: 'university',
    years: ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'],
  },
  {
    key: 'secondary',
    label: 'المرحلة الثانوية',
    icon: 'school',
    years: ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي'],
  },
];

export default function LoginScreen({
  navigation,
  setUser,
  user,
  theme,
  themeMode,
  themeOptions,
  toggleTheme,
  selectThemeMode,
}) {
  const COLORS = {
    bg: theme.bg,
    card: theme.card,
    cardAlt: theme.cardAlt,
    accent: theme.accent,
    accentAlt: theme.accentAlt,
    text: theme.text,
    subText: theme.subText,
    border: theme.border,
    danger: theme.danger,
    buttonText: theme.buttonText,
    shadow: theme.shadow,
  };

  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const availableThemeOptions = themeOptions?.length ? themeOptions : THEME_CHOICES;
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [regData, setRegData] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    educationType: 'college',
    year: 'الفرقة الأولى',
    code: '',
  });

  const selectedEducationType =
    EDUCATION_TYPES.find((type) => type.key === regData.educationType) || EDUCATION_TYPES[0];
  const years = selectedEducationType.years;
  const styles = createStyles(COLORS);

  const chooseTheme = (nextThemeMode) => {
    if (typeof selectThemeMode === 'function') {
      selectThemeMode(nextThemeMode);
    } else if (typeof toggleTheme === 'function') {
      toggleTheme(nextThemeMode);
    }
    setThemePickerVisible(false);
  };

  useEffect(() => {
    const screenshotsAllowed =
      user?.allowScreenshots === true ||
      user?.screenshotAllowed === true ||
      user?.canTakeScreenshots === true;

    let subscription;
    if (user?.role === 'student' && !screenshotsAllowed) {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      subscription = ScreenCapture.addScreenshotListener(async () => {
        handleAutoBan(user.id, user.name);
      });
    } else {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    }

    return () => {
      subscription?.remove();
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, [user]);

  const handleAutoBan = async (userId, userName) => {
    try {
      const studentRef = doc(db, 'students', userId);
      await updateDoc(studentRef, {
        isBanned: true,
        banReason: 'محاولة تصوير الشاشة',
      });

      await addDoc(collection(db, 'security_logs'), {
        studentId: userId,
        studentName: userName,
        action: 'محاولة تصوير شاشة - تم الحظر',
        timestamp: serverTimestamp(),
      });

      Alert.alert('تنبيه أمني', 'تم حظر حسابك تلقائياً لمخالفة سياسة الأمان.', [
        { text: 'خروج', onPress: () => setUser(null) },
      ]);
    } catch (error) {
      console.error('Ban Error:', error);
    }
  };

  const handleLogin = async () => {
    const identifier = normalizeEnglishDigits(formData.username).trim().toLowerCase();
    const password = formData.password.trim();

    if (!identifier || !password) {
      return Alert.alert('تنبيه', 'من فضلك أدخل اسم المستخدم وكلمة المرور');
    }

    setLoading(true);
    try {
      const result = await signInWithSharedCredentials(
        { app, auth, db, storage },
        { identifier, password, device: await getClientDevice() }
      );

      setUser(result.user);
    } catch (error) {
      if (error instanceof SharedAuthError && error.code === 'DEVICE_MISMATCH') {
        Alert.alert('تنبيه الأمان', 'هذا الحساب مسجل مسبقاً على جهاز آخر.');
      } else {
        Alert.alert('فشل الدخول', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = normalizeEnglishDigits(resetEmail).trim().toLowerCase();

    if (!email) {
      return Alert.alert('تنبيه', 'اكتب البريد الإلكتروني المرتبط بحسابك أولا.');
    }

    if (!isValidEmail(email)) {
      return Alert.alert('تنبيه', 'برجاء إدخال بريد إلكتروني صحيح.');
    }

    setLoading(true);
    try {
      await sendSharedPasswordResetEmail({ auth, db }, email);
      setForgotModalVisible(false);
      setResetEmail('');
      Alert.alert('تم الإرسال', 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.');
    } catch (error) {
      Alert.alert('تعذر الإرسال', error?.message || 'لا يمكن إرسال رابط إعادة التعيين حاليا.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const { name, username, email, phone, password, educationType, year } = regData;
    const usernameClean = normalizeEnglishDigits(username).trim().toLowerCase();
    const emailClean = normalizeEnglishDigits(email).trim().toLowerCase();
    const phoneClean = keepEnglishDigitsOnly(phone);

    if (!name.trim() || !usernameClean || !emailClean || !phoneClean || !password.trim()) {
      return Alert.alert('تنبيه', 'من فضلك أكمل كل البيانات المطلوبة');
    }

    if (!isValidEmail(emailClean)) {
      return Alert.alert('تنبيه', 'برجاء إدخال بريد إلكتروني صحيح لاستخدامه في استعادة كلمة المرور.');
    }

    setLoading(true);
    try {
      const result = await registerStudentWithCode(
        { app, auth, db, storage },
        {
          name: name.trim(),
          username: usernameClean,
          email: emailClean,
          phone: phoneClean,
          password: password.trim(),
          educationType,
          year,
          device: await getClientDevice(),
        }
      );

      Alert.alert('تم', 'تم إنشاء الحساب بنجاح. يمكنك استخدام رمز التسجيل داخل المنصة إذا طُلب منك ذلك.');
      setUser(result.user);
    } catch (error) {
      Alert.alert('خطأ في التسجيل', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        
        {/* زر تغيير المظهر (Theme Toggle) */}
        <View style={styles.topBar}>
          <ThemeToggleButton mode={themeMode} onPress={() => setThemePickerVisible(true)} theme={theme} />
        </View>

        {/* الكارت الأساسي مع حركة تغيير الحجم التلقائية عند التبديل */}
        <View style={styles.card}>
          <LinearGradient colors={theme.gradient || [COLORS.accent, COLORS.accentAlt]} style={styles.hero}>
            {/* أنيميشن اللوجو عند الفتح */}
            <View style={styles.heroLogo}>
              <Image source={require('../../assets/logo-main-transparent.png')} style={styles.logoImage} resizeMode="contain" />
            </View>
            
            {/* <Text style={styles.heroTitle}>
              الحديدي
            </Text> */}
            <Text style={styles.heroSubtitle}>
              {isRegistering ? 'إنشاء حساب جديد للمنصة' : 'مرحباً بك  في منصتك'}
            </Text>
          </LinearGradient>

          {!isRegistering ? (
            // نموذج تسجيل الدخول
            <View style={styles.form}>
              <View style={styles.inputWrapper}>
                <FontAwesome5 name="user" size={16} color={COLORS.subText} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="اسم المستخدم"
                  placeholderTextColor={COLORS.subText}
                  autoCapitalize="none"
                  value={formData.username}
                  onChangeText={(text) => setFormData({ ...formData, username: normalizeEnglishDigits(text) })}
                />
              </View>

              <View style={styles.inputWrapper}>
                <TouchableOpacity onPress={() => setShowPassword((value) => !value)} style={styles.inputIcon}>
                  <FontAwesome5 name={showPassword ? 'eye' : 'eye-slash'} size={16} color={COLORS.subText} />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  placeholder="كلمة المرور"
                  placeholderTextColor={COLORS.subText}
                  secureTextEntry={!showPassword}
                  value={formData.password}
                  onChangeText={(text) => setFormData({ ...formData, password: text })}
                />
              </View>

              <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.88}>
                <LinearGradient colors={[COLORS.accent, COLORS.accentAlt]} style={styles.button}>
                  {loading ? (
                    <ActivityIndicator color={COLORS.buttonText} />
                  ) : (
                    <Text style={styles.btnText}>دخول المنصة</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setResetEmail(formData.username.includes('@') ? formData.username.trim().toLowerCase() : '');
                  setForgotModalVisible(true);
                }}
                disabled={loading}
                activeOpacity={0.75}
              >
                <Text style={styles.forgotPasswordText}>نسيت كلمة المرور؟</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsRegistering(true)} activeOpacity={0.7}>
                <Text style={styles.switchText}>
                  ليس لديك حساب؟ <Text style={styles.highlightText}>سجّل الآن</Text>
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            // نموذج إنشاء حساب
            <View style={styles.form}>
              <TextInput
                style={styles.inputAlt}
                placeholder="الاسم الكامل (كما في البطاقة)"
                placeholderTextColor={COLORS.subText}
                value={regData.name}
                onChangeText={(text) => setRegData({ ...regData, name: text })}
              />
              <TextInput
                style={styles.inputAlt}
                placeholder="اسم المستخدم (للدخول به لاحقاً)"
                placeholderTextColor={COLORS.subText}
                autoCapitalize="none"
                value={regData.username}
                onChangeText={(text) => setRegData({ ...regData, username: normalizeEnglishDigits(text) })}
              />
              <TextInput
                style={styles.inputAlt}
                placeholder="البريد الإلكتروني الحقيقي"
                placeholderTextColor={COLORS.subText}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                value={regData.email}
                onChangeText={(text) => setRegData({ ...regData, email: normalizeEnglishDigits(text).trim().toLowerCase() })}
              />
              <TextInput
                style={styles.inputAlt}
                placeholder="رقم الهاتف"
                placeholderTextColor={COLORS.subText}
                keyboardType="phone-pad"
                value={regData.phone}
                onChangeText={(text) => setRegData({ ...regData, phone: keepEnglishDigitsOnly(text) })}
              />
              <TextInput
                style={styles.inputAlt}
                placeholder="كلمة المرور"
                placeholderTextColor={COLORS.subText}
                secureTextEntry
                value={regData.password}
                onChangeText={(text) => setRegData({ ...regData, password: text })}
              />

              <Text style={styles.sectionLabel}>اختار المرحلة</Text>
              <View style={styles.studyTypeContainer}>
                {EDUCATION_TYPES.map((type) => {
                  const active = regData.educationType === type.key;

                  return (
                    <TouchableOpacity
                      key={type.key}
                      style={[styles.studyTypeBtn, active && styles.studyTypeBtnActive]}
                      onPress={() => setRegData({
                        ...regData,
                        educationType: type.key,
                        year: type.years[0],
                      })}
                      activeOpacity={0.75}
                    >
                      <FontAwesome5
                        name={type.icon}
                        size={14}
                        color={active ? COLORS.buttonText : COLORS.accent}
                      />
                      <Text style={[styles.studyTypeText, active && styles.studyTypeTextActive]}>
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>
                اختار السنة الدراسية
              </Text>
              <View style={styles.yearContainer}>
                {years.map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[styles.yearBtn, regData.year === year && styles.yearBtnActive]}
                    onPress={() => setRegData({ ...regData, year })}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.yearBtnText, regData.year === year && styles.yearBtnTextActive]}>
                      {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity onPress={handleRegister} disabled={loading} activeOpacity={0.88}>
                <LinearGradient colors={[COLORS.accent, COLORS.accentAlt]} style={styles.button}>
                  {loading ? (
                    <ActivityIndicator color={COLORS.buttonText} />
                  ) : (
                    <Text style={styles.btnText}>إنشاء الحساب</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsRegistering(false)} activeOpacity={0.7}>
                <Text style={styles.switchText}>
                  لديك حساب بالفعل؟ <Text style={styles.highlightText}>تسجيل الدخول</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* زر الدعم الفني بأنيميشن دخول من الأسفل */}
          <View>
            <TouchableOpacity onPress={() => navigation.navigate('Support')} style={styles.supportBtn} activeOpacity={0.6}>
              <FontAwesome5 name="headset" size={14} color={COLORS.subText} />
              <Text style={styles.supportText}> تواجه مشكلة؟ تواصل مع الدعم الفني</Text>
            </TouchableOpacity>
            <View style={styles.legalRow}>
              <TouchableOpacity onPress={() => Linking.openURL(OFFICIAL_LINKS.privacy)}>
                <Text style={styles.legalLink}>الخصوصية</Text>
              </TouchableOpacity>
              <Text style={styles.legalSep}>•</Text>
              <TouchableOpacity onPress={() => Linking.openURL(OFFICIAL_LINKS.terms)}>
                <Text style={styles.legalLink}>الشروط</Text>
              </TouchableOpacity>
              <Text style={styles.legalSep}>•</Text>
              <TouchableOpacity onPress={() => Linking.openURL(OFFICIAL_LINKS.deleteAccount)}>
                <Text style={styles.legalLink}>حذف الحساب</Text>
              </TouchableOpacity>
              <Text style={styles.legalSep}>•</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Legal', { type: 'Developer' })}>
                <Text style={styles.legalLink} numberOfLines={1}>{'عن\u00A0المطور'}</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </ScrollView>
      <Modal
        visible={forgotModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.resetCard}>
            <Text style={styles.resetTitle}>استعادة كلمة المرور</Text>
            <Text style={styles.resetText}>
              اكتب البريد الإلكتروني الحقيقي المرتبط بحسابك، وسنرسل لك رابط إعادة التعيين تلقائياً.
            </Text>
            <TextInput
              style={styles.resetInput}
              placeholder="البريد الإلكتروني"
              placeholderTextColor={COLORS.subText}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              value={resetEmail}
              onChangeText={(text) => setResetEmail(normalizeEnglishDigits(text).trim().toLowerCase())}
            />
            <TouchableOpacity onPress={handleForgotPassword} disabled={loading} activeOpacity={0.88}>
              <LinearGradient colors={[COLORS.accent, COLORS.accentAlt]} style={styles.button}>
                {loading ? (
                  <ActivityIndicator color={COLORS.buttonText} />
                ) : (
                  <Text style={styles.btnText}>إرسال رابط إعادة التعيين</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setForgotModalVisible(false);
                setResetEmail('');
              }}
              disabled={loading}
              activeOpacity={0.75}
            >
              <Text style={styles.resetCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ThemePickerModal
        visible={themePickerVisible}
        theme={theme}
        activeThemeMode={themeMode}
        themeOptions={availableThemeOptions}
        onSelectTheme={chooseTheme}
        onClose={() => setThemePickerVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(COLORS) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg, direction: 'rtl' },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 36 },
    topBar: { width: width * 0.9, maxWidth: 430, alignItems: 'flex-end', marginBottom: 12 },
    card: {
      backgroundColor: COLORS.card,
      width: width * 0.92,
      maxWidth: 430,
      borderRadius: 36,
      padding: 22,
      borderWidth: 1,
      borderColor: COLORS.border,
      shadowColor: COLORS.shadow || COLORS.accent,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 30,
      elevation: 12,
      overflow: 'hidden',
    },
    hero: {
      borderRadius: 28,
      alignItems: 'center',
      paddingTop: 36,
      paddingBottom: 32,
      paddingHorizontal: 20,
      marginBottom: 28,
    },
    heroLogoWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    heroLogoRing: {
      width: 200,
      height: 200,
      borderRadius: 40,
      backgroundColor: COLORS.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: COLORS.border,
      shadowColor: COLORS.shadow || COLORS.text,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 10,
    },
    heroLogo: {
      width: 190,
      height: 190,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoImage: { width: '100%', height: '100%' },
    heroDivider: {
      width: 48,
      height: 3,
      borderRadius: 99,
      backgroundColor: COLORS.border,
      marginVertical: 14,
    },
    heroTitle: { color: COLORS.buttonText, fontSize: 34, fontWeight: '900', textAlign: 'center', writingDirection: 'rtl', letterSpacing: 0 },
    heroSubtitle: { color: COLORS.buttonText, fontSize: 16, marginTop: 4, textAlign: 'center', writingDirection: 'rtl', fontWeight: '700', opacity: 0.86 },
    form: { width: '100%' },
    inputWrapper: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      backgroundColor: COLORS.cardAlt,
      borderRadius: 20, // جعل الحواف أكثر دائرية
      marginBottom: 16,
      paddingHorizontal: 18,
      height: 64,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    inputAlt: {
      backgroundColor: COLORS.cardAlt,
      borderRadius: 20,
      marginBottom: 14,
      paddingHorizontal: 18,
      height: 64,
      color: COLORS.text,
      textAlign: 'right',
      writingDirection: 'rtl',
      borderWidth: 1,
      borderColor: COLORS.border,
      fontSize: 16,
    },
    input: { flex: 1, color: COLORS.text, textAlign: 'right', writingDirection: 'rtl', fontSize: 16 },
    inputIcon: { marginLeft: 12 },
    sectionLabel: { color: COLORS.text, textAlign: 'right', writingDirection: 'rtl', marginBottom: 12, fontSize: 16, fontWeight: '900' },
    studyTypeContainer: { flexDirection: 'row-reverse', gap: 10, marginBottom: 18 },
    studyTypeBtn: {
      flex: 1,
      minHeight: 50,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 18,
      backgroundColor: COLORS.cardAlt,
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    studyTypeBtnActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
    studyTypeText: { color: COLORS.text, fontSize: 14, fontWeight: '900', textAlign: 'center', writingDirection: 'rtl' },
    studyTypeTextActive: { color: COLORS.buttonText },
    yearContainer: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
    yearBtn: {
      width: '48%',
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 18,
      marginBottom: 12,
      alignItems: 'center',
      backgroundColor: COLORS.cardAlt,
    },
    yearBtnActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
    yearBtnText: { color: COLORS.subText, fontSize: 14, fontWeight: '900', textAlign: 'center', writingDirection: 'rtl' },
    yearBtnTextActive: { color: COLORS.buttonText },
    button: { padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 10, shadowColor: COLORS.accent, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    btnText: { color: COLORS.buttonText, fontWeight: '900', fontSize: 18, textAlign: 'center', writingDirection: 'rtl' },
    forgotPasswordText: { color: COLORS.accent, textAlign: 'center', writingDirection: 'rtl', marginTop: 14, fontSize: 14, fontWeight: '900' },
    switchText: { color: COLORS.subText, textAlign: 'center', writingDirection: 'rtl', marginTop: 24, fontSize: 15, fontWeight: '700' },
    highlightText: { color: COLORS.accent, fontWeight: '900' },
    supportBtn: {
      flexDirection: 'row-reverse',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20,
      padding: 10,
    },
    supportText: { color: COLORS.subText, fontSize: 14, fontWeight: '800', textAlign: 'center', writingDirection: 'rtl' },
    modalOverlay: {
      flex: 1,
      backgroundColor: COLORS.overlay || 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 22,
    },
    resetCard: {
      width: '100%',
      maxWidth: 430,
      backgroundColor: COLORS.card,
      borderRadius: 26,
      padding: 22,
      borderWidth: 1,
      borderColor: COLORS.border,
      shadowColor: COLORS.shadow || COLORS.text,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.22,
      shadowRadius: 24,
      elevation: 12,
    },
    resetTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl', marginBottom: 8 },
    resetText: { color: COLORS.subText, fontSize: 14, lineHeight: 22, textAlign: 'right', writingDirection: 'rtl', marginBottom: 16 },
    resetInput: {
      backgroundColor: COLORS.cardAlt,
      borderRadius: 18,
      paddingHorizontal: 16,
      height: 58,
      color: COLORS.text,
      textAlign: 'right',
      writingDirection: 'rtl',
      borderWidth: 1,
      borderColor: COLORS.border,
      fontSize: 15,
      marginBottom: 4,
    },
    resetCancelText: { color: COLORS.subText, textAlign: 'center', writingDirection: 'rtl', marginTop: 14, fontSize: 15, fontWeight: '900' },
    legalRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 },
    legalLink: { color: COLORS.accent, fontSize: 13, fontWeight: '900', minWidth: 72, textAlign: 'center', writingDirection: 'rtl' },
    legalSep: { color: COLORS.subText, fontSize: 12 },
  });
}
