import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

const TABS = [
  { id: 'home', label: 'الرئيسية', icon: 'home' },
  { id: 'videos', label: 'الفيديوهات', icon: 'play-circle' },
  { id: 'codes', label: 'التسجيل', icon: 'qrcode' },
  { id: 'profile', label: 'حسابي', icon: 'user' },
];

export default function StudentBottomBar({ navigation, user, colors, activeTab = 'home' }) {
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom || 0, Platform.OS === 'ios' ? 22 : 12);

  const goToTab = (tabId) => {
    if (tabId === 'videos') {
      navigation.navigate('YearSelection', { user, contentKind: 'videos' });
      return;
    }

    navigation.navigate('StudentHome', { initialTab: tabId });
  };

  return (
    <View style={[styles.bottomBar, { bottom: bottomOffset }]}>
      {TABS.map((tab) => {
        const active = activeTab === tab.id;

        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.bottomItem, active && styles.bottomItemActive]}
            activeOpacity={0.86}
            onPress={() => goToTab(tab.id)}
          >
            <FontAwesome5 name={tab.icon} size={15} color={active ? colors.buttonText : colors.subText} />
            <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 28,
    backgroundColor: colors.bottomBar,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.accent,
  },
  bottomLabel: {
    color: colors.subText,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  bottomLabelActive: {
    color: colors.buttonText,
  },
});
