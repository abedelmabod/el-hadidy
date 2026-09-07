import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function ChapterList({
  chapters = [],
  unassignedCount = 0,
  unassignedTitle = 'محتوى عام',
  emptyText = 'لا توجد شباتر حاليًا',
  colors,
  onSelectChapter,
  onSelectUnassigned,
}) {
  const chapterGradient = [
    colors.accent || '#7A4E2F',
    colors.accentAlt || colors.accentGreen || '#4F2F1D',
  ];
  const unassignedGradient = [
    colors.accentOrange || colors.accent || '#9C6208',
    colors.accent || '#4F2F1D',
  ];

  if (!chapters.length && !unassignedCount) {
    return (
      <View style={styles.empty}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <FontAwesome5 name="layer-group" size={24} color={colors.accent} />
        </View>
        <Text style={[styles.emptyText, { color: colors.text }]}>{emptyText}</Text>
        <Text style={[styles.emptyHint, { color: colors.subText }]}>سيظهر المحتوى هنا بمجرد إضافته.</Text>
      </View>
    );
  }

  return (
    <View>
      {chapters.map((chapter) => (
        <TouchableOpacity
          key={chapter.id}
          activeOpacity={0.84}
          style={styles.card}
          onPress={() => onSelectChapter?.(chapter)}
        >
          <LinearGradient colors={chapterGradient} style={StyleSheet.absoluteFillObject} />
          <View style={styles.readabilityOverlay} />

          <View style={styles.iconBubble}>
            <FontAwesome5 name="layer-group" size={18} color="#FFFFFF" />
          </View>

          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={2}>
              {chapter.name || chapter.title}
            </Text>
          </View>

          <FontAwesome5 name="chevron-left" size={12} color="#FFFFFF" style={styles.chevron} />
        </TouchableOpacity>
      ))}

      {!!unassignedCount && (
        <TouchableOpacity
          activeOpacity={0.84}
          style={styles.card}
          onPress={onSelectUnassigned}
        >
          <LinearGradient colors={unassignedGradient} style={StyleSheet.absoluteFillObject} />
          <View style={styles.readabilityOverlay} />

          <View style={styles.iconBubble}>
            <FontAwesome5 name="folder-open" size={18} color="#FFFFFF" />
          </View>

          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={2}>{unassignedTitle}</Text>
          </View>

          <FontAwesome5 name="chevron-left" size={12} color="#FFFFFF" style={styles.chevron} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 82,
    borderRadius: 18,
    marginBottom: 10,
    padding: 13,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  readabilityOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  chevron: {
    opacity: 0.72,
  },
  textWrap: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
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
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 34,
    paddingHorizontal: 18,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptyHint: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 6,
    opacity: 0.78,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
