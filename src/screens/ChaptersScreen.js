import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import ChapterList from '../components/student/ChapterList';
import SubjectCard from '../components/student/SubjectCard';
import StudentBottomBar from '../components/student/StudentBottomBar';
import CornerLogo from '../components/student/CornerLogo';
import useStudentData, { normalizeArabicText } from '../hooks/useStudentData';
import { resolveMobileTheme } from '../theme/theme-config';

const getStudentGrade = (user = {}) =>
  user?.academicYear || user?.grade || user?.year || user?.accessYear || user?.codeYear || '';

const lessonMatchesSubject = (lesson = {}, subjectId = '', subjectName = '') => {
  if (subjectId && String(lesson.subjectId || '') === String(subjectId)) return true;

  const normalizedSubjectName = normalizeArabicText(subjectName);
  return [lesson.subject, lesson.subjectName]
    .filter(Boolean)
    .some((name) => normalizeArabicText(name) === normalizedSubjectName);
};

const lessonMatchesChapter = (lesson = {}, chapter = {}) => {
  const chapterId = String(chapter.id || chapter.chapterId || '');
  if (chapterId && String(lesson.chapterId || '') === chapterId) return true;

  const normalizedChapterName = normalizeArabicText(chapter.name || chapter.title || chapter.chapterName || '');
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

const getSubjectChapters = ({ chaptersBySubject, subjectId, subjectName, yearKey, lessons }) => {
  const byId = subjectId ? chaptersBySubject[subjectId] || [] : [];
  const byName = subjectName ? chaptersBySubject[`name:${subjectName}`] || [] : [];
  const map = new Map();

  [...byId, ...byName].forEach((chapter) => {
    const chapterYear = normalizeArabicText(chapter.year);
    const sameYear = !chapter.year || chapter.year === 'مشترك' || chapterYear === yearKey;
    const hasLessons = lessons.some((lesson) => lessonMatchesChapter(lesson, chapter));
    if (chapter?.id && sameYear && hasLessons) map.set(chapter.id, chapter);
  });

  return Array.from(map.values());
};

export default function ChaptersScreen({
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

  const contentKind = params.contentKind || 'videos';
  const subjectId = params.subjectId || '';
  const subjectName = params.subjectName || '';
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

  const subjectLessons = useMemo(
    () => getSubjectLessons({ section, subjectId, subjectName, contentKind }),
    [contentKind, section, subjectId, subjectName]
  );

  const chapters = useMemo(
    () => getSubjectChapters({
      chaptersBySubject: data.chaptersBySubject,
      subjectId,
      subjectName,
      yearKey,
      lessons: subjectLessons,
    }),
    [data.chaptersBySubject, subjectId, subjectLessons, subjectName, yearKey]
  );

  const unassignedCount = subjectLessons.filter((lesson) => !lesson.chapterId && !lesson.chapterName).length;
  const navigateToLectures = (chapter) => {
    navigation.navigate('Lectures', {
      user,
      contentKind,
      accessYear,
      yearKey,
      subjectId,
      subjectName,
      chapterId: chapter?.id || '',
      chapterName: chapter?.name || chapter?.title || '',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={activeTheme.accent} />}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={[styles.summaryIcon, { backgroundColor: activeTheme.cardAlt, borderColor: activeTheme.border }]}>
              <FontAwesome5 name={isMaterials ? 'file-alt' : 'book-open'} size={22} color={activeTheme.accent} />
            </View>

            <View style={styles.summaryText}>
              <Text style={styles.kicker}>{accessYear || 'السنة الدراسية'}</Text>
              <Text style={styles.title}>{subjectName || 'المادة'}</Text>
            </View>
          </View>

        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <FontAwesome5 name="exclamation-circle" size={15} color={activeTheme.danger} />
            <Text style={styles.errorText}>تعذر تحميل البيانات. اسحب للتحديث مرة أخرى.</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.centerCard}>
            <ActivityIndicator color={activeTheme.accent} />
            <Text style={styles.loadingText}>جاري تحميل الشباتر...</Text>
          </View>
        ) : chapters.length === 0 && subjectLessons.length === 0 ? (
          <ContentEmptyState
            styles={styles}
            theme={activeTheme}
            icon={isMaterials ? 'file-pdf' : 'video-slash'}
            title={isMaterials ? 'لا يوجد محتوى بعد' : 'لا توجد محاضرات بعد'}
            description="المحتوى الخاص بهذه المادة سيظهر هنا بمجرد إضافته من لوحة التحكم."
            onRefresh={refresh}
            onBack={() => navigation.goBack()}
          />
        ) : chapters.length === 0 && subjectLessons.length > 0 ? (
          <SubjectCard
            title={isMaterials ? 'عرض المحتوى' : 'عرض المحاضرات'}
            subtitle="متاحة بدون تقسيم شباتر"
            icon={isMaterials ? 'file-pdf' : 'play-circle'}
            colors={isMaterials
              ? [
                activeTheme.accentAlt || activeTheme.accent,
                activeTheme.accentOrange || activeTheme.accent,
                activeTheme.accent,
              ]
              : [activeTheme.accent, activeTheme.accentAlt]}
            onPress={() => navigateToLectures(null)}
          />
        ) : (
          <ChapterList
            chapters={chapters}
            colors={activeTheme}
            unassignedCount={unassignedCount}
            unassignedTitle={isMaterials ? 'محتوى عام' : 'محاضرات عامة'}
            emptyText="لا توجد شباتر لهذه المادة حاليًا"
            onSelectChapter={navigateToLectures}
            onSelectUnassigned={() => navigateToLectures({ id: 'no-chapter', name: isMaterials ? 'محتوى عام' : 'محاضرات عامة' })}
          />
        )}
      </ScrollView>
      <CornerLogo />
      <StudentBottomBar navigation={navigation} user={user} colors={activeTheme} activeTab="videos" />
    </SafeAreaView>
  );
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
    paddingTop: 92,
    paddingBottom: 108 + safeBottom,
  },
  centerCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    alignItems: 'center',
    padding: 24,
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
    borderRadius: 24,
    padding: 17,
    marginBottom: 16,
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
    width: 58,
    height: 58,
    borderRadius: 19,
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
  },
  title: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    color: theme.subText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statPill: {
    minWidth: 78,
    flexGrow: 1,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.borderSoft || theme.border,
    backgroundColor: theme.cardAlt,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'flex-end',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  statLabel: {
    color: theme.subText,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
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
