import React from 'react';
import { I18nManager, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CornerLogo({ size = 58, top = 10, right = 18, left, side = 'right' }) {
  const insets = useSafeAreaInsets();
  const horizontalOffset = left !== undefined ? left : right;
  const physicalRight = side === 'right';
  const horizontalPosition = I18nManager.isRTL
    ? (physicalRight ? { left: horizontalOffset } : { right: horizontalOffset })
    : (physicalRight ? { right: horizontalOffset } : { left: horizontalOffset });

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          top: insets.top + top,
          ...horizontalPosition,
        },
      ]}
    >
      <Image
        source={require('../../../assets/logo-main-transparent.png')}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});
