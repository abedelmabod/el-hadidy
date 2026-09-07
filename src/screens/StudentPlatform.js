import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import ThemeToggleButton from '../components/ThemeToggleButton';
import ThemePickerModal from '../components/ThemePickerModal';
import CornerLogo from '../components/student/CornerLogo';
import useStudentData, { normalizeDigits } from '../hooks/useStudentData';
import { resolveMobileTheme, THEME_CHOICES } from '../theme/theme-config';

const STUDENT_ONBOARDING_KEY = 'elhadidy_student_onboarding_seen';
const SHOW_MATERIALS_SECTION = false;

const HOME_CARDS = [
  { id: 'videos', title: 'الفيديوهات', subtitle: 'المواد والشباتر', icon: 'play-circle-outline' },
  { id: 'computerLink', title: 'الربط بالكمبيوتر', subtitle: 'طلب تفعيل نسخة الويندوز', icon: 'monitor' },
  { id: 'materials', title: 'المحتوى', subtitle: 'مذكرات تعليمية', icon: 'book-open-page-variant-outline' },
  { id: 'history', title: 'آخر ما شاهدته', subtitle: 'كمل مذاكرتك', icon: 'history' },
  { id: 'codes', title: 'تأكيد التسجيل', subtitle: 'ربط كورس', icon: 'qrcode-scan' },
  { id: 'support', title: 'الدعم الفني', subtitle: 'الجهاز وكلمة المرور', icon: 'headset' },
];

const VISIBLE_HOME_CARDS = SHOW_MATERIALS_SECTION
  ? HOME_CARDS
  : HOME_CARDS.filter((card) => card.id !== 'materials');

const HOME_GRID_CARDS = VISIBLE_HOME_CARDS.filter((card) => card.id !== 'support');

const TABS = [
  { id: 'home', label: 'الرئيسية', icon: 'home' },
  { id: 'videos', label: 'الفيديوهات', icon: 'play-circle' },
  { id: 'codes', label: 'التسجيل', icon: 'qrcode' },
  { id: 'materials', label: 'المحتوى', icon: 'book' },
  { id: 'profile', label: 'حسابي', icon: 'user' },
];

const VISIBLE_TABS = SHOW_MATERIALS_SECTION
  ? TABS
  : TABS.filter((tab) => tab.id !== 'materials');

export default function StudentPlatform({
  route,
  navigation,
  user: propUser,
  setUser: propSetUser,
  theme,
  themeMode,
  themeOptions,
  toggleTheme,
  selectThemeMode,
}) {
  const routeParams = route?.params || {};
  const user = routeParams.user || propUser || null;
  const setUser = routeParams.setUser || propSetUser;
  const nav = navigation || useNavigation();
  const activeThemeMode = themeMode || theme?.mode || 'light';
  const activeTheme = theme || resolveMobileTheme(activeThemeMode);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 370;
  const safeTop = Math.max(insets.top || 0, Platform.OS === 'ios' ? 44 : 24);
  const safeBottom = Math.max(insets.bottom || 0, Platform.OS === 'ios' ? 22 : 12);
  const styles = useMemo(
    () => createStyles(activeTheme, isCompact, safeTop, safeBottom),
    [activeTheme, isCompact, safeTop, safeBottom]
  );
  const quickCardAnimations = useRef(HOME_GRID_CARDS.map(() => new Animated.Value(0))).current;

  const studentGrade = user?.academicYear || user?.grade || user?.year || user?.accessYear || user?.codeYear || '';
  const { data, refreshing, error, refresh, activateTeacherCode } = useStudentData(studentGrade, {
    studentId: user?.id || user?.uid,
    fallbackUser: user,
    initialLoading: false,
    skipContent: true,
  });

  const [activeTab, setActiveTab] = useState('home');
  const [teacherCode, setTeacherCode] = useState('');
  const [submittingCode, setSubmittingCode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  const availableThemeOptions = themeOptions?.length ? themeOptions : THEME_CHOICES;

  useEffect(() => {
    if (routeParams.initialTab) {
      setActiveTab(routeParams.initialTab);
    }
  }, [routeParams.initialTab]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STUDENT_ONBOARDING_KEY)
      .then((value) => {
        if (mounted && value !== '1') setShowOnboarding(true);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const currentStudent = data.currentStudent || user || {};
  useEffect(() => {
    if (activeTab !== 'home') return;

    quickCardAnimations.forEach((animation) => animation.setValue(0));
    Animated.stagger(
      80,
      quickCardAnimations.map((animation) => Animated.timing(animation, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }))
    ).start();
  }, [activeTab, quickCardAnimations]);

  const chooseTheme = useCallback((nextThemeMode) => {
    if (typeof selectThemeMode === 'function') {
      selectThemeMode(nextThemeMode);
    } else if (typeof toggleTheme === 'function') {
      toggleTheme(nextThemeMode);
    }
    setThemePickerVisible(false);
  }, [selectThemeMode, toggleTheme]);

  const openYearSelection = useCallback((kind) => {
    if (kind === 'materials' && !SHOW_MATERIALS_SECTION) return;
    const params = {
      user,
      contentKind: kind,
      openedAt: Date.now(),
    };
    if (typeof nav?.push === 'function') {
      nav.push('YearSelection', params);
      return;
    }
    nav?.navigate?.('YearSelection', params);
  }, [nav, user]);

  const closeOnboarding = useCallback(async () => {
    setShowOnboarding(false);
    await AsyncStorage.setItem(STUDENT_ONBOARDING_KEY, '1').catch(() => {});
  }, []);

  useEffect(() => {
    const isHiddenMaterialsTab = activeTab === 'materials' && !SHOW_MATERIALS_SECTION;
    if (activeTab !== 'videos' && activeTab !== 'materials') return;
    if (isHiddenMaterialsTab) {
      setActiveTab('home');
      return;
    }
    const kind = activeTab;
    setActiveTab('home');
    openYearSelection(kind);
  }, [activeTab, openYearSelection]);

  const openWhatsAppSupport = useCallback(() => {
    const phone = '201044811399';
    const studentName = currentStudent?.name || currentStudent?.username || 'طالب';
    const studentPhone = currentStudent?.phone || 'غير مسجل';
    const text = encodeURIComponent(
      `اسم الطالب: ${studentName}\nرقم الهاتف: ${studentPhone}`
    );

    Linking.openURL(`whatsapp://send?phone=${phone}&text=${text}`).catch(() => {
      Linking.openURL(`https://wa.me/${phone}?text=${text}`).catch(() => {
        Alert.alert('تعذر الفتح', 'لم نتمكن من فتح واتساب الآن.');
      });
    });
  }, [currentStudent]);

  const handleActivateCode = useCallback(async () => {
    setSubmittingCode(true);
    try {
      const accessYear = await activateTeacherCode(teacherCode);
      setTeacherCode('');
      Alert.alert('تم تأكيد التسجيل', 'تم ربط الكورس بحسابك بنجاح.');
    } catch (activateError) {
      Alert.alert('تنبيه', activateError?.message || 'لا يمكن إتمام تأكيد التسجيل حاليًا. حاول مرة أخرى.');
    } finally {
      setSubmittingCode(false);
    }
  }, [activateTeacherCode, teacherCode]);

  const logout = () => {
    const performLogout = () => setUser?.(null);
    if (Platform.OS === 'web') {
      if (window.confirm('هل أنت متأكد من تسجيل الخروج؟')) performLogout();
      return;
    }
    Alert.alert('تسجيل الخروج', 'هل أنت متأكد من رغبتك في الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: performLogout },
    ]);
  };

  const renderLocked = () => (
    <View style={styles.lockedCard}>
      <FontAwesome5
        name={data.isAccountBanned ? 'ban' : 'lock'}
        size={28}
        color={activeTheme.danger}
      />
      <Text style={styles.lockedTitle}>
        {data.isAccountBanned ? 'تم حظر الحساب' : 'لا توجد كورسات مرتبطة بحسابك حاليًا'}
      </Text>
      <Text style={styles.lockedText}>
        {data.isAccountBanned
          ? 'تواصل مع الدعم الفني لاستعادة الوصول.'
          : 'هذا التطبيق مخصص للطلاب المسجلين مسبقًا. أدخل رمز التسجيل لربط الكورس بحسابك.'}
      </Text>
      <TouchableOpacity style={styles.primaryButton} onPress={() => setActiveTab('support')}>
        <Text style={styles.primaryButtonText}>تواصل مع الدعم</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHome = () => (
    <View>
      <LinearGradient
        colors={activeTheme.gradient || [activeTheme.accentAlt || activeTheme.accent, activeTheme.accentOrange || activeTheme.accent]}
        style={styles.hero}
      >
        <View style={styles.logoBox}>
          <Image source={require('../../assets/logo-main-transparent.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
      </LinearGradient>


      <Text style={styles.sectionTitle}>الأقسام</Text>
      <View style={styles.quickGrid}>
        {HOME_GRID_CARDS.map((card, index) => (
          <Animated.View
            key={card.id}
            style={[
              styles.quickCardShell,
              {
                opacity: quickCardAnimations[index],
                transform: [
                  {
                    translateY: quickCardAnimations[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                  {
                    scale: quickCardAnimations[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.quickCard}
              activeOpacity={0.86}
              onPress={() => {
                if (card.id === 'support') {
                  setActiveTab('support');
                  return;
                }
                if (card.id === 'history') {
                  nav?.navigate?.('WatchHistory');
                  return;
                }
                if (card.id === 'computerLink') {
                  nav?.navigate?.('ComputerLink', { user: currentStudent });
                  return;
                }
                if (card.id === 'videos' || card.id === 'materials') {
                  openYearSelection(card.id === 'materials' ? 'materials' : 'videos');
                  return;
                }
                setActiveTab(card.id);
              }}
            >
              <MaterialCommunityIcons
                name={card.icon}
                size={28}
                color={activeTheme.accent}
              />
              <Text style={styles.quickCardText}>{card.title}</Text>
              <Text style={styles.quickCardSub}>{card.subtitle || ''}</Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.supportStrip}
        onPress={() => setActiveTab('support')}
        activeOpacity={0.86}
      >
        <View style={styles.supportStripIcon}>
          <FontAwesome5 name="headset" size={18} color={activeTheme.accent} />
        </View>
        <View style={styles.supportStripText}>
          <Text style={styles.supportStripTitle}>الدعم الفني</Text>
          <Text style={styles.supportStripSub}>الجهاز وكلمة المرور</Text>
        </View>
        <FontAwesome5 name="chevron-left" size={12} color={activeTheme.subText} />
      </TouchableOpacity>

      <View style={[
        styles.statusCard,
        data.accessLocked ? styles.statusCardLocked : styles.statusCardActive,
      ]}>
        <View style={styles.statusHeader}>
          <View style={[
            styles.statusIconBox,
            { backgroundColor: data.accessLocked ? `${activeTheme.danger}18` : `${activeTheme.success}18` },
          ]}>
            <FontAwesome5
              name={data.accessLocked ? 'lock' : 'check-circle'}
              size={18}
              color={data.accessLocked ? activeTheme.danger : activeTheme.success}
            />
          </View>
          <View style={styles.rtlFlexContent}>
            <Text style={styles.statusEyebrow}>حالة الحساب</Text>
            <Text style={styles.statusTitle}>
              {data.accessLocked ? 'لا توجد كورسات مرتبطة بعد' : 'تم تأكيد تسجيلك بنجاح'}
            </Text>
          </View>
        </View>

        <Text style={styles.statusText}>
          {data.accessLocked
            ? 'هذا المحتوى متاح للطلاب المسجلين مسبقًا. أدخل رمز التسجيل المقدم من إدارة المنصة لربط الكورس بحسابك.'
            : 'يمكنك الدخول إلى الفيديوهات والمذكرات الخاصة بالكورسات المرتبطة بحسابك.'}
        </Text>

        {!data.accessLocked && data.accessYears.length > 0 && (
          <View style={styles.statusChips}>
            {data.accessYears.map((year) => (
              <View key={year} style={styles.statusChip}>
                <Text style={styles.statusChipText}>{year}</Text>
              </View>
            ))}
          </View>
        )}

        {data.accessLocked && (
          <TouchableOpacity style={styles.statusAction} onPress={() => setActiveTab('codes')}>
            <Text style={styles.statusActionText}>أدخل رمز التسجيل</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderContentHeader = () => {
    let title = contentKind === 'materials' ? 'المحتوى' : 'الفيديوهات';
    let subtitle = 'اختر المرحلة';
    if (selectedYear && !selectedSubject) subtitle = 'اختر المادة';
    if (selectedSubject && !selectedChapter) subtitle = 'اختر الشابتر';
    if (selectedChapter) subtitle = contentKind === 'materials' ? 'المحتوى' : 'المحاضرات';

    return (
      <View style={styles.pathHeader}>
        <Text style={styles.pathLabel}>{title}</Text>
        <Text style={styles.pathTitle}>{subtitle}</Text>
        {!!selectedYear && (
          <Text style={styles.pathSub}>
            {[selectedYear.accessYear, selectedSubject?.name, selectedChapter?.name].filter(Boolean).join(' / ')}
          </Text>
        )}
      </View>
    );
  };

  const renderBackButton = () => {
    if (!selectedYear) return null;
    return (
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => {
          if (selectedChapter) {
            setSelectedChapter(null);
          } else if (selectedSubject) {
            setSelectedSubject(null);
          } else {
            setSelectedYear(null);
          }
        }}
      >
        <FontAwesome5 name="arrow-right" size={13} color={activeTheme.accent} />
        <Text style={styles.backButtonText}>رجوع</Text>
      </TouchableOpacity>
    );
  };

  const renderContent = (kind) => {
    // Legacy inline content flow is intentionally disabled.
    // Videos/materials now always use the stack flow:
    // YearSelection -> Subjects -> Chapters -> Lectures.
    return null;

    const isMaterials = kind === 'materials';
    if (data.accessLocked) return renderLocked();

    return (
      <View>
        {renderBackButton()}
        {renderContentHeader()}

        {!selectedYear && (
          activeSections.length ? activeSections.map((section) => {
            const sectionSubjects = isMaterials ? section.materialSubjects || [] : section.subjects || [];
            const sectionLessons = isMaterials ? section.materialLessons || [] : section.lessons || [];
            const hasContent = sectionSubjects.length > 0 || sectionLessons.length > 0;

            return (
              <SubjectCard
                key={section.yearKey}
                title={section.accessYear}
                subtitle={hasContent ? 'جاهزة للدخول إلى المحتوى' : 'المحتوى قادم قريبًا'}
                badge={hasContent ? 'جاهزة' : 'قادم قريبًا'}
                icon="graduation-cap"
                colors={hasContent
                  ? [activeTheme.accent, activeTheme.accentAlt]
                  : [activeTheme.cardAlt, activeTheme.surface || activeTheme.cardAlt]}
                disabled={!hasContent}
                mutedHint={!hasContent ? 'سيظهر المحتوى هنا بعد إضافته.' : ''}
                onPress={() => setSelectedYear(section)}
              />
            );
          }) : (
            <EmptyState text="لا يوجد محتوى متاح حالياً" colors={activeTheme} />
          )
        )}

        {selectedYear && !selectedSubject && (
          activeSubjects.length ? activeSubjects.map((subject) => {
            const subjectLessons = (isMaterials ? selectedYear.materialLessons || [] : selectedYear.lessons || [])
              .filter((lesson) => (lesson.subject || 'عام') === subject.name);
            const subjectChapters = getChaptersForSubject(data.chaptersBySubject, subject, selectedYear.yearKey)
              .filter((chapter) => subjectLessons.some((lesson) => lesson.chapterId === chapter.id));
            const videoCount = subjectLessons.filter((lesson) => !!lesson.url).length;
            const fileCount = subjectLessons.filter((lesson) => !!lesson.pdfUrl).length;
            const hasContent = subjectLessons.length > 0 || subjectChapters.length > 0;
            const isMixed = videoCount > 0 && fileCount > 0;
            const badge = isMixed ? 'مختلطة' : (isMaterials || fileCount > 0 ? 'محتوى' : 'فيديوهات');
            const icon = 'book';
            const colors = !hasContent
              ? [activeTheme.cardAlt, activeTheme.surface || activeTheme.cardAlt]
              : isMixed
                ? [activeTheme.accentGreen, activeTheme.accentAlt]
                : (isMaterials || fileCount > 0 ? [activeTheme.accentOrange, activeTheme.accentAlt] : [activeTheme.accent, activeTheme.accentAlt]);

            return (
              <SubjectCard
                key={`${selectedYear.yearKey}:${subject.name}`}
                title={subject.name}
                subtitle={hasContent ? 'اختار المادة لعرض الشباتر' : 'المحتوى قادم قريبًا'}
                badge={badge}
                icon={icon}
                colors={colors}
                disabled={!hasContent}
                mutedHint={!hasContent ? 'المحتوى قادم قريبًا' : ''}
                onPress={() => nav.navigate('Chapters', {
                  user,
                  contentKind: isMaterials ? 'materials' : 'videos',
                  accessYear: selectedYear.accessYear,
                  yearKey: selectedYear.yearKey,
                  subjectId: subject.subjectId || subject.id || '',
                  subjectName: subject.name,
                })}
              />
            );
          }) : (
            <EmptyState text="لا توجد مواد متاحة لهذه الفرقة حالياً" colors={activeTheme} />
          )
        )}

        {selectedSubject && !selectedChapter && (
          activeChapters.length === 0 && activeLessons.length > 0 ? (
            activeLessons.map((lecture) => (
              <LectureRow
                key={lecture.id}
                lecture={lecture}
                type={isMaterials ? 'pdf' : 'video'}
                colors={activeTheme}
                onPress={isMaterials ? openPdf : openVideo}
              />
            ))
          ) : (
            <ChapterList
              chapters={activeChapters}
              colors={activeTheme}
              unassignedCount={activeLessons.filter((lesson) => !lesson.chapterId).length}
              unassignedTitle={isMaterials ? 'محتوى عام' : 'فيديوهات عامة'}
              emptyText="لا توجد شابترات أو محاضرات لهذه المادة حالياً"
              onSelectChapter={setSelectedChapter}
              onSelectUnassigned={() => setSelectedChapter({
                id: 'no-chapter',
                name: isMaterials ? 'محتوى عام' : 'فيديوهات عامة',
              })}
            />
          )
        )}

        {selectedChapter && (
          visibleLectures.length ? visibleLectures.map((lecture) => (
            <LectureRow
              key={lecture.id}
              lecture={lecture}
              type={isMaterials ? 'pdf' : 'video'}
              colors={activeTheme}
              onPress={isMaterials ? openPdf : openVideo}
            />
          )) : (
            <EmptyState text={isMaterials ? 'لا يوجد محتوى هنا بعد' : 'لا توجد فيديوهات هنا بعد'} colors={activeTheme} />
          )
        )}
      </View>
    );
  };

  const renderCodes = () => (
    <View>
      <Text style={styles.sectionTitle}>تأكيد التسجيل</Text>
      <Text style={styles.helperText}>
        {Platform.OS === 'ios'
          ? 'هذا التطبيق مخصص للطلاب المسجلين مسبقًا. قم بتسجيل الدخول واستخدم رمز التسجيل المقدم من إدارة المنصة إذا طُلب منك ذلك.'
          : 'هذا التطبيق مخصص للطلاب المسجلين مسبقًا في المنصة. إذا كنت مسجلًا في أحد الكورسات، أدخل رمز التسجيل الذي حصلت عليه من إدارة المنصة لربط الكورس بحسابك.'}
      </Text>
      <TextInput
        value={teacherCode}
        onChangeText={(value) => setTeacherCode(normalizeDigits(value).replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder="مثال: 123456"
        placeholderTextColor={activeTheme.muted}
        style={styles.input}
      />
      <TouchableOpacity
        style={[styles.primaryButton, submittingCode && { opacity: 0.6 }]}
        disabled={submittingCode}
        onPress={handleActivateCode}
      >
        {submittingCode ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>تأكيد التسجيل</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderSupport = () => (
    <View>
      <Text style={styles.sectionTitle}>الدعم الفني</Text>
      <TouchableOpacity style={styles.supportCard} onPress={() => nav?.navigate?.('Support')}>
        <FontAwesome5 name="headset" size={24} color={activeTheme.accent} />
        <View style={styles.profileSupportContent}>
          <Text style={styles.supportTitle}>تواصل مباشر</Text>
          <Text style={styles.supportText}>تواصل معنا لحل أي مشكلة في الحساب أو المحتوى.</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderSupportPanel = () => (
    <View>
      <Text style={styles.sectionTitle}>الدعم الفني</Text>
      <View style={styles.supportCard}>
        <FontAwesome5 name="headset" size={24} color={activeTheme.accent} />
        <View style={styles.rtlFlexContent}>
          <Text style={styles.supportTitle}>مركز مساعدة الطالب</Text>
          <Text style={styles.supportText}>كل ما يخص الجهاز وكلمة المرور والتواصل المباشر في مكان واحد.</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.supportCard} onPress={() => nav?.navigate?.('Support')}>
        <FontAwesome5 name="comments" size={22} color={activeTheme.accent} />
        <View style={styles.rtlFlexContent}>
          <Text style={styles.supportTitle}>تواصل مباشر</Text>
          <Text style={styles.supportText}>افتح صفحة التواصل لو محتاج مساعدة من الفريق.</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderSupportPanelLockedPassword = () => (
    <View>
      <Text style={styles.sectionTitle}>الدعم الفني</Text>
      <View style={styles.supportCard}>
        <FontAwesome5 name="headset" size={24} color={activeTheme.accent} />
        <View style={styles.rtlFlexContent}>
          <Text style={styles.supportTitle}>مركز مساعدة الطالب</Text>
          <Text style={styles.supportText}>يمكنك التواصل مع الدعم الفني لحل أي مشكلة في الحساب أو المحتوى.</Text>
        </View>
      </View>

      <View style={styles.supportInfoCard}>
        <Text style={styles.supportTitle}>كلمة المرور</Text>
        <Text style={styles.supportText}>تغيير كلمة المرور متاح من خلال الدعم فقط لحماية الحساب.</Text>
      </View>

      <TouchableOpacity style={styles.supportCard} onPress={() => nav?.navigate?.('Support')}>
        <FontAwesome5 name="comments" size={22} color={activeTheme.accent} />
        <View style={styles.rtlFlexContent}>
          <Text style={styles.supportTitle}>تواصل مباشر</Text>
          <Text style={styles.supportText}>افتح صفحة التواصل لو محتاج مساعدة من الفريق.</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderProfile = () => (
    <View>
      <View style={styles.profileHero}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {String(currentStudent?.name || currentStudent?.username || 'ط').trim().charAt(0)}
          </Text>
        </View>
        <Text style={styles.profileName}>{currentStudent?.name || 'طالب المنصة'}</Text>
        <Text style={styles.profileUsername}>@{currentStudent?.username || 'student'}</Text>
        <View style={[
          styles.profileStatusBadge,
          { backgroundColor: data.accessLocked ? `${activeTheme.danger}18` : `${activeTheme.success}18` },
        ]}>
          <FontAwesome5
            name={data.accessLocked ? 'lock' : 'check-circle'}
            size={12}
            color={data.accessLocked ? activeTheme.danger : activeTheme.success}
          />
          <Text style={[
            styles.profileStatusText,
            { color: data.accessLocked ? activeTheme.danger : activeTheme.success },
          ]}>
            {data.accessLocked ? 'غير مفعل' : 'مفعل'}
          </Text>
        </View>
      </View>

      <View style={styles.profileInfoCard}>
        <ProfileInfoRow
          icon="graduation-cap"
          label="مرحلة التسجيل"
          value={currentStudent?.year || currentStudent?.grade || '-'}
          colors={activeTheme}
          styles={styles}
        />
        <ProfileInfoRow
          icon="user"
          label="اسم المستخدم"
          value={currentStudent?.username || '-'}
          colors={activeTheme}
          styles={styles}
        />
        <ProfileInfoRow
          icon="phone"
          label="رقم الهاتف"
          value={currentStudent?.phone || '-'}
          colors={activeTheme}
          styles={styles}
        />
        <ProfileInfoRow
          icon="mobile-alt"
          label="الجهاز"
          value={currentStudent?.deviceInfo || currentStudent?.deviceId || 'غير مسجل'}
          colors={activeTheme}
          styles={styles}
        />
      </View>

      <View style={styles.profileInfoCard}>
        <Text style={styles.profileSectionTitle}>الفرق المفعلة</Text>
        {data.accessYears.length ? (
          <View style={styles.profileYearChips}>
            {data.accessYears.map((year) => (
              <View key={year} style={styles.profileYearChip}>
                <Text style={styles.profileYearChipText}>{year}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.profileEmptyText}>لا توجد فرق مفعلة حتى الآن.</Text>
        )}
      </View>

      <TouchableOpacity style={styles.profileSupportCard} onPress={() => setActiveTab('support')}>
        <FontAwesome5 name="shield-alt" size={20} color={activeTheme.accent} />
        <View style={styles.profileSupportContent}>
          <Text style={styles.profileSupportTitle}>الأمان والدعم</Text>
          <Text style={styles.profileSupportText}>طلبات الجهاز وكلمة المرور من خلال الدعم الفني فقط.</Text>
        </View>
        <FontAwesome5 name="chevron-left" size={12} color={activeTheme.subText} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.profileSupportCard} onPress={() => nav?.navigate?.('Legal', { type: 'DeleteAccount', user: currentStudent })}>
        <FontAwesome5 name="user-slash" size={20} color={activeTheme.danger} />
        <View style={styles.profileSupportContent}>
          <Text style={[styles.profileSupportTitle, { color: activeTheme.danger }]}>طلب حذف الحساب</Text>
          <Text style={styles.profileSupportText}>سيتم حذف الحساب والبيانات المرتبطة به نهائيًا خلال 7 إلى 30 يومًا بعد التحقق من الهوية.</Text>
        </View>
        <FontAwesome5 name="chevron-left" size={12} color={activeTheme.subText} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <FontAwesome5 name="power-off" size={14} color="#FFFFFF" />
        <Text style={styles.logoutButtonText}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </View>
  );

  const ProfileInfoRow = ({ icon, label, value, colors, styles: rowStyles }) => (
    <View style={rowStyles.profileInfoRow}>
      <View style={rowStyles.profileInfoIcon}>
        <FontAwesome5 name={icon} size={14} color={colors.accent} />
      </View>
      <View style={rowStyles.profileInfoContent}>
        <Text style={rowStyles.profileInfoLabel}>{label}</Text>
        <Text style={rowStyles.profileInfoValue}>{value}</Text>
      </View>
    </View>
  );

  const renderProfileClean = () => (
    <View>
      <View style={styles.profileHero}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {String(currentStudent?.name || currentStudent?.username || 'ط').trim().charAt(0)}
          </Text>
        </View>
        <Text style={styles.profileName}>{currentStudent?.name || 'طالب المنصة'}</Text>
        <Text style={styles.profileUsername}>@{currentStudent?.username || 'student'}</Text>
        <View style={[
          styles.profileStatusBadge,
          { backgroundColor: data.accessLocked ? `${activeTheme.danger}18` : `${activeTheme.success}18` },
        ]}>
          <FontAwesome5
            name={data.accessLocked ? 'lock' : 'check-circle'}
            size={12}
            color={data.accessLocked ? activeTheme.danger : activeTheme.success}
          />
          <Text style={[
            styles.profileStatusText,
            { color: data.accessLocked ? activeTheme.danger : activeTheme.success },
          ]}>
            {data.accessLocked ? 'غير مفعل' : 'مفعل'}
          </Text>
        </View>
      </View>

      <View style={styles.profileInfoCard}>
        <Text style={styles.profileSectionTitle}>بيانات الحساب</Text>
        <ProfileInfoRow icon="graduation-cap" label="مرحلة التسجيل" value={currentStudent?.year || currentStudent?.grade || '-'} colors={activeTheme} styles={styles} />
        <ProfileInfoRow icon="user" label="اسم المستخدم" value={currentStudent?.username || '-'} colors={activeTheme} styles={styles} />
        <ProfileInfoRow icon="phone" label="رقم الهاتف" value={currentStudent?.phone || '-'} colors={activeTheme} styles={styles} />
        <ProfileInfoRow icon="mobile-alt" label="الجهاز الحالي" value={currentStudent?.deviceInfo || currentStudent?.deviceId || 'غير مسجل'} colors={activeTheme} styles={styles} />
      </View>

      <View style={styles.profileInfoCard}>
        <Text style={styles.profileSectionTitle}>حالة التسجيل</Text>
        <View style={styles.profileStatsGrid}>
          <View style={styles.profileStatBox}>
            <Text style={styles.profileStatValue}>{data.accessYears.length}</Text>
            <Text style={styles.profileStatLabel}>كورس مرتبط</Text>
          </View>
          <View style={styles.profileStatBox}>
            <Text style={styles.profileStatValue}>{data.lessons.length}</Text>
            <Text style={styles.profileStatLabel}>محاضرة</Text>
          </View>
          {SHOW_MATERIALS_SECTION && (
            <View style={styles.profileStatBox}>
              <Text style={styles.profileStatValue}>{data.availableMaterials.length}</Text>
                  <Text style={styles.profileStatLabel}>محتوى</Text>
            </View>
          )}
        </View>
        {data.accessYears.length ? (
          <View style={styles.profileYearChips}>
            {data.accessYears.map((year) => (
              <View key={year} style={styles.profileYearChip}>
                <Text style={styles.profileYearChipText}>{year}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.profileEmptyText}>لا توجد فرق مفعلة حتى الآن.</Text>
        )}
      </View>

      <TouchableOpacity style={styles.profileSupportCard} onPress={() => setActiveTab('support')}>
        <FontAwesome5 name="shield-alt" size={20} color={activeTheme.accent} />
        <View style={styles.profileSupportContent}>
          <Text style={styles.profileSupportTitle}>الأمان والدعم</Text>
          <Text style={styles.profileSupportText}>طلبات الجهاز وكلمة المرور من خلال الدعم الفني فقط لحماية الحساب.</Text>
        </View>
        <FontAwesome5 name="chevron-left" size={12} color={activeTheme.subText} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.profileSupportCard} onPress={() => nav?.navigate?.('Legal', { type: 'DeleteAccount', user: currentStudent })}>
        <FontAwesome5 name="user-slash" size={20} color={activeTheme.danger} />
        <View style={styles.profileSupportContent}>
          <Text style={[styles.profileSupportTitle, { color: activeTheme.danger }]}>طلب حذف الحساب</Text>
          <Text style={styles.profileSupportText}>سيتم حذف الحساب والبيانات المرتبطة به نهائيًا خلال 7 إلى 30 يومًا بعد التحقق من الهوية.</Text>
        </View>
        <FontAwesome5 name="chevron-left" size={12} color={activeTheme.subText} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <FontAwesome5 name="power-off" size={14} color="#FFFFFF" />
        <Text style={styles.logoutButtonText}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSupportPanelProfessional = () => (
    <View>
      <Text style={styles.sectionTitle}>الدعم وحماية الجهاز</Text>

      <View style={styles.supportInfoCard}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusIconBox, { backgroundColor: `${activeTheme.accent}18` }]}>
            <FontAwesome5 name="shield-alt" size={18} color={activeTheme.accent} />
          </View>
          <View style={styles.rtlFlexContent}>
            <Text style={styles.supportTitle}>حسابك محمي بعدد أجهزة محدد</Text>
            <Text style={styles.supportText}>حسابك مرتبط بعدد أجهزة محدد من الإدارة لحماية المحاضرات من المشاركة.</Text>
          </View>
        </View>

          <TouchableOpacity style={styles.whatsAppSupportButton} onPress={openWhatsAppSupport} activeOpacity={0.86}>
            <FontAwesome5 name="whatsapp" size={17} color="#FFFFFF" />
            <Text style={styles.whatsAppSupportButtonText}>تواصل واتساب</Text>
          </TouchableOpacity>
        </View>

      <TouchableOpacity style={styles.profileSupportCard} onPress={() => nav?.navigate?.('Support', { user: currentStudent })}>
        <FontAwesome5 name="clipboard-list" size={20} color={activeTheme.accent} />
        <View style={styles.profileSupportContent}>
          <Text style={styles.profileSupportTitle}>فتح مركز الدعم الكامل</Text>
          <Text style={styles.profileSupportText}>اختار نوع المشكلة، اكتب التفاصيل، وتابع حالة طلباتك.</Text>
        </View>
        <FontAwesome5 name="chevron-left" size={12} color={activeTheme.subText} />
      </TouchableOpacity>
    </View>
  );

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <StudentSkeleton colors={activeTheme} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.topBar} pointerEvents="box-none">
        <ThemeToggleButton mode={activeThemeMode} onPress={() => setThemePickerVisible(true)} theme={activeTheme} />
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setActiveTab('support')} activeOpacity={0.82}>
            <FontAwesome5 name="headset" size={15} color={activeTheme.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={logout} activeOpacity={0.82}>
            <FontAwesome5 name="power-off" size={15} color={activeTheme.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={activeTheme.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inlineTopBarSpacer} />

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>تعذر تحميل بعض البيانات. اسحب للتحديث مرة أخرى.</Text>
          </View>
        )}

        {activeTab === 'home' && renderHome()}
        {activeTab === 'codes' && renderCodes()}
        {activeTab === 'support' && renderSupportPanelProfessional()}
        {activeTab === 'profile' && renderProfileClean()}
      </ScrollView>

      {activeTab !== 'home' && <CornerLogo />}

      <ThemePickerModal
        visible={themePickerVisible}
        theme={activeTheme}
        activeThemeMode={activeThemeMode}
        themeOptions={availableThemeOptions}
        onSelectTheme={chooseTheme}
        onClose={() => setThemePickerVisible(false)}
      />

      <Modal
        visible={showOnboarding}
        transparent
        animationType="fade"
        onRequestClose={closeOnboarding}
      >
        <View style={styles.onboardingBackdrop}>
          <View style={styles.onboardingCard}>
            <View style={styles.onboardingIcon}>
              <FontAwesome5 name="graduation-cap" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.onboardingTitle}>أهلًا بك في منصة الحديدي</Text>
            <Text style={styles.onboardingText}>ابدأ بسهولة واتبع الخطوات دي عشان توصل لمحتواك بسرعة.</Text>

            <View style={styles.onboardingSteps}>
              <OnboardingStep styles={styles} icon="qrcode" title="أكد التسجيل" text="استخدم رمز التسجيل لربط الكورس بحسابك." />
              <OnboardingStep styles={styles} icon="play-circle" title="شاهد المحاضرات" text="اختار الفرقة ثم المادة ثم الشابتر." />
              <OnboardingStep styles={styles} icon="history" title="كمل من حيث توقفت" text="أي فيديو تبدأه هتلاقيه في آخر ما شاهدته." />
              <OnboardingStep styles={styles} icon="headset" title="الدعم الفني" text="لو غيرت جهازك أو حصلت مشكلة، افتح الدعم." />
            </View>

            <TouchableOpacity style={styles.onboardingButton} onPress={closeOnboarding} activeOpacity={0.86}>
              <Text style={styles.onboardingButtonText}>ابدأ الآن</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.bottomBar}>
        {VISIBLE_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.bottomItem, active && styles.bottomItemActive]}
              onPress={() => {
                if (tab.id === 'videos' || tab.id === 'materials') {
                  openYearSelection(tab.id === 'materials' ? 'materials' : 'videos');
                  return;
                }
                setActiveTab(tab.id);
              }}
            >
              <FontAwesome5 name={tab.icon} size={15} color={active ? activeTheme.buttonText : activeTheme.subText} />
              <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function OnboardingStep({ styles, icon, title, text }) {
  return (
    <View style={styles.onboardingStep}>
      <View style={styles.onboardingStepIcon}>
        <FontAwesome5 name={icon} size={13} color="#7A4E2F" />
      </View>
      <View style={styles.onboardingStepText}>
        <Text style={styles.onboardingStepTitle}>{title}</Text>
        <Text style={styles.onboardingStepBody}>{text}</Text>
      </View>
    </View>
  );
}

function EmptyState({ text, colors }) {
  return (
    <View style={emptyStyles.wrap}>
      <FontAwesome5 name="folder-open" size={34} color={colors.subText} style={{ opacity: 0.35 }} />
      <Text style={[emptyStyles.text, { color: colors.subText }]}>{text}</Text>
    </View>
  );
}

function StudentSkeleton({ colors }) {
  return (
    <View>
      <View style={[skeletonStyles.hero, { backgroundColor: colors.card, borderColor: colors.border }]} />
      {[0, 1, 2, 3].map((item) => (
        <View key={item} style={[skeletonStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[skeletonStyles.circle, { backgroundColor: `${colors.accent}24` }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[skeletonStyles.lineLarge, { backgroundColor: colors.border }]} />
            <View style={[skeletonStyles.lineSmall, { backgroundColor: colors.border }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 46,
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

const skeletonStyles = StyleSheet.create({
  hero: {
    height: 170,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 20,
  },
  row: {
    minHeight: 82,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  circle: {
    width: 42,
    height: 42,
    borderRadius: 16,
  },
  lineLarge: {
    width: '72%',
    height: 13,
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
  lineSmall: {
    width: '45%',
    height: 10,
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
});

const createStyles = (theme, isCompact, safeTop = 24, safeBottom = 12) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    direction: 'rtl',
  },
  content: {
    paddingHorizontal: isCompact ? 14 : 18,
    paddingTop: 12,
    paddingBottom: 98 + safeBottom,
  },
  topBar: {
    position: 'absolute',
    top: safeTop + 10,
    left: 14,
    right: 14,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  inlineTopBarSpacer: {
    height: safeTop + 62,
    marginBottom: 12,
  },
  topActions: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 51,
    elevation: 6,
  },
  rtlFlexContent: {
    flex: 1,
    alignItems: 'flex-end',
  },
  hero: {
    borderRadius: 22,
    padding: 22,
    marginBottom: 22,
    alignItems: 'center',
  },
  logoBox: {
    width: 190,
    height: 190,
    borderRadius: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 184,
    height: 184,
    borderRadius: 0,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  quickGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 20,
  },
  quickCardShell: {
    width: '48%',
  },
  quickCard: {
    width: '100%',
    minHeight: 122,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 10,
  },
  quickCardText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  quickCardSub: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  supportStrip: {
    minHeight: 72,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginTop: -2,
    marginBottom: 20,
  },
  supportStripIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: `${theme.accent}16`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportStripText: {
    flex: 1,
    alignItems: 'center',
  },
  supportStripTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  supportStripSub: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 3,
  },
  yearSummaryCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  yearSummaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearSummaryTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  yearSummaryText: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notificationCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    marginTop: 8,
    marginBottom: 16,
  },
  notificationTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notificationText: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statusCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  statusCardActive: {
    borderColor: `${theme.success}55`,
    backgroundColor: `${theme.success}0F`,
  },
  statusCardLocked: {
    borderColor: `${theme.danger}55`,
    backgroundColor: `${theme.danger}0F`,
  },
  statusHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  statusIconBox: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusEyebrow: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statusTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statusText: {
    color: theme.subText,
    fontSize: 13,
    lineHeight: 21,
    marginTop: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statusChips: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statusChip: {
    borderRadius: 999,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: `${theme.accent}44`,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipText: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  statusAction: {
    alignSelf: 'flex-end',
    borderRadius: 14,
    backgroundColor: theme.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
  },
  statusActionText: {
    color: theme.buttonText,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  lockedCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  lockedTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  lockedText: {
    color: theme.subText,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 12,
  },
  primaryButtonText: {
    color: theme.buttonText,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pathHeader: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    marginBottom: 14,
    alignItems: 'flex-end',
  },
  pathLabel: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  pathTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
    writingDirection: 'rtl',
  },
  pathSub: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  backButton: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    borderRadius: 13,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  backButtonText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  helperText: {
    color: theme.subText,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 12,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  supportCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  supportInfoCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  deviceDetailsBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.cardAlt,
    padding: 12,
    marginTop: 14,
  },
  supportActionsRow: {
    gap: 10,
    marginTop: 2,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  whatsAppSupportButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row-reverse',
    gap: 8,
  },
  whatsAppSupportButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  supportTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  supportText: {
    color: theme.subText,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileCard: {
    flexDirection: 'row-reverse',
    gap: 14,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  profileHero: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 26,
    padding: 26,
    alignItems: 'center',
    marginBottom: 16,
  },
  profileAvatar: {
    width: 88,
    height: 88,
    borderRadius: 30,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  profileAvatarText: {
    color: theme.buttonText,
    fontSize: 36,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  profileName: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  profileUsername: {
    color: theme.subText,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
  profileStatusBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  profileStatusText: {
    fontSize: 12,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  profileMeta: {
    color: theme.subText,
    fontSize: 13,
    marginTop: 5,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileInfoCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    alignItems: 'stretch',
  },
  profileInfoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  profileInfoContent: {
    flex: 1,
    alignItems: 'flex-end',
  },
  profileInfoIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: `${theme.accent}16`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfoLabel: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileInfoValue: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileSectionTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 10,
  },
  profileStatsGrid: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 12,
  },
  profileStatBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.cardAlt,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  profileStatValue: {
    color: theme.accent,
    fontSize: 19,
    fontWeight: '900',
  },
  profileStatLabel: {
    color: theme.subText,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
    writingDirection: 'rtl',
  },
  profileYearChips: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  profileYearChip: {
    borderRadius: 999,
    backgroundColor: `${theme.accent}14`,
    borderWidth: 1,
    borderColor: `${theme.accent}44`,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  profileYearChipText: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  profileEmptyText: {
    color: theme.subText,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileSupportCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  profileSupportContent: {
    flex: 1,
    alignItems: 'flex-end',
  },
  profileSupportTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileSupportText: {
    color: theme.subText,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 3,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  logoutButton: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: theme.danger,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
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
  },
  errorText: {
    color: theme.danger,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  onboardingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  onboardingCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    alignItems: 'center',
  },
  onboardingIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  onboardingTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  onboardingText: {
    color: theme.subText,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 7,
  },
  onboardingSteps: {
    width: '100%',
    gap: 10,
    marginTop: 18,
  },
  onboardingStep: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: theme.cardAlt,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
  },
  onboardingStepIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingStepText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  onboardingStepTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  onboardingStepBody: {
    color: theme.subText,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  onboardingButton: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: theme.accent,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  onboardingButtonText: {
    color: theme.buttonText,
    fontSize: 15,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  bottomBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: safeBottom,
    borderRadius: 28,
    backgroundColor: theme.bottomBar,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row-reverse',
    padding: 8,
    gap: 4,
  },
  bottomItem: {
    flex: 1,
    minHeight: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bottomItemActive: {
    backgroundColor: theme.accent,
  },
  bottomLabel: {
    color: theme.subText,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  bottomLabelActive: {
    color: theme.buttonText,
  },
});
