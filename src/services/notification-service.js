import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const getExpoProjectId = () => (
  Constants?.expoConfig?.extra?.eas?.projectId
  || Constants?.easConfig?.projectId
  || Constants?.manifest2?.extra?.expoClient?.extra?.eas?.projectId
  || null
);

const getNotificationClientType = () => {
  const ownership = Constants?.appOwnership;
  const executionEnvironment = Constants?.executionEnvironment;

  if (
    ownership === 'expo'
    || executionEnvironment === 'storeClient'
  ) {
    return 'expo-go';
  }

  return 'standalone';
};

const requestPermissionWithContext = async () => new Promise((resolve) => {
  Alert.alert(
    'تنبيهات المحتوى الجديد',
  'يمكنك تفعيل الإشعارات ليصلك تنبيه عند إضافة محاضرات أو محتوى تعليمي جديد. يمكنك إيقافها من إعدادات الجهاز في أي وقت.',
    [
      { text: 'ليس الآن', style: 'cancel', onPress: () => resolve(false) },
      { text: 'تفعيل الإشعارات', onPress: () => resolve(true) },
    ]
  );
});

export async function registerStudentForPushNotificationsAsync({ db, user }) {
  if (!db || !user?.id || user.role !== 'student') {
    return { ok: false, reason: 'invalid-student' };
  }

  const studentRef = doc(db, 'students', user.id);
  const writeNotificationState = async (patch) => setDoc(
    studentRef,
    {
      ...patch,
      notificationUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (!Device.isDevice) {
    await writeNotificationState({
      notificationPermissionStatus: 'physical-device-required',
      notificationRegistrationReason: 'physical-device-required',
    }).catch(() => null);
    return { ok: false, reason: 'physical-device-required' };
  }

  const notificationClientType = getNotificationClientType();
  if (notificationClientType === 'expo-go') {
    await writeNotificationState({
      notificationPermissionStatus: 'expo-go-token-skipped',
      notificationClientType,
      notificationAppOwnership: Constants?.appOwnership || '',
      notificationRegistrationReason: 'expo-go-token-skipped',
    }).catch(() => null);
    return { ok: false, reason: 'expo-go-token-skipped' };
  }

  try {
    await writeNotificationState({
      notificationPermissionStatus: 'sync-started',
      notificationClientType,
      notificationRegistrationReason: 'sync-started',
      notificationAppOwnership: Constants?.appOwnership || 'standalone',
      notificationExecutionEnvironment: Constants?.executionEnvironment || '',
      notificationError: '',
    });

    const currentPermissions = await Notifications.getPermissionsAsync();
    let finalStatus = currentPermissions.status;

    if (finalStatus !== 'granted') {
      const canAskAgain = currentPermissions.canAskAgain !== false;
      if (!canAskAgain) {
        await writeNotificationState({
          notificationPermissionStatus: finalStatus || 'denied',
          notificationRegistrationReason: 'permission-denied-no-retry',
        });
        return { ok: false, reason: 'permission-denied' };
      }

      const shouldAsk = await requestPermissionWithContext();
      if (!shouldAsk) {
        await writeNotificationState({
          notificationPermissionStatus: 'skipped',
          notificationRegistrationReason: 'permission-skipped',
        });
        return { ok: false, reason: 'permission-skipped' };
      }

      const requestedPermissions = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = requestedPermissions.status;
    }

    if (finalStatus !== 'granted') {
      await writeNotificationState({
        notificationPermissionStatus: finalStatus || 'denied',
        notificationRegistrationReason: 'permission-denied',
      });
      return { ok: false, reason: 'permission-denied' };
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'تنبيهات المحتوى',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EFBF04',
      });
    }

    const projectId = getExpoProjectId();
    if (!projectId) {
      await writeNotificationState({
        notificationPermissionStatus: 'project-id-missing',
        notificationClientType,
        notificationRegistrationReason: 'project-id-missing',
      });
      return { ok: false, reason: 'project-id-missing' };
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse?.data;

    if (!expoPushToken) {
      await writeNotificationState({
        notificationPermissionStatus: 'token-empty',
        notificationClientType,
        notificationTokenSource: '',
        notificationRegistrationReason: 'token-empty',
        notificationProjectId: projectId || '',
      });
      return { ok: false, reason: 'token-empty' };
    }

    await writeNotificationState({
      expoPushToken,
      expoPushTokens: [expoPushToken],
      notificationPermissionStatus: 'granted',
      notificationPlatform: Platform.OS,
      notificationClientType,
      notificationAppOwnership: Constants?.appOwnership || 'standalone',
      notificationTokenSource: 'installed-app-v2',
      notificationAppId: Constants?.expoConfig?.android?.package || Constants?.expoConfig?.ios?.bundleIdentifier || '',
      notificationAppName: Constants?.expoConfig?.name || 'el-hadidy',
      notificationProjectId: projectId || '',
      notificationRegistrationReason: 'registered',
      notificationError: '',
    });

    return { ok: true, token: expoPushToken };
  } catch (error) {
    console.warn('Push notification registration failed:', error);
    try {
      await writeNotificationState({
        notificationPermissionStatus: 'error',
        notificationError: String(error?.message || error),
        notificationRegistrationReason: 'registration-failed',
      });
    } catch {
      // Firestore errors should not block the student from using the app.
    }
    return { ok: false, reason: 'registration-failed', error };
  }
}
