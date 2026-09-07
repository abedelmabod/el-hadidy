import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function SubjectCard({
  title,
  icon = 'book',
  colors = ['#7A4E2F', '#4F2F1D'],
  disabled = false,
  onPress,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      disabled={disabled}
      onPress={onPress}
      style={[styles.card, disabled && styles.disabled]}
    >
      <LinearGradient colors={colors} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.readabilityOverlay, disabled && styles.disabledOverlay]} />

      <View style={styles.iconBubble}>
        <FontAwesome5 name={icon} size={18} color="#FFFFFF" />
      </View>

      <View style={styles.textWrap}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
        </View>
      </View>

      <FontAwesome5 name="chevron-left" size={12} color="#FFFFFF" style={styles.chevron} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 88,
    borderRadius: 18,
    marginBottom: 10,
    padding: 13,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  disabled: {
    opacity: 0.78,
  },
  readabilityOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  disabledOverlay: {
    backgroundColor: 'rgba(0,0,0,0.26)',
  },
  chevron: {
    opacity: 0.72,
  },
  textWrap: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
  },
  titleRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
    flexShrink: 1,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
