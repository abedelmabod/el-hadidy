import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, LogBox, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as ScreenCapture from 'expo-screen-capture';
import * as Notifications from 'expo-notifications';
import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { app, auth, db, storage } from './src/firebase';
import { registerStudentForPushNotificationsAsync } from './src/services/notification-service';
import { observeSharedAuthSession, signOutSharedSession } from './src/services/auth-service';
import { resolveBunnyPlaybackUrl } from './src/services/bunny-service';
import { resolveMobileTheme, THEME_CHOICES, THEME_STORAGE_KEY } from './src/theme/theme-config';
import { getClientDevice } from './src/utils/deviceIdentity';

import LoginScreen from './src/screens/LoginScreen';
import StudentPlatform from './src/screens/StudentPlatform';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

LogBox.ignoreLogs(['Setting a timer']);

const lazyScreen = (loadScreen) => {
  const DeferredScreen = (props) => {
    const ScreenComponent = loadScreen();
    return <ScreenComponent {...props} />;
  };

  return DeferredScreen;
};

const YearSelectionScreen = lazyScreen(() => require('./src/screens/YearSelectionScreen').default);
const SubjectsScreen = lazyScreen(() => require('./src/screens/SubjectsScreen').default);
const ChaptersScreen = lazyScreen(() => require('./src/screens/ChaptersScreen').default);
const LecturesScreen = lazyScreen(() => require('./src/screens/LecturesScreen').default);
const WatchHistoryScreen = lazyScreen(() => require('./src/screens/WatchHistoryScreen').default);
const ComputerLinkScreen = lazyScreen(() => require('./src/screens/ComputerLinkScreen').default);
const SupportAdmin = lazyScreen(() => require('./src/screens/SupportAdmin').default);
const ContactUs = lazyScreen(() => require('./src/screens/ContactUs').default);
const LegalScreen = lazyScreen(() => require('./src/screens/LegalScreen').default);
const VideoPlayerScreen = lazyScreen(() => require('./src/screens/VideoPlayerScreen').default);

const createNativeHeaderOptions = (theme) => ({
  headerShown: true,
  headerTitle: '',
  headerTintColor: theme.accent,
  headerTransparent: true,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  headerStyle: {
    backgroundColor: 'transparent',
  },
  headerTitleStyle: {
    color: theme.accent,
  },
});

const createDefaultStackScreenOptions = (theme) => ({
  ...createNativeHeaderOptions(theme),
  animation: 'slide_from_right',
  animationEnabled: true,
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  fullScreenGestureEnabled: true,
  customAnimationOnGesture: true,
  gestureResponseDistance: { horizontal: 50 },
});

const createGestureEnabledOptions = (theme) => ({
  ...createNativeHeaderOptions(theme),
  animation: 'slide_from_right',
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  fullScreenGestureEnabled: true,
  gestureResponseDistance: { horizontal: 50 },
});

const VIDEO_PLAYER_OPTIONS = {
  headerShown: false,
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
};

const CACHED_SESSION_USER_KEY = 'elhadidy_cached_session_user_v1';

export default function App() {
  const [user, setUser] = useState(null);
  const [themeMode, setThemeMode] = useState('light');
  const [loading, setLoading] = useState(true);
  const [navigationReady, setNavigationReady] = useState(false);
  const adminNoticeShownRef = useRef(false);
  const pendingNotificationDataRef = useRef(null);
  const handledNotificationIdsRef = useRef(new Set());
  const notificationRegistrationKeyRef = useRef(null);

  const theme = useMemo(() => resolveMobileTheme(themeMode), [themeMode]);

  const updateUserState = useCallback((nextUserOrUpdater) => {
    setUser((currentUser) => {
      const nextUser = typeof nextUserOrUpdater === 'function'
        ? nextUserOrUpdater(currentUser)
        : nextUserOrUpdater;

      if (nextUser) {
        AsyncStorage.setItem(CACHED_SESSION_USER_KEY, JSON.stringify(nextUser)).catch(() => null);
      } else {
        AsyncStorage.removeItem(CACHED_SESSION_USER_KEY).catch(() => null);
      }

      return nextUser;
    });
  }, []);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        const isKnownTheme = THEME_CHOICES.some((choice) => choice.key === storedTheme);
        if (storedTheme && isKnownTheme) {
          setThemeMode(storedTheme);
        } else if (storedTheme) {
          setThemeMode('light');
          AsyncStorage.setItem(THEME_STORAGE_KEY, 'light').catch(() => null);
        }
      } catch (error) {
        console.error('Failed to load theme', error);
      }
    };

    loadTheme();
  }, []);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(CACHED_SESSION_USER_KEY)
      .then((cachedUser) => {
        if (!mounted || !cachedUser) return;
        const parsedUser = JSON.parse(cachedUser);
        if (parsedUser?.role) {
          setUser(parsedUser);
        }
      })
      .catch(() => null)
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const toggleTheme = () => {
    const themeKeys = THEME_CHOICES.map((choice) => choice.key);
    const currentIndex = Math.max(themeKeys.indexOf(themeMode), 0);
    const nextMode = themeKeys[(currentIndex + 1) % themeKeys.length] || 'light';
    setThemeMode(nextMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch(() => null);
  };

  const selectThemeMode = (nextMode) => {
    if (!THEME_CHOICES.some((choice) => choice.key === nextMode)) return;
    setThemeMode(nextMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch(() => null);
  };

  const readLessonFromNotification = useCallback(async (data = {}) => {
    const lessonId = String(data.lessonId || data.lectureId || '').trim();
    if (!lessonId) return null;

    const preferredCollection = ['lessons', 'lectures'].includes(data.sourceCollection)
      ? data.sourceCollection
      : 'lessons';
    const fallbackCollection = preferredCollection === 'lessons' ? 'lectures' : 'lessons';

    const preferredSnapshot = await getDoc(doc(db, preferredCollection, lessonId));
    if (preferredSnapshot.exists()) {
      return { id: preferredSnapshot.id, sourceCollection: preferredCollection, ...preferredSnapshot.data() };
    }

    const fallbackSnapshot = await getDoc(doc(db, fallbackCollection, lessonId));
    if (fallbackSnapshot.exists()) {
      return { id: fallbackSnapshot.id, sourceCollection: fallbackCollection, ...fallbackSnapshot.data() };
    }

    return null;
  }, []);

  const navigateFromNotificationData = useCallback(async (data = {}) => {
    if (!data || data.type !== 'new_lesson') return;

    if (!navigationRef.isReady() || !navigationReady || !user?.role) {
      pendingNotificationDataRef.current = data;
      return;
    }

    if (user.role !== 'student') return;

    try {
      const lesson = await readLessonFromNotification(data);
      const mergedLesson = {
        ...(lesson || {}),
        id: lesson?.id || data.lessonId || data.lectureId || '',
        title: lesson?.title || data.lessonTitle || '',
        subjectId: lesson?.subjectId || data.subjectId || '',
        subject: lesson?.subject || lesson?.subjectName || data.subjectName || '',
        chapterId: lesson?.chapterId || data.chapterId || '',
        chapterName: lesson?.chapterName || data.chapterName || '',
        year: lesson?.year || data.year || data.accessYear || '',
        url: lesson?.url || data.videoUrl || '',
        pdfUrl: lesson?.pdfUrl || data.pdfUrl || '',
      };

      if (mergedLesson.url) {
        const originalVideoUrl = String(mergedLesson.url || '').trim();
        const videoUrl = await resolveBunnyPlaybackUrl(originalVideoUrl);
        if (videoUrl) {
          navigationRef.navigate('VideoPlayer', {
            videoUrl,
            originalVideoUrl,
            lectureId: mergedLesson.id,
            subjectName: mergedLesson.subject,
            chapterName: mergedLesson.chapterName,
            accessYear: mergedLesson.year,
            user,
            videoTitle: mergedLesson.title || 'فيديو',
            videoSubtitle: [mergedLesson.subject, mergedLesson.chapterName, mergedLesson.year].filter(Boolean).join(' / '),
          });
          return;
        }
      }

      navigationRef.navigate('Lectures', {
        user,
        contentKind: mergedLesson.pdfUrl && !mergedLesson.url ? 'materials' : 'videos',
        accessYear: mergedLesson.year,
        yearKey: mergedLesson.year,
        subjectId: mergedLesson.subjectId,
        subjectName: mergedLesson.subject,
        chapterId: mergedLesson.chapterId || 'no-chapter',
        chapterName: mergedLesson.chapterName || 'محاضرات عامة',
      });
    } catch (error) {
      console.warn('Notification navigation failed:', error);
      navigationRef.navigate('StudentHome');
    }
  }, [navigationReady, readLessonFromNotification, user]);

  useEffect(() => {
    const handleNotificationResponse = (response) => {
      const request = response?.notification?.request;
      const responseId = request?.identifier || JSON.stringify(request?.content?.data || {});
      if (handledNotificationIdsRef.current.has(responseId)) return;
      handledNotificationIdsRef.current.add(responseId);

      const data = request?.content?.data || {};
      navigateFromNotificationData(data);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleNotificationResponse(response);
      })
      .catch(() => null);

    return () => {
      responseSubscription.remove();
    };
  }, [navigateFromNotificationData]);

  useEffect(() => {
    if (!navigationReady || !user?.role || !pendingNotificationDataRef.current) return;

    const pendingData = pendingNotificationDataRef.current;
    pendingNotificationDataRef.current = null;
    navigateFromNotificationData(pendingData);
  }, [navigationReady, navigateFromNotificationData, user?.role]);

  useEffect(() => {
    const unsubscribe = observeSharedAuthSession(
      { app, auth, db, storage, getDevice: getClientDevice },
      (nextUser, sessionError) => {
        if (sessionError?.code === 'DEVICE_MISMATCH') {
          Alert.alert('تنبيه الأمان', 'هذا الحساب مسجل على جهاز آخر. لا يمكن فتح نفس حساب الطالب من أكثر من جهاز.');
        }

        if (nextUser?.role === 'admin') {
          if (!adminNoticeShownRef.current) {
            adminNoticeShownRef.current = true;
            Alert.alert('Notice', 'The Admin Dashboard is now exclusively available via the Web platform.');
          }

          updateUserState(null);
          setLoading(false);
          signOutSharedSession({ auth }).catch((error) => {
            console.error('Failed to sign out mobile admin session', error);
          });
          return;
        }

        if (!nextUser) {
          adminNoticeShownRef.current = false;
        }

        updateUserState(nextUser);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [updateUserState]);

  useEffect(() => {
    if (user?.role !== 'student' || !user?.id) {
      notificationRegistrationKeyRef.current = null;
      return undefined;
    }

    const registrationKey = `${user.id}:installed-app-v2`;
    if (notificationRegistrationKeyRef.current === registrationKey) {
      return undefined;
    }

    let cancelled = false;
    notificationRegistrationKeyRef.current = registrationKey;

    const registrationTimer = setTimeout(() => {
      registerStudentForPushNotificationsAsync({ db, user })
        .then((result) => {
          if (!cancelled && result?.ok === false) {
            console.log('Student push token sync skipped:', result.reason);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            console.warn('Student push token sync failed:', error);
          }
        });
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(registrationTimer);
    };
  }, [updateUserState, user?.role, user?.id]);

  useEffect(() => {
    let screenshotSubscription;
    const isStudent = user?.role === 'student';
    const screenshotsAllowed =
      user?.allowScreenshots === true ||
      user?.screenshotAllowed === true ||
      user?.canTakeScreenshots === true;

    if (!isStudent || screenshotsAllowed) {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      return undefined;
    }

    ScreenCapture.preventScreenCaptureAsync().catch(() => {});

    if (Platform.OS !== 'web' && typeof ScreenCapture.addScreenshotListener === 'function') {
      screenshotSubscription = ScreenCapture.addScreenshotListener(() => {
        addDoc(collection(db, 'security_logs'), {
          studentId: user.id || user.uid || null,
          studentName: user.name || '',
          username: user.username || '',
          deviceId: user.deviceId || null,
          action: 'محاولة تصوير شاشة داخل تطبيق الطالب',
          alertType: 'screenshot_attempt',
          platform: Platform.OS,
          time: serverTimestamp(),
        }).catch(() => null);

        Alert.alert('تنبيه أمان', 'تصوير الشاشة غير مسموح داخل التطبيق وتم تسجيل المحاولة.');
      });
    }

    return () => {
      screenshotSubscription?.remove?.();
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, [
    user?.role,
    user?.id,
    user?.uid,
    user?.name,
    user?.username,
    user?.deviceId,
    user?.allowScreenshots,
    user?.screenshotAllowed,
    user?.canTakeScreenshots,
  ]);

  useEffect(() => {
    if (user?.role !== 'student' || !user?.id) {
      return undefined;
    }

    const unsubscribe = onSnapshot(doc(db, 'students', user.id), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() || {};
      const screenshotPatch = {
        allowScreenshots: data.allowScreenshots === true,
        screenshotAllowed: data.screenshotAllowed === true,
        canTakeScreenshots: data.canTakeScreenshots === true,
      };

      updateUserState((currentUser) => {
        if (!currentUser || currentUser.id !== user.id) return currentUser;
        if (
          currentUser.allowScreenshots === screenshotPatch.allowScreenshots &&
          currentUser.screenshotAllowed === screenshotPatch.screenshotAllowed &&
          currentUser.canTakeScreenshots === screenshotPatch.canTakeScreenshots
        ) {
          return currentUser;
        }
        return { ...currentUser, ...screenshotPatch };
      });
    }, () => {});

    return unsubscribe;
  }, [user?.role, user?.id]);

  const commonProps = {
    user,
    setUser: updateUserState,
    theme,
    themeMode,
    themeOptions: THEME_CHOICES,
    toggleTheme,
    selectThemeMode,
  };

  if (loading) {
    return (
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef} onReady={() => setNavigationReady(true)}>
          <Stack.Navigator
            screenOptions={{
              ...createDefaultStackScreenOptions(theme),
              contentStyle: { backgroundColor: theme.bg },
            }}
          >
            {!user ? (
              <Stack.Group>
                <Stack.Screen name="Login" options={{ headerShown: false }}>
                  {(props) => <LoginScreen {...props} {...commonProps} />}
                </Stack.Screen>
              </Stack.Group>
            ) : (
              <Stack.Group>
                {user.role === 'student' && (
                  <Stack.Screen name="StudentHome" options={{ headerShown: false }}>
                    {(props) => <StudentPlatform {...props} {...commonProps} />}
                  </Stack.Screen>
                )}

                {user.role === 'student' && (
                  <Stack.Screen name="YearSelection" options={createGestureEnabledOptions(theme)}>
                    {(props) => <YearSelectionScreen {...props} {...commonProps} />}
                  </Stack.Screen>
                )}

                {user.role === 'student' && (
                  <Stack.Screen name="Subjects" options={createGestureEnabledOptions(theme)}>
                    {(props) => <SubjectsScreen {...props} {...commonProps} />}
                  </Stack.Screen>
                )}

                {user.role === 'student' && (
                  <Stack.Screen name="Chapters" options={createGestureEnabledOptions(theme)}>
                    {(props) => <ChaptersScreen {...props} {...commonProps} />}
                  </Stack.Screen>
                )}

                {user.role === 'student' && (
                  <Stack.Screen name="Lectures" options={createGestureEnabledOptions(theme)}>
                    {(props) => <LecturesScreen {...props} {...commonProps} />}
                  </Stack.Screen>
                )}

                {user.role === 'student' && (
                  <Stack.Screen name="WatchHistory" options={createGestureEnabledOptions(theme)}>
                    {(props) => <WatchHistoryScreen {...props} {...commonProps} />}
                  </Stack.Screen>
                )}

                {user.role === 'student' && (
                  <Stack.Screen name="ComputerLink" options={createGestureEnabledOptions(theme)}>
                    {(props) => <ComputerLinkScreen {...props} {...commonProps} />}
                  </Stack.Screen>
                )}

                {user.role === 'support' && (
                  <Stack.Screen name="SupportAdmin" options={createGestureEnabledOptions(theme)}>
                    {(props) => <SupportAdmin {...props} {...commonProps} />}
                  </Stack.Screen>
                )}
              </Stack.Group>
            )}

            <Stack.Screen name="Support" options={createGestureEnabledOptions(theme)}>
              {(props) => <ContactUs {...props} {...commonProps} />}
            </Stack.Screen>

            <Stack.Screen name="Legal" options={createGestureEnabledOptions(theme)}>
              {(props) => <LegalScreen {...props} {...commonProps} />}
            </Stack.Screen>

            <Stack.Screen name="VideoPlayer" options={VIDEO_PLAYER_OPTIONS}>
              {(props) => <VideoPlayerScreen {...props} {...commonProps} />}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
