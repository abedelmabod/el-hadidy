import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 } from '@expo/vector-icons';

export default function LectureRow({
  lecture,
  type = 'video',
  colors,
  onPress,
}) {
  const isPdf = type === 'pdf';
  const title = lecture?.title || lecture?.name || 'محاضرة بدون عنوان';
  const gradientColors = isPdf
    ? [
      colors.accentOrange || colors.accent || '#9C6208',
      colors.accent || '#4F2F1D',
    ]
    : [
      colors.accent || '#7A4E2F',
      colors.accentAlt || colors.accentBlue || '#4F2F1D',
    ];

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.card}
      onPress={() => onPress?.(lecture)}
    >
      <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFillObject} />
      <View style={styles.readabilityOverlay} />

      <View style={styles.textWrap}>
        <View style={styles.titleRow}>
          <View style={styles.videoIcon}>
            <FontAwesome5 name="video" size={13} color="#FFFFFF" />
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 66,
    borderRadius: 18,
    marginBottom: 10,
    padding: 13,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  readabilityOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  textWrap: {
    alignItems: 'flex-end',
    minWidth: 0,
    width: '100%',
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    width: '100%',
  },
  videoIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
