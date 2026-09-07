import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import CornerLogo from '../components/student/CornerLogo';
import { resolveMobileTheme } from '../theme/theme-config';

export default function ComputerLinkScreen({
  route,
  user: propUser,
  theme,
  themeMode,
}) {
  const user = route?.params?.user || propUser || null;
  const activeThemeMode = themeMode || theme?.mode || 'light';
  const activeTheme = theme || resolveMobileTheme(activeThemeMode);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom || 0, Platform.OS === 'ios' ? 22 : 14);
  const styles = useMemo(
    () => createStyles(activeTheme, width < 370, safeBottom),
    [activeTheme, width, safeBottom]
  );

  const openWhatsApp = useCallback(() => {
    const phone = '201044811399';
    const studentName = user?.name || user?.username || 'طالب';
    const studentPhone = user?.phone || 'غير مسجل';
    const text = encodeURIComponent(
      `اريد الربط بالكمبيوتر\nاسم الطالب: ${studentName}\nرقم الهاتف: ${studentPhone}`
    );

    Linking.openURL(`whatsapp://send?phone=${phone}&text=${text}`).catch(() => {
      Linking.openURL(`https://wa.me/${phone}?text=${text}`).catch(() => {
        Alert.alert('تعذر الفتح', 'لم نتمكن من فتح واتساب الآن.');
      });
    });
  }, [user]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="monitor-link" size={42} color={activeTheme.accent} />
          </View>

          <Text style={styles.title}>الربط بالكمبيوتر</Text>
          <Text style={styles.description}>
            للربط بالكمبيوتر الرجاء التواصل مع الدعم الفني.
          </Text>

          <TouchableOpacity style={styles.whatsAppButton} onPress={openWhatsApp} activeOpacity={0.86}>
            <FontAwesome5 name="whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.whatsAppButtonText}>تواصل واتساب</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <CornerLogo />
    </SafeAreaView>
  );
}

const createStyles = (theme, isCompact, safeBottom = 14) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: isCompact ? 16 : 20,
    paddingTop: 78,
    paddingBottom: 36 + safeBottom,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    paddingHorizontal: 22,
    paddingVertical: 34,
    alignItems: 'center',
    shadowColor: theme.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${theme.accent}16`,
    borderWidth: 1,
    borderColor: `${theme.accent}44`,
    marginBottom: 18,
  },
  title: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  description: {
    color: theme.subText,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 26,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 10,
    marginBottom: 24,
  },
  whatsAppButton: {
    minHeight: 54,
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#25D366',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  whatsAppButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
