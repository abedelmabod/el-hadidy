import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

export default function ThemeToggleButton({ mode = 'dark', onPress, theme }) {
  const isDark = mode === 'dark';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.borderSoft || theme.border,
        backgroundColor: "#ffffffdd",
        shadowColor: theme.accent,  // يتغير مع الثيم
        shadowOpacity: 0.3,         // أوضح شوية
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 4,
      }}
    >
      <Text style={{ color: theme.accent, fontWeight: 'bold', fontSize: 12 }}>
        {isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
      </Text>
    </TouchableOpacity>
  );
}
