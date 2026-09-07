import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Device from 'expo-device';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import ThemeToggleButton from '../components/ThemeToggleButton';
import CornerLogo from '../components/student/CornerLogo';
import { db } from '../firebase';
import { resolveMobileTheme } from '../theme/theme-config';

const SUPPORT_TYPES = [
  { id: 'account_deletion', label: 'طلب حذف الحساب', icon: 'user-slash' },
  { id: 'content_issue', label: 'مشكلة في المحتوى', icon: 'play-circle' },
  { id: 'code_issue', label: 'رمز التسجيل', icon: 'qrcode' },
  { id: 'account_issue', label: 'الحساب', icon: 'user-shield' },
];

const STATUS_META = {
  pending: { label: 'قيد المراجعة', icon: 'clock', colorKey: 'accentOrange' },
  in_progress: { label: 'جاري الحل', icon: 'tools', colorKey: 'accent' },
  resolved: { label: 'تم الحل', icon: 'check-circle', colorKey: 'success' },
  rejected: { label: 'مرفوض', icon: 'times-circle', colorKey: 'danger' },
};

const toDateValue = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value) => {
  const time = toDateValue(value);
  if (!time) return '';
  return new Date(time).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function SupportScreen({
  route,
  user: propUser,
  theme,
  themeMode,
  toggleTheme,
}) {
  const user = route?.params?.user || propUser || null;
  const activeThemeMode = themeMode || theme?.mode || 'light';
  const activeTheme = theme || resolveMobileTheme(activeThemeMode);
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(activeTheme, width < 370), [activeTheme, width]);

  const [selectedType, setSelectedType] = useState('code_issue');
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentDeviceLabel = useMemo(() => {
    const label = `${Device.brand || ''} ${Device.modelName || ''}`.trim();
    return user?.deviceInfo || label || `${Platform.OS}`;
  }, [user?.deviceInfo]);

  const loadRequests = useCallback(async () => {
    if (!user?.id && !user?.uid) {
      setRequests([]);
      return;
    }

    setLoadingRequests(true);
    try {
      const studentId = user.id || user.uid;
      const snapshot = await getDocs(
        query(collection(db, 'supportRequests'), where('studentId', '==', studentId))
      );
      const nextRequests = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt))
        .slice(0, 5);
      setRequests(nextRequests);
    } catch {
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, [user?.id, user?.uid]);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests])
  );

  const submitRequest = useCallback(async () => {
    if (!user?.id && !user?.uid) {
      Alert.alert('تنبيه', 'لا يمكن إرسال الطلب قبل تسجيل الدخول.');
      return;
    }

    const type = SUPPORT_TYPES.find((item) => item.id === selectedType) || SUPPORT_TYPES[0];
    const cleanMessage = message.trim();
    if (cleanMessage.length < 5) {
      Alert.alert('تنبيه', 'اكتب وصف مختصر للمشكلة.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'supportRequests'), {
        type: selectedType,
        typeLabel: type.label,
        status: 'pending',
        message: cleanMessage,
        studentId: user.id || user.uid,
        studentName: user.name || '',
        username: user.username || '',
        phone: user.phone || '',
        deviceId: user.deviceId || null,
        deviceInfo: currentDeviceLabel || null,
        platform: Platform.OS,
        createdAt: serverTimestamp(),
      });
      setMessage('');
      Alert.alert('تم إرسال الطلب', 'الدعم الفني سيراجع طلبك في أقرب وقت.');
      await loadRequests();
    } catch {
      Alert.alert('خطأ', 'تعذر إرسال الطلب الآن. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  }, [currentDeviceLabel, loadRequests, message, selectedType, user]);

  const openWhatsApp = useCallback(() => {
    const phone = '201044811399';
    const studentName = user?.name || user?.username || 'طالب';
    const studentPhone = user?.phone || 'غير مسجل';
    const text = encodeURIComponent(`اسم الطالب: ${studentName}\nرقم الهاتف: ${studentPhone}`);
    Linking.openURL(`whatsapp://send?phone=${phone}&text=${text}`).catch(() => {
      Linking.openURL(`https://wa.me/${phone}?text=${text}`).catch(() => {});
    });
  }, [user]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loadingRequests} onRefresh={loadRequests} tintColor={activeTheme.accent} />}
      >
        <View style={styles.topRow}>
          <View style={styles.headerText}>
            <Text style={styles.brandText}>الدعم الفني</Text>
            <Text style={styles.brandSubText}>ابعت طلبك وتابع حالته من نفس المكان.</Text>
          </View>
          <ThemeToggleButton mode={activeThemeMode} onPress={toggleTheme} theme={activeTheme} />
        </View>

        <Text style={styles.sectionLabel}>نوع الطلب</Text>
        <View style={styles.typeGrid}>
          {SUPPORT_TYPES.map((item) => {
            const active = selectedType === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: active ? activeTheme.accent : activeTheme.card,
                    borderColor: active ? activeTheme.accent : activeTheme.border,
                  },
                ]}
                activeOpacity={0.86}
                onPress={() => setSelectedType(item.id)}
              >
                <FontAwesome5 name={item.icon} size={15} color={active ? activeTheme.buttonText : activeTheme.accent} />
                <Text style={[styles.typeText, { color: active ? activeTheme.buttonText : activeTheme.text }]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.formCard}>
          <Text style={styles.cardTitle}>تفاصيل الطلب</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="اكتب المشكلة باختصار"
            placeholderTextColor={activeTheme.muted || activeTheme.subText}
            style={styles.messageInput}
            multiline
            textAlign="right"
          />
          <TouchableOpacity
            style={[styles.primaryButton, submitting && { opacity: 0.65 }]}
            disabled={submitting}
            activeOpacity={0.86}
            onPress={submitRequest}
          >
            {submitting ? (
              <ActivityIndicator color={activeTheme.buttonText} />
            ) : (
              <Text style={styles.primaryButtonText}>إرسال الطلب</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.whatsAppCard}>
          <View style={styles.whatsAppText}>
            <Text style={styles.cardTitle}>تواصل سريع</Text>
            <Text style={styles.cardBody}>لو الموضوع عاجل، تقدر تبعت رسالة واتساب للدعم.</Text>
          </View>
          <TouchableOpacity style={styles.whatsAppButton} onPress={openWhatsApp} activeOpacity={0.86}>
            <FontAwesome5 name="whatsapp" size={18} color="#FFFFFF" />
            <Text style={styles.whatsAppButtonText}>واتساب</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>حالة الطلبات</Text>
        {requests.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="clipboard-text-clock-outline" size={30} color={activeTheme.accent} />
            <Text style={styles.emptyTitle}>لا توجد طلبات حتى الآن</Text>
            <Text style={styles.emptyText}>أي طلب ترسله سيظهر هنا بحالته.</Text>
          </View>
        ) : (
          requests.map((requestItem) => {
            const status = STATUS_META[requestItem.status] || STATUS_META.pending;
            const statusColor = activeTheme[status.colorKey] || activeTheme.accent;
            return (
              <View key={requestItem.id} style={styles.requestCard}>
                <View style={[styles.requestStatusIcon, { backgroundColor: `${statusColor}18` }]}>
                  <FontAwesome5 name={status.icon} size={14} color={statusColor} />
                </View>
                <View style={styles.requestText}>
                  <Text style={styles.requestTitle}>{requestItem.typeLabel || 'طلب دعم'}</Text>
                  <Text style={[styles.requestStatus, { color: statusColor }]}>{status.label}</Text>
                  {!!requestItem.message && <Text style={styles.requestMessage} numberOfLines={2}>{requestItem.message}</Text>}
                  <Text style={styles.requestDate}>{formatDate(requestItem.createdAt)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <CornerLogo />
    </SafeAreaView>
  );
}

const createStyles = (theme, isCompact) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    paddingHorizontal: isCompact ? 14 : 18,
    paddingTop: 18,
    paddingBottom: 34,
  },
  topRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  brandText: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  brandSubText: {
    color: theme.subText,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  deviceCard: {
    flexDirection: 'row-reverse',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    padding: 16,
    marginBottom: 16,
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cardTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardBody: {
    color: theme.subText,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  deviceLine: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionLabel: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  typeGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  typeButton: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  formCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    padding: 16,
    marginBottom: 14,
  },
  messageInput: {
    minHeight: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.cardAlt,
    color: theme.text,
    padding: 12,
    marginTop: 12,
    marginBottom: 12,
    textAlignVertical: 'top',
    writingDirection: 'rtl',
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: 16,
    backgroundColor: theme.accent,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: theme.buttonText,
    fontSize: 15,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  whatsAppCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    padding: 14,
    marginBottom: 18,
  },
  whatsAppText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  whatsAppButton: {
    borderRadius: 15,
    backgroundColor: theme.success,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
  },
  whatsAppButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    padding: 24,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptyText: {
    color: theme.subText,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  requestCard: {
    flexDirection: 'row-reverse',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    padding: 14,
    marginBottom: 10,
  },
  requestStatusIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  requestTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  requestStatus: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 3,
    writingDirection: 'rtl',
  },
  requestMessage: {
    color: theme.subText,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  requestDate: {
    color: theme.subText,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
    writingDirection: 'rtl',
  },
});
