import React, { useState, useEffect, useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet, LogBox } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// استيراد الخدمات والإعدادات
import { app, auth, db, storage } from './src/firebase';
import { observeSharedAuthSession } from './src/services/auth-service';
import { resolveMobileTheme, THEME_STORAGE_KEY } from './src/theme/theme-config';

// استيراد الشاشات
import LoginScreen from './src/screens/LoginScreen';
import StudentPlatform from './src/screens/StudentPlatform';
import SupportAdmin from './src/screens/SupportAdmin';
import ContactUs from './src/screens/ContactUs'; // تأكد من اسم الاستيراد هنا
import AdminDashboard from './src/screens/AdminDashboard';
import LegalScreen from './src/screens/LegalScreen';

const Stack = createNativeStackNavigator();

LogBox.ignoreLogs(['Setting a timer']);

export default function App() {
  const [user, setUser] = useState(null);
  const [themeMode, setThemeMode] = useState('light');
  const [loading, setLoading] = useState(true);

  const theme = useMemo(() => resolveMobileTheme(themeMode), [themeMode]);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (storedTheme) setThemeMode(storedTheme);
      } catch (e) {
        console.error("Failed to load theme", e);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = () => {
    const nextMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode);
  };

  useEffect(() => {
    const unsubscribe = observeSharedAuthSession(
      { app, auth, db, storage },
      (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const commonProps = {
    user,
    setUser,
    theme,
    themeMode,
    toggleTheme
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          
          {!user ? (
            /* شاشة الدخول فقط للزوار */
            <Stack.Group>
              <Stack.Screen name="Login">
                {(props) => <LoginScreen {...props} {...commonProps} />}
              </Stack.Screen>
            </Stack.Group>
          ) : (
            /* شاشات المستخدمين المسجلين */
            <Stack.Group>
              {user.role === 'student' && (
                <Stack.Screen name="StudentHome">
                  {(props) => <StudentPlatform {...props} {...commonProps} />}
                </Stack.Screen>
              )}

              {user.role === 'support' && (
                <Stack.Screen name="SupportAdmin">
                  {(props) => <SupportAdmin {...props} {...commonProps} />}
                </Stack.Screen>
              )}

              {user.role === 'admin' && (
                <Stack.Screen name="AdminDashboard">
                  {(props) => <AdminDashboard {...props} {...commonProps} />}
                </Stack.Screen>
              )}
            </Stack.Group>
          )}

          {/* الحل النهائي: شاشة الدعم موحدة للجميع وموجودة خارج الشروط */}
          <Stack.Screen name="Support">
            {(props) => <ContactUs {...props} {...commonProps} />}
          </Stack.Screen>
          <Stack.Screen name="Legal">
            {(props) => <LegalScreen {...props} {...commonProps} />}
          </Stack.Screen>

        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
