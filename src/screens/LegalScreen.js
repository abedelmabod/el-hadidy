import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import CornerLogo from '../components/student/CornerLogo';
import { db } from '../firebase';
import { resolveMobileTheme } from '../theme/theme-config';

const CONTACT_EMAIL = 'biboaboshady2002@gmail.com';
const DEVELOPER_NAME = 'عبدالمعبود احمد';
const DEVELOPER_PHONE = '01206785079';

const CONTENT = {
  Privacy: {
    title: 'سياسة الخصوصية',
    body: [
  'منصة الحديدي التعليمية تجمع البيانات اللازمة لتشغيل الحساب وحماية المحتوى، وتشمل الاسم، اسم المستخدم، البريد الإلكتروني، رقم الهاتف، المرحلة الدراسية، رمز التسجيل، نوع الجهاز، ومعرف الجهاز.',
  'قد نحفظ رمز إشعارات الموبايل Expo Push Token لإرسال تنبيهات تعليمية عند إضافة محاضرات أو محتوى جديد للطلاب المسجلين مسبقًا.',
      'قد نحفظ سجل مشاهدة الفيديو محليًا أو داخل خدمات التطبيق لمساعدة الطالب على المتابعة من حيث توقف وتحسين تجربة التعلم.',
      'تتم معالجة وتشغيل وسائط الفيديو التعليمية عبر مزود خدمة خارجي هو Bunny Stream، وقد يتم تحميل روابط الفيديو أو بيانات التشغيل اللازمة لتقديم المحاضرات بشكل آمن وسريع.',
      'نستخدم هذه البيانات لتسجيل الدخول، تأكيد التسجيل، عرض محتوى الكورس المناسب، تقديم الدعم الفني، منع مشاركة الحساب، ورصد محاولات تصوير الشاشة أو تسجيل المحتوى.',
      'تخزن البيانات في خدمات Firebase/Google السحابية الخاصة بالتطبيق. لا نبيع بيانات الطلاب ولا نستخدمها للإعلانات أو التتبع الإعلاني.',
      `يمكن طلب تصحيح البيانات أو حذف الحساب من خلال الدعم الفني أو البريد: ${CONTACT_EMAIL}.`,
    ],
  },
  Terms: {
    title: 'الشروط والأحكام',
    body: [
      'الحساب للاستخدام الشخصي فقط، ولا يجوز مشاركة بيانات الدخول أو رموز التسجيل مع أي طرف آخر.',
  'يحظر تصوير الشاشة أو تسجيل الفيديوهات أو إعادة نشر المحاضرات أو المحتوى التعليمي. أي محاولة تصوير أو تسجيل قد تؤدي إلى حظر الحساب تلقائيًا وإخطار الإدارة.',
      'رمز التسجيل يربط الكورس المناسب بحساب الطالب حسب بيانات إدارة المنصة.',
      'يحق للدعم الفني تصفير الجهاز أو تغيير كلمة المرور بعد التحقق من الطالب.',
    ],
  },
  DeleteAccount: {
    title: 'طلب حذف الحساب',
    body: [
      `لطلب حذف الحساب والبيانات المرتبطة به، تواصل مع الدعم الفني أو أرسل طلبًا إلى ${CONTACT_EMAIL}.`,
  'يرجى إرسال الاسم، اسم المستخدم، البريد الإلكتروني، رقم الهاتف، والمرحلة الدراسية. بعد التحقق من الهوية، سيتم حذف الحساب والبيانات المرتبطة به نهائيًا خلال 7 إلى 30 يومًا، ما لم نكن ملزمين قانونيًا أو أمنيًا بالاحتفاظ ببعض بيانات السجلات.',
    ],
  },
  Developer: {
    title: 'عن المطور',
    body: [
      `تم إعداد التطبيق بواسطة ${DEVELOPER_NAME}.`,
      'مطور تطبيقات ومواقع، والمسؤول عن برمجة وإعداد وتطوير منصة د. محمد الحديدي التعليمية.',
      `للتواصل: واتساب ${DEVELOPER_PHONE} أو البريد الإلكتروني ${CONTACT_EMAIL}.`,
    ],
  },
};

export default function LegalScreen({ navigation, route, theme, user: propUser }) {
  const pageType = route?.params?.type || 'Privacy';
  const page = CONTENT[pageType] || CONTENT.Privacy;
  const user = propUser || route?.params?.user || null;
  const [submittingDeletion, setSubmittingDeletion] = useState(false);
  const activeTheme = theme || resolveMobileTheme('light');
  const COLORS = {
    bg: activeTheme.bg,
    card: activeTheme.card,
    text: activeTheme.text,
    subText: activeTheme.subText,
    accent: activeTheme.accent,
    border: activeTheme.border,
    buttonText: activeTheme.buttonText,
  };

  const requestAccountDeletion = useCallback(async () => {
    if (!user?.id && !user?.uid) {
      const emailSubject = encodeURIComponent('طلب حذف حساب - منصة الحديدي');
  const emailBody = encodeURIComponent('من فضلك اكتب الاسم، اسم المستخدم، البريد الإلكتروني، رقم الهاتف، والمرحلة الدراسية لطلب حذف الحساب. سيتم حذف الحساب والبيانات المرتبطة به نهائيًا خلال 7 إلى 30 يومًا بعد التحقق من الهوية، ما لم نكن ملزمين قانونيًا أو أمنيًا بالاحتفاظ ببعض بيانات السجلات.');
      Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${emailSubject}&body=${emailBody}`).catch(() => {
        Alert.alert('تنبيه', `أرسل طلب حذف الحساب إلى: ${CONTACT_EMAIL}`);
      });
      return;
    }

    setSubmittingDeletion(true);
    try {
      await addDoc(collection(db, 'supportRequests'), {
        type: 'account_deletion',
        typeLabel: 'طلب حذف الحساب',
        status: 'pending',
        message: 'يرغب الطالب في حذف الحساب والبيانات المرتبطة به.',
        studentId: user.id || user.uid,
        studentName: user.name || '',
        username: user.username || '',
        email: user.email || '',
        phone: user.phone || '',
        deviceId: user.deviceId || null,
        deviceInfo: user.deviceInfo || null,
        platform: Platform.OS,
        createdAt: serverTimestamp(),
      });
      Alert.alert('تم إرسال الطلب', 'تم إرسال طلب حذف الحساب للدعم الفني. بعد التحقق من الهوية، سيتم حذف الحساب والبيانات المرتبطة به نهائيًا خلال 7 إلى 30 يومًا، ما لم نكن ملزمين قانونيًا أو أمنيًا بالاحتفاظ ببعض بيانات السجلات.');
    } catch {
      Alert.alert('خطأ', 'تعذر إرسال طلب حذف الحساب الآن. حاول مرة أخرى أو تواصل عبر البريد.');
    } finally {
      setSubmittingDeletion(false);
    }
  }, [user]);

  const openDeveloperWhatsApp = useCallback(() => {
    const text = encodeURIComponent(`مرحبًا ${DEVELOPER_NAME}، أريد الاستفسار عن خدمات تطوير التطبيقات.`);
    Linking.openURL(`whatsapp://send?phone=2${DEVELOPER_PHONE}&text=${text}`).catch(() => {
      Linking.openURL(`https://wa.me/2${DEVELOPER_PHONE}?text=${text}`).catch(() => {
        Alert.alert('تنبيه', `رقم التواصل: ${DEVELOPER_PHONE}`);
      });
    });
  }, []);

  const openDeveloperEmail = useCallback(() => {
    const subject = encodeURIComponent('استفسار عن خدمات تطوير التطبيقات');
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}`).catch(() => {
      Alert.alert('تنبيه', `البريد الإلكتروني: ${CONTACT_EMAIL}`);
    });
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.bg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { borderColor: COLORS.border }]}>
          <FontAwesome5 name="chevron-right" color={COLORS.accent} size={14} />
          <Text style={[styles.backText, { color: COLORS.accent }]}>رجوع</Text>
        </TouchableOpacity>
        <View style={[styles.card, { backgroundColor: COLORS.card, borderColor: COLORS.border }]}>
          <Text style={[styles.title, { color: COLORS.accent }]}>{page.title}</Text>
          <Text style={[styles.updated, { color: COLORS.subText }]}>آخر تحديث: 9 مايو 2026</Text>
          {page.body.map((paragraph) => (
            <Text key={paragraph} style={[styles.paragraph, { color: COLORS.text }]}>{paragraph}</Text>
          ))}
          {pageType === 'Developer' && (
            <View style={styles.developerActions}>
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: COLORS.accent }]}
                onPress={openDeveloperWhatsApp}
                activeOpacity={0.85}
              >
                <FontAwesome5 name="whatsapp" color={COLORS.buttonText} size={15} />
                <Text style={[styles.deleteButtonText, { color: COLORS.buttonText }]}>تواصل واتساب</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.outlineButton, { borderColor: COLORS.border }]}
                onPress={openDeveloperEmail}
                activeOpacity={0.85}
              >
                <FontAwesome5 name="envelope" color={COLORS.accent} size={14} />
                <Text style={[styles.outlineButtonText, { color: COLORS.accent }]}>إرسال بريد</Text>
              </TouchableOpacity>
            </View>
          )}
          {pageType === 'DeleteAccount' && (
            <TouchableOpacity
              style={[styles.deleteButton, { backgroundColor: COLORS.accent }]}
              onPress={requestAccountDeletion}
              disabled={submittingDeletion}
              activeOpacity={0.85}
            >
              {submittingDeletion ? (
                <ActivityIndicator color={COLORS.buttonText} />
              ) : (
                <>
                  <FontAwesome5 name="user-slash" color={COLORS.buttonText} size={14} />
                  <Text style={[styles.deleteButtonText, { color: COLORS.buttonText }]}>إرسال طلب حذف الحساب</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      <CornerLogo />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, direction: 'rtl' },
  container: { padding: 20, paddingBottom: 40, direction: 'rtl' },
  backBtn: { alignSelf: 'flex-end', flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  backText: { fontWeight: '900', fontSize: 15, textAlign: 'right', writingDirection: 'rtl' },
  card: { borderWidth: 1, borderRadius: 24, padding: 22 },
  title: { fontSize: 26, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl', marginBottom: 6 },
  updated: { fontSize: 13, textAlign: 'right', writingDirection: 'rtl', marginBottom: 18 },
  paragraph: { fontSize: 16, lineHeight: 28, textAlign: 'right', writingDirection: 'rtl', marginBottom: 14 },
  deleteButton: { marginTop: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  deleteButtonText: { fontSize: 15, fontWeight: '900', textAlign: 'center', writingDirection: 'rtl' },
  developerActions: { gap: 10, marginTop: 8 },
  outlineButton: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  outlineButtonText: { fontSize: 15, fontWeight: '900', textAlign: 'center', writingDirection: 'rtl' },
});
