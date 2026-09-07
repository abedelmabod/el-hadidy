import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { resolveMobileTheme } from '../theme/theme-config';

const AppButton = ({ title, onPress, style, textStyle, theme }) => {
  const activeTheme = theme || resolveMobileTheme('light');

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: activeTheme.accent },
        style,
      ]}
      activeOpacity={0.8}
    >
      <Text style={[
        styles.text,
        { color: activeTheme.buttonText },
        textStyle,
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 14,
    borderRadius: 12,
    marginVertical: 6,
    alignItems: 'center',
  },

  text: {
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default AppButton;
