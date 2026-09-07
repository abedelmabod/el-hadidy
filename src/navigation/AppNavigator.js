import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import StudentPlatform from '../screens/StudentPlatform';
import YearSelectionScreen from '../screens/YearSelectionScreen';
import SubjectsScreen from '../screens/SubjectsScreen';
import ChaptersScreen from '../screens/ChaptersScreen';
import LecturesScreen from '../screens/LecturesScreen';
import WatchHistoryScreen from '../screens/WatchHistoryScreen';
import ComputerLinkScreen from '../screens/ComputerLinkScreen';
import SupportAdmin from '../screens/SupportAdmin';
import SupportScreen from '../screens/ContactUs';
import LegalScreen from '../screens/LegalScreen';
import VideoPlayerScreen from '../screens/VideoPlayerScreen';

const Stack = createNativeStackNavigator();

const DEFAULT_STACK_SCREEN_OPTIONS = {
  headerShown: true,
  headerTitle: '',
  headerTintColor: '#7A4E2F',
  headerTransparent: true,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  headerStyle: {
    backgroundColor: 'transparent',
  },
  animation: 'slide_from_right',
  animationEnabled: true,
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  fullScreenGestureEnabled: true,
  customAnimationOnGesture: true,
  gestureResponseDistance: { horizontal: 50 },
};

const GESTURE_ENABLED_OPTIONS = {
  headerShown: true,
  headerTitle: '',
  headerTintColor: '#7A4E2F',
  headerTransparent: true,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  headerStyle: {
    backgroundColor: 'transparent',
  },
  animation: 'slide_from_right',
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  fullScreenGestureEnabled: true,
  gestureResponseDistance: { horizontal: 50 },
};

const VIDEO_PLAYER_OPTIONS = {
  headerShown: false,
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
};

export default function AppNavigator({ user, setUser }) {
  return (
    <Stack.Navigator screenOptions={DEFAULT_STACK_SCREEN_OPTIONS}>
      {user === null ? (
        <Stack.Group>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
            initialParams={{ user, setUser }}
          />
        </Stack.Group>
      ) : (
        <Stack.Group>
          {user.role === 'support' ? (
            <Stack.Screen
              name="SupportAdmin"
              component={SupportAdmin}
              options={GESTURE_ENABLED_OPTIONS}
              initialParams={{ user, setUser }}
            />
          ) : user.role === 'student' ? (
            <>
              <Stack.Screen
                name="StudentHome"
                component={StudentPlatform}
                options={{ headerShown: false }}
                initialParams={{ user, setUser }}
              />
              <Stack.Screen
                name="YearSelection"
                component={YearSelectionScreen}
                options={GESTURE_ENABLED_OPTIONS}
                initialParams={{ user, setUser }}
              />
              <Stack.Screen
                name="Subjects"
                component={SubjectsScreen}
                options={GESTURE_ENABLED_OPTIONS}
                initialParams={{ user, setUser }}
              />
              <Stack.Screen
                name="Chapters"
                component={ChaptersScreen}
                options={GESTURE_ENABLED_OPTIONS}
                initialParams={{ user, setUser }}
              />
              <Stack.Screen
                name="Lectures"
                component={LecturesScreen}
                options={GESTURE_ENABLED_OPTIONS}
                initialParams={{ user, setUser }}
              />
              <Stack.Screen
                name="WatchHistory"
                component={WatchHistoryScreen}
                options={GESTURE_ENABLED_OPTIONS}
                initialParams={{ user, setUser }}
              />
              <Stack.Screen
                name="ComputerLink"
                component={ComputerLinkScreen}
                options={GESTURE_ENABLED_OPTIONS}
                initialParams={{ user, setUser }}
              />
            </>
          ) : null}
        </Stack.Group>
      )}

      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={GESTURE_ENABLED_OPTIONS}
        initialParams={{ user, setUser }}
      />
      <Stack.Screen name="Legal" component={LegalScreen} options={GESTURE_ENABLED_OPTIONS} />
      <Stack.Screen name="VideoPlayer" component={VideoPlayerScreen} options={VIDEO_PLAYER_OPTIONS} />
    </Stack.Navigator>
  );
}
