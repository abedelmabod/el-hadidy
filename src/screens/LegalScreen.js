import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

const CONTACT_EMAIL = 'biboaboshady2002@gmail.com';

const CONTENT = {
  Privacy: {
    title: 'سياسة الخصوصية',
    body: [
      'منصة الحديدي التعليمية تجمع البيانات اللازمة لتشغيل الحساب وحماية المحتوى، وتشمل الاسم، اسم المستخدم، رقم الهاتف، الفرقة الدراسية، كود الاشتراك، نوع الجهاز، ومعرف الجهاز.',
      'نستخدم هذه البيانات لتسجيل الدخول، تفعيل الأكواد، عرض محتوى الفرقة المناسبة، تقديم الدعم الفني، منع مشاركة الحساب، ورصد محاولات تصوير الشاشة أو تسجيل المحتوى.',
      'تخزن البيانات في خدمات Firebase/Google السحابية الخاصة بالتطبيق. لا نبيع بيانات الطلاب ولا نستخدمها للإعلانات أو التتبع الإعلاني.',
      `يمكن طلب تصحيح البيانات أو حذف الحساب من خلال الدعم الفني أو البريد: ${CONTACT_EMAIL}.`,
    ],
  },
  Terms: {
    title: 'الشروط والأحكام',
    body: [
      'الحساب للاستخدام الشخصي فقط، ولا يجوز مشاركة بيانات الدخول أو الأكواد مع أي طرف آخر.',
      'يحظر تصوير الشاشة أو تسجيل الفيديوهات أو إعادة نشر المحاضرات أو ملفات PDF. أي محاولة تصوير أو تسجيل قد تؤدي إلى حظر الحساب تلقائياً وإخطار الإدارة.',
      'الكود يفتح محتوى الفرقة المرتبطة به. إذا أدخل الطالب كود فرقة مختلفة، سيتم عرض محتوى هذه الفرقة حسب بيانات الكود.',
      'يحق للدعم الفني تصفير الجهاز أو تغيير كلمة المرور بعد التحقق من الطالب.',
    ],
  },
  DeleteAccount: {
    title: 'طلب حذف الحساب',
    body: [
      `لطلب حذف الحساب والبيانات المرتبطة به، تواصل مع الدعم الفني أو أرسل طلباً إلى ${CONTACT_EMAIL}.`,
      'يرجى إرسال الاسم، اسم المستخدم، رقم الهاتف، والفرقة الدراسية. بعد التحقق من الهوية سيتم حذف أو تعطيل الحساب والبيانات المرتبطة به خلال مدة معقولة.',
    ],
  },
};

export default function LegalScreen({ navigation, route, theme }) {
  const page = CONTENT[route?.params?.type || 'Privacy'] || CONTENT.Privacy;
  const COLORS = {
    bg: theme?.bg || '#000',
    card: theme?.card || '#0D0D0D',
    text: theme?.text || '#fff',
    subText: theme?.subText || '#D1D1D1',
    accent: theme?.accent || '#D4AF37',
    border: theme?.border || '#1C1C1C',
  };

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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  backBtn: { alignSelf: 'flex-start', flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  backText: { fontWeight: '900', fontSize: 15 },
  card: { borderWidth: 1, borderRadius: 24, padding: 22 },
  title: { fontSize: 26, fontWeight: '900', textAlign: 'right', marginBottom: 6 },
  updated: { fontSize: 13, textAlign: 'right', marginBottom: 18 },
  paragraph: { fontSize: 16, lineHeight: 28, textAlign: 'right', marginBottom: 14 },
});
