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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import LectureRow from '../components/student/LectureRow';
import StudentBottomBar from '../components/student/StudentBottomBar';
import CornerLogo from '../components/student/CornerLogo';
import useStudentData, { normalizeArabicText } from '../hooks/useStudentData';
import { resolveBunnyPlaybackUrl } from '../services/bunny-service';
import { resolveMobileTheme } from '../theme/theme-config';
import { getAllVideoProgress, getVideoProgressKey } from '../utils/videoProgress';
import { checkActiveVideoAccess, getAccessDeniedMessage } from '../utils/studentAccessGuard';

const normalizeUrl = (url = '') => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `https:${value}`;
  return `https://${value}`;
};

const getStudentGrade = (user = {}) =>
  user?.academicYear || user?.grade || user?.year || user?.accessYear || user?.codeYear || '';

const lessonMatchesSubject = (lesson = {}, subjectId = '', subjectName = '') => {
  if (subjectId && String(lesson.subjectId || '') === String(subjectId)) return true;

  const normalizedSubjectName = normalizeArabicText(subjectName);
  return [lesson.subject, lesson.subjectName]
    .filter(Boolean)
    .some((name) => normalizeArabicText(name) === normalizedSubjectName);
};

const lessonMatchesChapter = (lesson = {}, chapterId = '', chapterName = '') => {
  if (chapterId && String(lesson.chapterId || '') === String(chapterId)) return true;

  const normalizedChapterName = normalizeArabicText(chapterName);
  return [lesson.chapterName, lesson.chapter]
    .filter(Boolean)
    .some((name) => normalizeArabicText(name) === normalizedChapterName);
};

const getSubjectLessons = ({ section, subjectId, subjectName, contentKind }) => {
  const lessons = contentKind === 'materials'
    ? section?.materialLessons || []
    : section?.lessons || [];
  return lessons.filter((lesson) => lessonMatchesSubject(lesson, subjectId, subjectName));
};

const getLectureType = (lecture, isMaterials) => {
  if (isMaterials || (!lecture?.url && lecture?.pdfUrl)) return 'pdf';
  return 'video';
};

export default function LecturesScreen({
  route,
  navigation,
  user: propUser,
  theme,
  themeMode,
}) {
  const params = route?.params || {};
  const user = params.user || propUser || null;
  const activeThemeMode = themeMode || theme?.mode || 'light';
  const activeTheme = theme || resolveMobileTheme(activeThemeMode);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom || 0, Platform.OS === 'ios' ? 22 : 12);
  const styles = useMemo(() => createStyles(activeTheme, width < 370, safeBottom), [activeTheme, width, safeBottom]);
  const [searchText, setSearchText] = useState('');
  const [progressMap, setProgressMap] = useState({});

  const contentKind = params.contentKind || 'videos';
  const subjectId = params.subjectId || '';
  const subjectName = params.subjectName || '';
  const chapterId = params.chapterId || '';
  const chapterName = params.chapterName || '';
  const accessYear = params.accessYear || '';
  const yearKey = normalizeArabicText(params.yearKey || accessYear);
  const isMaterials = contentKind === 'materials';

  const { data, loading, refreshing, refresh, error } = useStudentData(getStudentGrade(user), {
    studentId: user?.id || user?.uid,
    fallbackUser: user,
    accessYear,
    yearKey,
    routeParams: params,
  });

  const section = useMemo(
    () => data.sections.find((item) => item.yearKey === yearKey)
      || data.sections.find((item) => normalizeArabicText(item.accessYear) === yearKey),
    [data.sections, yearKey]
  );

  const allLectures = useMemo(() => {
    const subjectLessons = getSubjectLessons({ section, subjectId, subjectName, contentKind });
    if (!chapterId) return subjectLessons;
    if (chapterId === 'no-chapter') return subjectLessons.filter((lesson) => !lesson.chapterId && !lesson.chapterName);
    return subjectLessons.filter((lesson) => lessonMatchesChapter(lesson, chapterId, chapterName));
  }, [chapterId, chapterName, contentKind, section, subjectId, subjectName]);

  const visibleLectures = useMemo(() => {
    const queryText = normalizeArabicText(searchText);
    if (!queryText) return allLectures;
    return allLectures.filter((lecture) =>
      normalizeArabicText([
        lecture?.title,
        lecture?.name,
        lecture?.description,
        lecture?.subject,
        lecture?.chapterName,
      ].filter(Boolean).join(' ')).includes(queryText)
    );
  }, [allLectures, searchText]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      getAllVideoProgress()
        .then((nextProgressMap) => {
          if (isActive) setProgressMap(nextProgressMap || {});
        })
        .catch(() => {
          if (isActive) setProgressMap({});
        });

      return () => {
        isActive = false;
      };
    }, [])
  );

  const openVideo = useCallback(async (lecture) => {
    const originalVideoUrl = normalizeUrl(lecture?.url);

    try {
      const accessCheck = await checkActiveVideoAccess(user, lecture?.year || accessYear);
      if (!accessCheck.allowed) {
        Alert.alert('تنبيه', getAccessDeniedMessage(accessCheck.reason));
        await refresh();
        return;
      }

      const videoUrl = await resolveBunnyPlaybackUrl(originalVideoUrl);
      if (!videoUrl) {
        Alert.alert('تنبيه', 'رابط الفيديو غير متاح حاليًا.');
        return;
      }

      navigation.navigate('VideoPlayer', {
        videoUrl,
        originalVideoUrl,
        lectureId: lecture?.id || '',
        subjectName,
        chapterName,
        accessYear: lecture?.year || accessYear,
        user,
        videoTitle: lecture?.title || lecture?.name || 'فيديو',
        videoSubtitle: [subjectName || lecture?.subject, chapterName, lecture?.year || accessYear].filter(Boolean).join(' / '),
      });
    } catch {
      Alert.alert('تعذر التشغيل', 'حدث خطأ أثناء تجهيز رابط الفيديو.');
    }
  }, [accessYear, chapterName, navigation, refresh, subjectName, user]);

  const openPdf = useCallback(async (lecture) => {
    const pdfUrl = normalizeUrl(lecture?.pdfUrl);
    if (!pdfUrl) {
      Alert.alert('تنبيه', 'رابط المحتوى غير متاح حاليًا.');
      return;
    }

    const canOpen = await Linking.canOpenURL(pdfUrl);
    if (!canOpen) {
      Alert.alert('تعذر الفتح', 'الرابط غير صالح أو لا يمكن فتحه على هذا الجهاز.');
      return;
    }

    await Linking.openURL(pdfUrl);
  }, []);

  const openLecture = useCallback((lecture) => {
    const type = getLectureType(lecture, isMaterials);
    if (type === 'pdf') {
      openPdf(lecture);
      return;
    }
    openVideo(lecture);
  }, [isMaterials, openPdf, openVideo]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={activeTheme.accent} />
          <Text style={styles.loadingText}>جاري تحميل المحاضرات...</Text>
        </View>
        <CornerLogo />
        <StudentBottomBar navigation={navigation} user={user} colors={activeTheme} activeTab="videos" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={activeTheme.accent} />}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={[styles.summaryIcon, { backgroundColor: activeTheme.cardAlt, borderColor: activeTheme.border }]}>
              <FontAwesome5 name={isMaterials ? 'file-pdf' : 'play-circle'} size={23} color={activeTheme.accent} />
            </View>
            <View style={styles.summaryText}>
              <Text style={styles.kicker}>{[accessYear, subjectName].filter(Boolean).join(' / ')}</Text>
              <Text style={styles.title}>{chapterName || (isMaterials ? 'المحتوى' : 'المحاضرات')}</Text>
            </View>
          </View>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <FontAwesome5 name="exclamation-circle" size={15} color={activeTheme.danger} />
            <Text style={styles.errorText}>تعذر تحميل البيانات. اسحب للتحديث مرة أخرى.</Text>
          </View>
        )}

        {allLectures.length > 5 && (
          <View style={[styles.searchBox, { backgroundColor: activeTheme.card, borderColor: activeTheme.border }]}>
            <FontAwesome5 name="search" size={14} color={activeTheme.subText} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="ابحث باسم المحاضرة"
              placeholderTextColor={activeTheme.muted || activeTheme.subText}
              style={[styles.searchInput, { color: activeTheme.text }]}
              textAlign="right"
            />
          </View>
        )}

        {visibleLectures.length === 0 ? (
          <ContentEmptyState
            styles={styles}
            theme={activeTheme}
            icon={isMaterials ? 'file-pdf' : 'video-slash'}
            title={getEmptyTitle(isMaterials)}
            description="اسحب للتحديث لو تم إضافة محتوى جديد."
            onRefresh={refresh}
            onBack={() => navigation.goBack()}
          />
        ) : (
          visibleLectures.map((lecture) => {
            const type = getLectureType(lecture, isMaterials);
            const originalVideoUrl = normalizeUrl(lecture?.url);
            const progressKey = getVideoProgressKey({
              lectureId: lecture?.id || '',
              originalVideoUrl,
              videoUrl: originalVideoUrl,
            });
            return (
              <LectureRow
                key={lecture.id}
                lecture={lecture}
                type={type}
                colors={activeTheme}
                progress={progressMap[progressKey]}
                onPress={openLecture}
              />
            );
          })
        )}
      </ScrollView>
      <CornerLogo />
      <StudentBottomBar navigation={navigation} user={user} colors={activeTheme} activeTab="videos" />
    </SafeAreaView>
  );
}

function getEmptyTitle(isMaterials) {
  if (isMaterials) return 'لا يوجد محتوى هنا بعد';
  return 'لا توجد محاضرات هنا بعد';
}

function ContentEmptyState({ styles, theme, icon, title, description, onRefresh, onBack }) {
  return (
    <View style={styles.emptyPanel}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        <FontAwesome5 name={icon} size={24} color={theme.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>

      <View style={styles.emptyActions}>
        <TouchableOpacity activeOpacity={0.86} style={styles.primaryButton} onPress={onRefresh}>
          <FontAwesome5 name="sync-alt" size={12} color={theme.buttonText} />
          <Text style={styles.primaryButtonText}>تحديث</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.86} style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>رجوع</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme, isCompact, safeBottom = 12) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    paddingHorizontal: isCompact ? 14 : 18,
    paddingTop: 84,
    paddingBottom: 108 + safeBottom,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bg,
  },
  loadingText: {
    color: theme.subText,
    marginTop: 12,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  summaryCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    shadowColor: theme.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  summaryTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
  },
  kicker: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '900',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  title: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  filterBar: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 11,
  },
  filterButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  searchBox: {
    minHeight: 50,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    fontSize: 14,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  errorBox: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: `${theme.danger}16`,
    borderWidth: 1,
    borderColor: theme.danger,
    marginBottom: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: theme.danger,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyPanel: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 21,
    borderWidth: 1,
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
  emptyDescription: {
    color: theme.subText,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 7,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptyActions: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 18,
  },
  primaryButton: {
    minWidth: 96,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: theme.accent,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  primaryButtonText: {
    color: theme.buttonText,
    fontSize: 13,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  secondaryButton: {
    minWidth: 86,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
});
