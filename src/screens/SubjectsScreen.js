import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import SubjectCard from '../components/student/SubjectCard';
import StudentBottomBar from '../components/student/StudentBottomBar';
import CornerLogo from '../components/student/CornerLogo';
import useStudentData, { normalizeArabicText } from '../hooks/useStudentData';
import { resolveMobileTheme } from '../theme/theme-config';

const getStudentGrade = (user = {}) =>
  user?.academicYear || user?.grade || user?.year || user?.accessYear || user?.codeYear || '';

const getSubjectName = (subject = {}) => String(subject.name || subject.title || 'مادة بدون اسم').trim();

const getRealSubjectId = (subject = {}) => {
  const value = String(subject.subjectId || subject.id || '');
  return value.startsWith('name:') ? '' : value;
};

const lessonMatchesSubject = (lesson = {}, subject = {}, subjectName = '') => {
  const subjectId = getRealSubjectId(subject);
  if (subjectId && String(lesson.subjectId || '') === subjectId) return true;

  const normalizedSubjectName = normalizeArabicText(subjectName);
  return [lesson.subject, lesson.subjectName]
    .filter(Boolean)
    .some((name) => normalizeArabicText(name) === normalizedSubjectName);
};

const getSubjectLessons = (section, subject, subjectName, contentKind) => {
  const lessons = contentKind === 'materials'
    ? section?.materialLessons || []
    : section?.lessons || [];
  return lessons.filter((lesson) => lessonMatchesSubject(lesson, subject, subjectName));
};

const getSubjectChapters = ({ chaptersBySubject, subject, subjectName, lessons }) => {
  const subjectId = subject.subjectId || subject.id || '';
  const byId = subjectId ? chaptersBySubject[subjectId] || [] : [];
  const byName = subjectName ? chaptersBySubject[`name:${subjectName}`] || [] : [];
  const lessonChapterIds = new Set(lessons.map((lesson) => lesson.chapterId).filter(Boolean));
  const map = new Map();

  [...byId, ...byName].forEach((chapter) => {
    if (!chapter?.id) return;
    if (!lessonChapterIds.size || lessonChapterIds.has(chapter.id)) map.set(chapter.id, chapter);
  });

  return Array.from(map.values());
};

const toDateValue = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatLastUpdate = (subject, lessons) => {
  const values = [
    subject.updatedAt,
    subject.createdAt,
    subject.lastUpdated,
    subject.uploadedAt,
    ...lessons.flatMap((lesson) => [
      lesson.updatedAt,
      lesson.createdAt,
      lesson.uploadedAt,
      lesson.date,
      lesson.startDate,
    ]),
  ].map(toDateValue).filter(Boolean);

  if (!values.length) return '';
  return new Date(Math.max(...values)).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const resolveSubjectType = ({ videoCount, fileCount }) => {
  if (videoCount > 0 && fileCount > 0) {
    return {
      badge: 'مختلطة',
      icon: 'layer-group',
      colorsKey: 'mixed',
      subtitle: 'مادة تحتوي على محتوى متنوع',
    };
  }

  if (fileCount > 0) {
    return {
      badge: 'محتوى',
      icon: 'file-pdf',
      colorsKey: 'files',
      subtitle: 'مادة محتوى ومذكرات',
    };
  }

  return {
    badge: 'فيديوهات',
    icon: 'play-circle',
    colorsKey: 'videos',
    subtitle: videoCount > 0 ? 'مادة فيديوهات ومحاضرات' : 'المحتوى قادم قريبًا',
  };
};

function SubjectSkeleton({ styles, theme }) {
  return (
    <View>
      {[0, 1, 2].map((item) => (
        <View key={item} style={[styles.skeletonCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.skeletonIcon, { backgroundColor: `${theme.accent}24` }]} />
          <View style={styles.skeletonLines}>
            <View style={[styles.skeletonLineLarge, { backgroundColor: theme.border }]} />
            <View style={[styles.skeletonLineSmall, { backgroundColor: theme.border }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function SubjectsScreen({
  route,
  navigation,
  user: propUser,
  theme,
  themeMode,
}) {
  const params = route?.params || {};
  const user = params.user || propUser || null;
  const accessYear = params.accessYear || '';
  const yearKey = normalizeArabicText(params.yearKey || accessYear);
  const contentKind = params.contentKind || 'videos';
  const isMaterials = contentKind === 'materials';
  const activeThemeMode = themeMode || theme?.mode || 'light';
  const activeTheme = theme || resolveMobileTheme(activeThemeMode);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom || 0, Platform.OS === 'ios' ? 22 : 12);
  const styles = useMemo(() => createStyles(activeTheme, width < 370, safeBottom), [activeTheme, width, safeBottom]);

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

  const subjects = isMaterials ? section?.materialSubjects || [] : section?.subjects || [];

  const enrichedSubjects = useMemo(() => subjects.map((subject) => {
    const subjectName = getSubjectName(subject);
    const lessons = getSubjectLessons(section, subject, subjectName, contentKind);
    const chapters = getSubjectChapters({
      chaptersBySubject: data.chaptersBySubject,
      subject,
      subjectName,
      lessons,
    });
    const videoCount = lessons.filter((lesson) => !!lesson.url).length;
    const fileCount = lessons.filter((lesson) => !!lesson.pdfUrl).length;
    const type = isMaterials
      ? {
        badge: 'محتوى',
        icon: 'file-pdf',
        colorsKey: 'files',
        subtitle: lessons.length > 0 ? 'مادة محتوى ومذكرات' : 'المحتوى قادم قريبًا',
      }
      : resolveSubjectType({ videoCount, fileCount });

    return {
      ...subject,
      subjectName,
      lessons,
      chapters,
      chapterCount: chapters.length,
      lectureCount: lessons.length,
      videoCount,
      fileCount,
      lastUpdate: formatLastUpdate(subject, lessons),
      type,
      hasContent: lessons.length > 0 || chapters.length > 0,
    };
  }), [contentKind, data.chaptersBySubject, isMaterials, section, subjects]);

  const filteredSubjects = enrichedSubjects;

  const getSubjectColors = (subject) => {
    if (!subject.hasContent) {
      return [
        activeTheme.accentAlt || activeTheme.accent,
        activeTheme.muted || activeTheme.subText,
      ];
    }
    if (subject.type.colorsKey === 'files') {
      return [
        activeTheme.accentAlt || activeTheme.accent,
        activeTheme.accentOrange || activeTheme.accent,
        activeTheme.accent,
      ];
    }
    if (subject.type.colorsKey === 'mixed') return [activeTheme.accentGreen, activeTheme.accentAlt];
    return [activeTheme.accent, activeTheme.accentAlt];
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={activeTheme.accent} />}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={[styles.summaryIcon, { backgroundColor: activeTheme.cardAlt, borderColor: activeTheme.border }]}>
              <FontAwesome5 name="graduation-cap" size={22} color={activeTheme.accent} />
            </View>

            <View style={styles.summaryText}>
              <Text style={styles.kicker}>المرحلة المختارة</Text>
              <Text style={styles.title}>{section?.accessYear || accessYear || 'السنة الدراسية'}</Text>
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
          <SubjectSkeleton styles={styles} theme={activeTheme} />
        ) : (
          <>
            {subjects.length === 0 ? (
              <EmptyState
                styles={styles}
                theme={activeTheme}
                icon="book-open"
            title="لا توجد مواد متاحة لهذه المرحلة حاليًا"
                text="المواد ستظهر هنا بمجرد إضافتها من لوحة التحكم."
              />
            ) : filteredSubjects.length === 0 ? (
              <EmptyState
                styles={styles}
                theme={activeTheme}
                icon="search"
                title="لا توجد نتيجة بهذا الاسم"
                text="جرب كتابة اسم المادة بطريقة مختلفة."
              />
            ) : (
              filteredSubjects.map((subject) => (
                <SubjectCard
                  key={`${yearKey}:${subject.subjectId || subject.id || subject.subjectName}`}
                  title={subject.subjectName}
                  icon="book"
                  colors={getSubjectColors(subject)}
                  disabled={!subject.hasContent}
                  onPress={() => navigation.navigate('Chapters', {
                    user,
                    contentKind,
                    accessYear: section?.accessYear || accessYear,
                    yearKey,
                    subjectId: subject.subjectId || subject.id || '',
                    subjectName: subject.subjectName,
                  })}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
      <CornerLogo />
      <StudentBottomBar navigation={navigation} user={user} colors={activeTheme} activeTab="videos" />
    </SafeAreaView>
  );
}


function EmptyState({ styles, theme, icon, title, text }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        <FontAwesome5 name={icon} size={24} color={theme.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
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
  summaryCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 17,
    marginBottom: 14,
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
    textAlign: 'right',
  },
  title: {
    color: theme.text,
    fontSize: 24,
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
    minWidth: 82,
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
  emptyState: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 34,
    paddingHorizontal: 18,
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
    fontSize: 16,
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
  skeletonCard: {
    minHeight: 102,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  skeletonIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
  },
  skeletonLines: {
    flex: 1,
    gap: 9,
  },
  skeletonLineLarge: {
    width: '70%',
    height: 13,
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
  skeletonLineSmall: {
    width: '48%',
    height: 10,
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
});
