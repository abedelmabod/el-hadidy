import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

export default function ThemeToggleButton({ mode = 'light', onPress, theme }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.borderSoft || theme.border,
        backgroundColor: theme.cardAlt || theme.card,
        shadowColor: theme.shadow || theme.accent,
        shadowOpacity: mode === 'dark' ? 0.35 : 0.16,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 4,
      }}
    >
      <Text style={{ color: theme.accent, fontWeight: 'bold', fontSize: 12 }}>
        غير مودك
      </Text>
    </TouchableOpacity>
  );
}
