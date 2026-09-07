import React, { useMemo } from 'react';
import {
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
import SubjectCard from '../components/student/SubjectCard';
import StudentBottomBar from '../components/student/StudentBottomBar';
import CornerLogo from '../components/student/CornerLogo';
import useStudentData from '../hooks/useStudentData';
import { resolveMobileTheme } from '../theme/theme-config';

const getStudentGrade = (user = {}) =>
  user?.academicYear || user?.grade || user?.year || user?.accessYear || user?.codeYear || '';

const toDateValue = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatLastUpdate = (section = {}) => {
  const values = [
    ...(section.lessons || []),
    ...(section.materialLessons || []),
  ].flatMap((item) => [
    item.updatedAt,
    item.createdAt,
    item.uploadedAt,
    item.date,
    item.startDate,
  ]).map(toDateValue).filter(Boolean);

  if (!values.length) return '';
  return new Date(Math.max(...values)).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getSectionStats = (section = {}, contentKind = 'videos') => {
  const isMaterials = contentKind === 'materials';
  const subjects = isMaterials ? section.materialSubjects || [] : section.subjects || [];
  const lessons = isMaterials ? section.materialLessons || [] : section.lessons || [];
  const allLessons = section.lessons || [];
  const allMaterials = section.materialLessons || [];
  const chapterIds = new Set(allLessons.map((lesson) => lesson.chapterId).filter(Boolean));
  const visibleChapterIds = new Set(lessons.map((lesson) => lesson.chapterId).filter(Boolean));

  return {
    isMaterials,
    subjects: subjects.length,
    chapters: visibleChapterIds.size || chapterIds.size,
    lessons: lessons.length,
    videos: allLessons.filter((lesson) => !!lesson.url).length,
    files: allMaterials.length || allLessons.filter((lesson) => !!lesson.pdfUrl).length,
    hasContent: lessons.length > 0 || subjects.length > 0,
    lastUpdate: formatLastUpdate(section),
  };
};

export default function YearSelectionScreen({
  route,
  navigation,
  user: propUser,
  theme,
  themeMode,
}) {
  const params = route?.params || {};
  const user = params.user || propUser || null;
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
  });

  const enrichedSections = useMemo(() => data.sections.map((section) => ({
    ...section,
    stats: getSectionStats(section, contentKind),
  })), [contentKind, data.sections]);

  const openCodes = () => {
    navigation.navigate('StudentHome', { initialTab: 'codes' });
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
              <FontAwesome5 name="graduation-cap" size={23} color={activeTheme.accent} />
            </View>

            <View style={styles.summaryText}>
              <Text style={styles.kicker}>{isMaterials ? 'المحتوى التعليمي' : 'الفيديوهات والمحاضرات'}</Text>
              <Text style={styles.title}>اختار المرحلة</Text>
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
          <YearSkeleton colors={activeTheme} />
        ) : data.accessLocked ? (
          <LockedState
            styles={styles}
            theme={activeTheme}
            isBanned={data.isAccountBanned}
            onActivate={openCodes}
          />
        ) : enrichedSections.length === 0 ? (
          <EmptyYearsState styles={styles} theme={activeTheme} onActivate={openCodes} />
        ) : (
          <>
            {enrichedSections.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: activeTheme.cardAlt, borderColor: activeTheme.border }]}>
                  <FontAwesome5 name="filter" size={23} color={activeTheme.accent} />
                </View>
                <Text style={styles.emptyTitle}>لا توجد فرق في هذا الفلتر</Text>
                <Text style={styles.emptyText}>غير الفلتر لعرض باقي الفرق المتاحة.</Text>
              </View>
            ) : (
              enrichedSections.map((section) => {
                const stats = section.stats;
                return (
                  <SubjectCard
                    key={section.yearKey}
                    title={section.accessYear}
                    icon="graduation-cap"
                    colors={stats.hasContent
                      ? (isMaterials
                        ? [
                          activeTheme.accentAlt || activeTheme.accent,
                          activeTheme.accentOrange || activeTheme.accent,
                          activeTheme.accent,
                        ]
                        : [activeTheme.accent, activeTheme.accentAlt])
                      : [
                        activeTheme.accentAlt || activeTheme.accent,
                        activeTheme.muted || activeTheme.subText,
                      ]}
                    disabled={!stats.hasContent}
                    onPress={() => navigation.navigate('Subjects', {
                      user,
                      contentKind,
                      accessYear: section.accessYear,
                      yearKey: section.yearKey,
                    })}
                  />
                );
              })
            )}
          </>
        )}
      </ScrollView>
      <CornerLogo />
      <StudentBottomBar navigation={navigation} user={user} colors={activeTheme} activeTab="videos" />
    </SafeAreaView>
  );
}

function LockedState({ styles, theme, isBanned, onActivate }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: `${theme.danger}16`, borderColor: theme.danger }]}>
        <FontAwesome5 name={isBanned ? 'ban' : 'lock'} size={24} color={theme.danger} />
      </View>
      <Text style={styles.emptyTitle}>{isBanned ? 'تم حظر الحساب' : 'لا توجد كورسات مرتبطة بحسابك حاليًا'}</Text>
      <Text style={styles.emptyText}>
        {isBanned
          ? 'تواصل مع الدعم الفني لاستعادة الوصول.'
          : 'أدخل رمز التسجيل الذي حصلت عليه من إدارة المنصة لربط الكورس بحسابك.'}
      </Text>
      {!isBanned && (
        <TouchableOpacity activeOpacity={0.86} style={styles.primaryButton} onPress={onActivate}>
          <Text style={styles.primaryButtonText}>تأكيد التسجيل</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyYearsState({ styles, theme, onActivate }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
        <FontAwesome5 name="graduation-cap" size={26} color={theme.accent} />
      </View>
      <Text style={styles.emptyTitle}>لا توجد كورسات مرتبطة بحسابك حاليًا</Text>
      <Text style={styles.emptyText}>أدخل رمز التسجيل من صفحة تأكيد التسجيل لربط الكورس بحسابك.</Text>
      <TouchableOpacity activeOpacity={0.86} style={styles.primaryButton} onPress={onActivate}>
        <Text style={styles.primaryButtonText}>تأكيد التسجيل</Text>
      </TouchableOpacity>
    </View>
  );
}

function YearSkeleton({ colors }) {
  return (
    <View>
      <View style={[skeletonStyles.header, { backgroundColor: colors.card, borderColor: colors.border }]} />
      {[0, 1, 2].map((item) => (
        <View key={item} style={[skeletonStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[skeletonStyles.icon, { backgroundColor: `${colors.accent}24` }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[skeletonStyles.lineLarge, { backgroundColor: colors.border }]} />
            <View style={[skeletonStyles.lineSmall, { backgroundColor: colors.border }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  header: {
    height: 132,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 16,
  },
  card: {
    minHeight: 112,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 17,
  },
  lineLarge: {
    width: '70%',
    height: 13,
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
  lineSmall: {
    width: '48%',
    height: 10,
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
});

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
    textAlign: 'right',
    writingDirection: 'rtl',
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
    lineHeight: 20,
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
  filterBar: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 13,
  },
  filterButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '900',
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
  primaryButton: {
    minWidth: 112,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginTop: 18,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.buttonText,
    fontSize: 13,
    fontWeight: '900',
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
});
