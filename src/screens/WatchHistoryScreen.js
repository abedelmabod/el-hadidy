import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import CornerLogo from '../components/student/CornerLogo';
import { resolveBunnyPlaybackUrl } from '../services/bunny-service';
import { resolveMobileTheme } from '../theme/theme-config';
import { getSortedVideoProgress } from '../utils/videoProgress';
import { checkActiveVideoAccess, getAccessDeniedMessage } from '../utils/studentAccessGuard';

const normalizeUrl = (url = '') => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `https:${value}`;
  return `https://${value}`;
};

const formatMinutes = (seconds = 0) => `${Math.max(0, Math.floor(Number(seconds || 0) / 60))} د`;

const formatDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function WatchHistoryScreen({ route, navigation, theme, themeMode, user: propUser }) {
  const user = propUser || route?.params?.user || null;
  const activeThemeMode = themeMode || theme?.mode || 'light';
  const activeTheme = theme || resolveMobileTheme(activeThemeMode);
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(activeTheme, width < 370), [activeTheme, width]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const nextItems = await getSortedVideoProgress();
    setItems(nextItems);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      load()
        .catch(() => {
          if (isActive) setItems([]);
        })
        .finally(() => {
          if (isActive) setLoading(false);
        });
      return () => {
        isActive = false;
      };
    }, [load])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => setItems([]));
    setRefreshing(false);
  }, [load]);

  const openVideo = useCallback(async (item) => {
    try {
      const accessCheck = await checkActiveVideoAccess(user, item.accessYear || item.year || '');
      if (!accessCheck.allowed) {
        Alert.alert('تنبيه', getAccessDeniedMessage(accessCheck.reason));
        return;
      }

      const rawUrl = normalizeUrl(item.originalVideoUrl || item.videoUrl);
      const videoUrl = await resolveBunnyPlaybackUrl(rawUrl);
      if (!videoUrl) {
        Alert.alert('تنبيه', 'رابط الفيديو غير متاح حاليًا.');
        return;
      }

      navigation.navigate('VideoPlayer', {
        ...item,
        videoUrl,
        originalVideoUrl: rawUrl,
        resumeAt: item.currentTime || 0,
        accessYear: item.accessYear || item.year || '',
        user,
      });
    } catch {
      Alert.alert('تعذر التشغيل', 'حدث خطأ أثناء تجهيز رابط الفيديو.');
    }
  }, [navigation, user]);

  const completedCount = items.filter((item) => {
    const duration = Number(item.duration) || 0;
    const currentTime = Number(item.currentTime) || 0;
    return duration > 0 && duration - currentTime <= 15;
  }).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={activeTheme.accent} />}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <FontAwesome5 name="history" size={22} color={activeTheme.accent} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>متابعة التعلم</Text>
            <Text style={styles.title}>آخر ما شاهدته</Text>
            <Text style={styles.subtitle}>
              {items.length} فيديو بدأتهم • {completedCount} مكتمل
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerCard}>
            <ActivityIndicator color={activeTheme.accent} />
            <Text style={styles.loadingText}>جاري تحميل سجل المشاهدة...</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <FontAwesome5 name="play-circle" size={28} color={activeTheme.accent} />
            </View>
            <Text style={styles.emptyTitle}>لسه مفيش فيديوهات بدأت تشاهدها</Text>
            <Text style={styles.emptyText}>ابدأ أي محاضرة، وهتظهر هنا تلقائيًا عشان تكمل بسرعة.</Text>
          </View>
        ) : (
          items.map((item) => {
            const duration = Number(item.duration) || 0;
            const currentTime = Number(item.currentTime) || 0;
            const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
            const isCompleted = duration > 0 && duration - currentTime <= 15;

            return (
              <TouchableOpacity
                key={item.progressKey || item.lectureId || item.videoUrl}
                activeOpacity={0.86}
                style={styles.historyCard}
                onPress={() => openVideo(item)}
              >
                <View style={[styles.playBubble, { backgroundColor: isCompleted ? activeTheme.success : activeTheme.accent }]}>
                  <FontAwesome5 name={isCompleted ? 'check' : 'play'} size={14} color="#FFFFFF" />
                </View>

                <View style={styles.cardText}>
                  <Text style={styles.cardLabel}>{isCompleted ? 'مكتمل' : `توقفت عند ${formatMinutes(currentTime)}`}</Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.videoTitle || 'فيديو بدون عنوان'}</Text>
                  {!!item.videoSubtitle && <Text style={styles.cardSubtitle} numberOfLines={1}>{item.videoSubtitle}</Text>}

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(4, ratio * 100)}%`,
                          backgroundColor: isCompleted ? activeTheme.success : activeTheme.accent,
                        },
                      ]}
                    />
                  </View>

                  <Text style={styles.cardDate}>{formatDate(item.updatedAt)}</Text>
                </View>

                <FontAwesome5 name="chevron-left" size={12} color={activeTheme.subText} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      <CornerLogo />
    </SafeAreaView>
  );
}

const createStyles = (theme, isCompact) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    paddingHorizontal: isCompact ? 14 : 18,
    paddingTop: 92,
    paddingBottom: 28,
  },
  headerCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 17,
    marginBottom: 14,
  },
  headerIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  kicker: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  title: {
    color: theme.text,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 4,
    writingDirection: 'rtl',
  },
  subtitle: {
    color: theme.subText,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
    writingDirection: 'rtl',
  },
  centerCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    padding: 24,
  },
  loadingText: {
    color: theme.subText,
    marginTop: 12,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    padding: 28,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptyText: {
    color: theme.subText,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 7,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  historyCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    minHeight: 68,
  },
  playBubble: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  cardLabel: {
    color: theme.accent,
    fontSize: 10,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  cardTitle: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardSubtitle: {
    color: theme.subText,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  progressTrack: {
    width: '100%',
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.border,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  cardDate: {
    color: theme.subText,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
    writingDirection: 'rtl',
  },
});
