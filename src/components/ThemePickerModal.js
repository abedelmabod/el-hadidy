import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { THEME_CHOICES } from '../theme/theme-config';

export default function ThemePickerModal({
  visible,
  theme,
  activeThemeMode = 'light',
  themeOptions = THEME_CHOICES,
  onSelectTheme,
  onClose,
}) {
  const styles = createStyles(theme);
  const options = themeOptions?.length ? themeOptions : THEME_CHOICES;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          <View style={styles.header}>
            <Text style={styles.title}>اختار شكل التطبيق</Text>
          </View>

          <View style={styles.optionsGrid}>
            {options.map((option) => {
              const isSelected = option.key === activeThemeMode;
              const preview = option.preview || theme.gradient || [theme.card, theme.accent];

              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.option, isSelected && styles.optionActive]}
                  activeOpacity={0.85}
                  onPress={() => onSelectTheme?.(option.key)}
                >
                  <LinearGradient colors={preview} style={styles.optionPreview} />
                  <View style={styles.optionTextBox}>
                    <Text style={styles.optionTitle}>{option.label}</Text>
                  </View>
                  {isSelected && (
                    <View style={styles.selectedBadge}>
                      <FontAwesome5 name="check" size={10} color={theme.buttonText} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (theme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.overlay || 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 24,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
  },
  header: {
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  title: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  optionsGrid: {
    gap: 10,
  },
  option: {
    minHeight: 74,
    borderRadius: 18,
    backgroundColor: theme.cardAlt,
    borderWidth: 1,
    borderColor: theme.borderSoft || theme.border,
    padding: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  optionActive: {
    borderColor: theme.accent,
    backgroundColor: `${theme.accent}14`,
  },
  optionPreview: {
    width: 54,
    height: 54,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.borderSoft || theme.border,
    shadowColor: theme.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  optionTextBox: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  optionTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
