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
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as ScreenCapture from 'expo-screen-capture';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { app, auth, db, storage } from '../firebase';
import ThemeToggleButton from '../components/ThemeToggleButton';
import {
  registerStudentWithCode,
  SharedAuthError,
  signInWithSharedCredentials,
} from '../services/auth-service';
// استيراد مكتبة الأنيميشن
import Animated, { 
  FadeInDown, 
  FadeInUp, 
  ZoomIn, 
  Layout, 
  BounceIn 
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function LoginScreen({ navigation, setUser, user, theme, themeMode, toggleTheme }) {
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
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [regData, setRegData] = useState({
    name: '',
    username: '',
    phone: '',
    password: '',
    year: 'الفرقة الأولى',
    code: '',
  });

  const years = ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];
  const styles = createStyles(COLORS);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync();

    let subscription;
    if (user && user.role === 'student') {
      subscription = ScreenCapture.addScreenshotListener(async () => {
        handleAutoBan(user.id, user.name);
      });
    }

    return () => {
      subscription?.remove();
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

  const buildDevice = () => ({
    id: Device.osInternalBuildId || Device.modelName || Device.deviceName || 'unknown_device',
    type: Device.osName || Platform.OS,
    info: `${Device.brand || 'device'} ${Device.modelName || ''}`.trim(),
  });

  const handleLogin = async () => {
    const identifier = formData.username.trim().toLowerCase();
    const password = formData.password.trim();

    if (!identifier || !password) {
      return Alert.alert('تنبيه', 'من فضلك أدخل اسم المستخدم وكلمة المرور');
    }

    setLoading(true);
    try {
      const result = await signInWithSharedCredentials(
        { app, auth, db, storage },
        { identifier, password, device: buildDevice() }
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

  const handleRegister = async () => {
    const { name, username, phone, password, year } = regData;
    const usernameClean = username.trim().toLowerCase();

    if (!name.trim() || !usernameClean || !phone.trim() || !password.trim()) {
      return Alert.alert('تنبيه', 'من فضلك أكمل كل البيانات المطلوبة');
    }

    setLoading(true);
    try {
      const result = await registerStudentWithCode(
        { app, auth, db, storage },
        {
          name: name.trim(),
          username: usernameClean,
          phone: phone.trim(),
          password: password.trim(),
          year,
          device: buildDevice(),
        }
      );

      Alert.alert('تم', 'تم إنشاء الحساب بنجاح. يمكنك إرسال الكود من داخل المنصة للمراجعة.');
      setUser(result.user);
    } catch (error) {
      Alert.alert('خطأ في التسجيل', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {/* زر تغيير المظهر (Theme Toggle) */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.topBar}>
          <ThemeToggleButton mode={themeMode} onPress={toggleTheme} theme={theme} />
        </Animated.View>

        {/* الكارت الأساسي مع حركة تغيير الحجم التلقائية عند التبديل */}
        <Animated.View 
          layout={Layout.springify().damping(18).stiffness(90)} 
          style={styles.card}
        >
          <LinearGradient colors={[COLORS.accent, COLORS.accentAlt]} style={styles.hero}>
            {/* أنيميشن اللوجو عند الفتح */}
            <Animated.View entering={BounceIn.duration(1200)} style={styles.heroLogo}>
              <Image source={require('../icon.png')} style={styles.logoImage} resizeMode="contain" />
            </Animated.View>
            
            {/* <Animated.Text entering={ZoomIn.delay(300)} style={styles.heroTitle}>
              الحديدي
            </Animated.Text> */}
            <Animated.Text entering={ZoomIn.delay(400)} style={styles.heroSubtitle}>
              {isRegistering ? 'إنشاء حساب جديد للمنصة' : 'مرحباً بك  في منصتك'}
            </Animated.Text>
          </LinearGradient>

          {!isRegistering ? (
            // نموذج تسجيل الدخول
            <Animated.View entering={FadeInDown.duration(500)} style={styles.form}>
              <View style={styles.inputWrapper}>
                <FontAwesome5 name="user" size={16} color={COLORS.subText} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="اسم المستخدم"
                  placeholderTextColor={COLORS.subText}
                  autoCapitalize="none"
                  value={formData.username}
                  onChangeText={(text) => setFormData({ ...formData, username: text })}
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
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>دخول المنصة</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsRegistering(true)} activeOpacity={0.7}>
                <Text style={styles.switchText}>
                  ليس لديك حساب؟ <Text style={styles.highlightText}>سجّل الآن</Text>
                </Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            // نموذج إنشاء حساب
            <Animated.View entering={FadeInDown.duration(500)} style={styles.form}>
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
                onChangeText={(text) => setRegData({ ...regData, username: text })}
              />
              <TextInput
                style={styles.inputAlt}
                placeholder="رقم الهاتف"
                placeholderTextColor={COLORS.subText}
                keyboardType="phone-pad"
                value={regData.phone}
                onChangeText={(text) => setRegData({ ...regData, phone: text })}
              />
              <TextInput
                style={styles.inputAlt}
                placeholder="كلمة المرور"
                placeholderTextColor={COLORS.subText}
                secureTextEntry
                value={regData.password}
                onChangeText={(text) => setRegData({ ...regData, password: text })}
              />

              <Text style={styles.sectionLabel}>الفرقة الدراسية</Text>
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
                    <ActivityIndicator color="#fff" />
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
            </Animated.View>
          )}

          {/* زر الدعم الفني بأنيميشن دخول من الأسفل */}
          <Animated.View entering={FadeInUp.delay(600)}>
            <TouchableOpacity onPress={() => navigation.navigate('Support')} style={styles.supportBtn} activeOpacity={0.6}>
              <FontAwesome5 name="headset" size={14} color={COLORS.subText} />
              <Text style={styles.supportText}> تواجه مشكلة؟ تواصل مع الدعم الفني</Text>
            </TouchableOpacity>
            <View style={styles.legalRow}>
              <TouchableOpacity onPress={() => navigation.navigate('Legal', { type: 'Privacy' })}>
                <Text style={styles.legalLink}>الخصوصية</Text>
              </TouchableOpacity>
              <Text style={styles.legalSep}>•</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Legal', { type: 'Terms' })}>
                <Text style={styles.legalLink}>الشروط</Text>
              </TouchableOpacity>
              <Text style={styles.legalSep}>•</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Legal', { type: 'DeleteAccount' })}>
                <Text style={styles.legalLink}>حذف الحساب</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(COLORS) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
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
      shadowColor: COLORS.accent,
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
      backgroundColor: 'rgba(255,255,255,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.25)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 10,
    },
    heroLogo: {
      width: 130,
      height: 130,
      borderRadius: 34,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    logoImage: { width: '90%', height: '90%' },
    heroDivider: {
      width: 48,
      height: 3,
      borderRadius: 99,
      backgroundColor: 'rgba(255,255,255,0.4)',
      marginVertical: 14,
    },
    heroTitle: { color: '#fff', fontSize: 34, fontWeight: '900', textAlign: 'center', letterSpacing: 0 },
    heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 4, textAlign: 'center', fontWeight: '700' },
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
      borderWidth: 1,
      borderColor: COLORS.border,
      fontSize: 16,
    },
    input: { flex: 1, color: COLORS.text, textAlign: 'right', fontSize: 16 },
    inputIcon: { marginLeft: 12 },
    sectionLabel: { color: COLORS.text, textAlign: 'right', marginBottom: 12, fontSize: 16, fontWeight: '900' },
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
    yearBtnText: { color: COLORS.subText, fontSize: 14, fontWeight: '900' },
    yearBtnTextActive: { color: '#fff' },
    button: { padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 10, shadowColor: COLORS.accent, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    btnText: { color: COLORS.buttonText, fontWeight: '900', fontSize: 18 },
    switchText: { color: COLORS.subText, textAlign: 'center', marginTop: 24, fontSize: 15, fontWeight: '700' },
    highlightText: { color: COLORS.accent, fontWeight: '900' },
    supportBtn: {
      flexDirection: 'row-reverse',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20,
      padding: 10,
    },
    supportText: { color: COLORS.subText, fontSize: 14, fontWeight: '800' },
    legalRow: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 },
    legalLink: { color: COLORS.accent, fontSize: 13, fontWeight: '900' },
    legalSep: { color: COLORS.subText, fontSize: 12 },
  });
}
