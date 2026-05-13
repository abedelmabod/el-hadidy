import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen'; 
import AdminDashboard from '../screens/AdminDashboard';
import StudentDashboard from '../screens/StudentPlatform'; 
import SupportScreen from '../screens/ContactUs'; 
import LegalScreen from '../screens/LegalScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator({ user, setUser }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* 1. مجموعة الشاشات الشرطية (تتغير حسب تسجيل الدخول) */}
      {user === null ? (
        <Stack.Group>
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} setUser={setUser} user={user} />}
          </Stack.Screen>
        </Stack.Group>
      ) : (
        <Stack.Group>
          {user.role === 'admin' ? (
            <Stack.Screen name="AdminDashboard">
              {(props) => <AdminDashboard {...props} setUser={setUser} user={user} />}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="StudentDashboard">
              {(props) => <StudentDashboard {...props} setUser={setUser} user={user} />}
            </Stack.Screen>
          )}
        </Stack.Group>
      )}

      {/* 2. الشاشات العامة (متاحة دائماً وبدون تكرار) */}
      {/* وضعها هنا خارج الـ curly braces يضمن أن الـ Navigator يراها دائماً بنفس الاسم */}
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="Legal">
        {(props) => <LegalScreen {...props} />}
      </Stack.Screen>
      
    </Stack.Navigator>
  );
}
