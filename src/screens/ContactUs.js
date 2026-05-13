import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInRight, Layout, ZoomIn } from 'react-native-reanimated';
import ThemeToggleButton from '../components/ThemeToggleButton';

const { width } = Dimensions.get('window');

const createStyles = (COLORS) => StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: COLORS.bg 
  },
  container: { 
    flex: 1 
  },
  content: { 
    padding: 20, 
    paddingBottom: 40 
  },
  topRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    // تم إلغاء marginTop اليدوي لأن SafeAreaView ستقوم بالمهمة
  },
  brandText: { 
    color: COLORS.text, 
    fontSize: 22, 
    fontWeight: '900' 
  },
  
  statusBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusDot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: '#2ecc71', 
    marginLeft: 8 
  },
  statusText: { 
    color: COLORS.subText, 
    fontSize: 13, 
    fontWeight: '800' 
  },

  heroCard: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 30,
    paddingVertical: 35,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 25,
    overflow: 'hidden',
  },
  heroCircle: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  title: { 
    color: '#fff', 
    fontSize: 26, 
    fontWeight: '900', 
    marginTop: 15 
  },
  subTitle: { 
    color: 'rgba(255,255,255,0.8)', 
    fontSize: 15, 
    marginTop: 5, 
    textAlign: 'center' 
  },

  sectionLabel: { 
    color: COLORS.text, 
    fontSize: 18, 
    fontWeight: '800', 
    marginBottom: 15, 
    textAlign: 'right',
    marginRight: 5
  },

  optionsGrid: { 
    flexDirection: 'row-reverse', 
    justifyContent: 'space-between', 
    marginBottom: 25 
  },
  optionCard: {
    backgroundColor: COLORS.card,
    width: '48%',
    paddingVertical: 25,
    borderRadius: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: { 
        shadowColor: COLORS.accent, 
        shadowOffset: { width: 0, height: 4 }, 
        shadowOpacity: 0.1, 
        shadowRadius: 10 
      },
      android: { elevation: 3 }
    })
  },
  optionLabel: { 
    color: COLORS.text, 
    marginTop: 10, 
    fontSize: 16, 
    fontWeight: '800' 
  },

  faqItem: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden'
  },
  faqHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
  },
  faqQuestion: { 
    color: COLORS.text, 
    fontWeight: '800', 
    textAlign: 'right', 
    fontSize: 15, 
    flex: 1 
  },
  faqAnswerContainer: { 
    padding: 18, 
    paddingTop: 0 
  },
  faqAnswer: { 
    color: COLORS.subText, 
    textAlign: 'right', 
    fontSize: 14, 
    lineHeight: 24 
  },
});

const FAQItem = ({ question, answer, COLORS, styles }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Animated.View layout={Layout.springify()} style={styles.faqItem}>
      <TouchableOpacity 
        style={styles.faqHeader} 
        onPress={() => setIsOpen(!isOpen)}
        activeOpacity={0.7}
      >
        <FontAwesome5 
          name={isOpen ? "chevron-up" : "chevron-down"} 
          size={12} 
          color={COLORS.accent} 
        />
        <Text style={styles.faqQuestion}>{question}</Text>
      </TouchableOpacity>
      
      {isOpen && (
        <Animated.View entering={FadeInDown} style={styles.faqAnswerContainer}>
          <Text style={styles.faqAnswer}>{answer}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
};

export default function SupportScreen({ theme, themeMode, toggleTheme }) {
  const COLORS = {
    bg: theme.bg,
    card: theme.card,
    cardAlt: theme.cardAlt,
    accent: theme.accent,
    text: theme.text,
    subText: theme.subText,
    border: theme.border,
  };
  const styles = createStyles(COLORS);

  const openWhatsApp = () => {
    const phone = "201000000000"; 
    Linking.openURL(`whatsapp://send?phone=${phone}&text=مرحباً، أحتاج مساعدة في منصة الحديدي`);
  };

  const openTelegram = () => {
    Linking.openURL('https://t.me/your_bot_or_user'); 
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <ScrollView 
          contentContainerStyle={styles.content} 
          showsVerticalScrollIndicator={false}
        >
          
          {/* Header Row */}
          <View style={styles.topRow}>
            <Text style={styles.brandText}>مركز المساعدة</Text>
            <ThemeToggleButton mode={themeMode} onPress={toggleTheme} theme={theme} />
          </View>

          {/* Online Status */}
          <Animated.View entering={FadeInRight.delay(200)} style={styles.statusBanner}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>فريق الدعم متصل الآن</Text>
          </Animated.View>

          {/* Main Hero Card */}
          <Animated.View entering={ZoomIn.duration(600)} style={styles.heroCard}>
            <View style={styles.heroCircle} />
            <MaterialCommunityIcons name="face-agent" size={60} color="#fff" />
            <Text style={styles.title}>كيف يمكننا مساعدتك؟</Text>
            <Text style={styles.subTitle}>اختر الوسيلة المناسبة لك وسنقوم بالرد فوراً</Text>
          </Animated.View>

          {/* Support Buttons Grid */}
          <Text style={styles.sectionLabel}>تواصل مباشر</Text>
          <View style={styles.optionsGrid}>
            <TouchableOpacity 
              style={styles.optionCard} 
              onPress={openWhatsApp}
              activeOpacity={0.8}
            >
              <Animated.View entering={ZoomIn.delay(300)}>
                <FontAwesome5 name="whatsapp" size={36} color="#25D366" />
              </Animated.View>
              <Text style={styles.optionLabel}>واتساب</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.optionCard} 
              onPress={openTelegram}
              activeOpacity={0.8}
            >
              <Animated.View entering={ZoomIn.delay(400)}>
                <FontAwesome5 name="telegram" size={36} color="#0088cc" />
              </Animated.View>
              <Text style={styles.optionLabel}>تليجرام</Text>
            </TouchableOpacity>
          </View>

          {/* FAQs Section */}
          <Text style={styles.sectionLabel}>الأسئلة الشائعة</Text>
          <Animated.View entering={FadeInDown.delay(500)}>
            <FAQItem 
              question="كود التفعيل لا يعمل؟"
              answer="يرجى التأكد من كتابة الكود باللغة الإنجليزية حصراً، مع مراعاة الحروف الكبيرة (Capital Letters). إذا استمرت المشكلة، تأكد أن الكود مخصص لفرقتك الدراسية."
              COLORS={COLORS}
              styles={styles}
            />
            <FAQItem 
              question="سياسة حظر الحسابات"
              answer="يتم حظر الحساب تلقائياً في حال اكتشاف محاولات تصوير الشاشة أو محاولة فتح الحساب من أكثر من جهازين. لفك الحظر، تواصل مع الدعم الفني."
              COLORS={COLORS}
              styles={styles}
            />
            <FAQItem 
              question="كيفية استلام الملازم الورقية؟"
              answer="الملازم متوفرة في السنتر الخاص بالدكتور أو يمكن طلبها شحناً من خلال قسم الملازم في الصفحة الرئيسية."
              COLORS={COLORS}
              styles={styles}
            />
          </Animated.View>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
