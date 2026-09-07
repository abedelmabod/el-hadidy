import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';

const formatTime = (seconds = 0) => {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const enablePitchCorrection = (player) => {
  try {
    if (player && 'preservesPitch' in player) {
      player.preservesPitch = true;
    }
  } catch {}
};

export default function VideoPlayer({
  source,
  uri,
  title = 'PUBG Gameplay #01',
  subtitle = 'Username',
  autoPlay = false,
  loop = false,
  style,
  contentFit = 'cover',
}) {
  const videoViewRef = useRef(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(Boolean(autoPlay));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [brightness, setBrightness] = useState(0.72);
  const [volume, setVolume] = useState(0.8);
  const [gestureHint, setGestureHint] = useState(null);
  const hideTimerRef = useRef(null);
  const gestureStartRef = useRef({ brightness, volume });

  const videoSource = useMemo(() => {
    if (source) return source;
    if (uri) return { uri };
    return null;
  }, [source, uri]);

  const player = useVideoPlayer(videoSource, (instance) => {
    instance.loop = loop;
    instance.volume = volume;
    enablePitchCorrection(instance);
    instance.timeUpdateEventInterval = 0.25;
    if (autoPlay) instance.play();
  });

  const scheduleHideControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      setGestureHint(null);
    }, 3000);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  useEffect(() => {
    revealControls();
    const interval = setInterval(() => {
      if (!player) return;
      setCurrentTime(Number.isFinite(player.currentTime) ? player.currentTime : 0);
      setDuration(Number.isFinite(player.duration) ? player.duration : 0);
      setIsPlaying(Boolean(player.playing));
    }, 250);

    return () => {
      clearInterval(interval);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [player, revealControls]);

  useEffect(() => {
    if (player) player.volume = volume;
  }, [player, volume]);

  useEffect(() => {
    enablePitchCorrection(player);
  }, [player]);

  const togglePlayback = useCallback(() => {
    if (!player) return;
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
    revealControls();
  }, [player, revealControls]);

  const seekBy = useCallback((seconds) => {
    if (!player) return;
    const nextTime = clamp((player.currentTime || 0) + seconds, 0, duration || Number.MAX_SAFE_INTEGER);
    player.currentTime = nextTime;
    setCurrentTime(nextTime);
    revealControls();
  }, [duration, player, revealControls]);

  const seekToRatio = useCallback((ratio) => {
    if (!player || !duration) return;
    const nextTime = clamp(ratio, 0, 1) * duration;
    player.currentTime = nextTime;
    setCurrentTime(nextTime);
    revealControls();
  }, [duration, player, revealControls]);

  const toggleFullscreen = useCallback(async () => {
    revealControls();
    try {
      await videoViewRef.current?.enterFullscreen?.();
    } catch {
      // Fullscreen support varies by platform; the player remains usable inline.
    }
  }, [revealControls]);

  const createVerticalGesture = useCallback((type) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > Math.abs(gesture.dx) && Math.abs(gesture.dy) > 6,
    onPanResponderGrant: () => {
      gestureStartRef.current = { brightness, volume };
      setGestureHint(type);
      setControlsVisible(true);
    },
    onPanResponderMove: (_, gesture) => {
      const delta = clamp(-gesture.dy / 220, -1, 1);
      if (type === 'brightness') {
        setBrightness(clamp(gestureStartRef.current.brightness + delta, 0.12, 1));
      } else {
        setVolume(clamp(gestureStartRef.current.volume + delta, 0, 1));
      }
    },
    onPanResponderRelease: () => {
      setGestureHint(null);
      scheduleHideControls();
    },
    onPanResponderTerminate: () => {
      setGestureHint(null);
      scheduleHideControls();
    },
  }), [brightness, scheduleHideControls, volume]);

  const brightnessResponder = useMemo(() => createVerticalGesture('brightness'), [createVerticalGesture]);
  const volumeResponder = useMemo(() => createVerticalGesture('volume'), [createVerticalGesture]);
  const progressRatio = duration > 0 ? clamp(currentTime / duration) : 0;
  const brightnessShadeOpacity = clamp((1 - brightness) * 0.58, 0, 0.58);

  return (
    <View style={[styles.container, style]}>
      <VideoView
        ref={videoViewRef}
        player={player}
        style={styles.video}
        contentFit={contentFit}
        nativeControls={true}
        allowsFullscreen
        allowsPictureInPicture={false}
      />

      <Pressable style={styles.touchLayer} onPress={() => {
        setControlsVisible((visible) => {
          const nextVisible = !visible;
          if (nextVisible) scheduleHideControls();
          return nextVisible;
        });
      }}>
        <View style={styles.leftGestureZone} {...brightnessResponder.panHandlers} />
        <View style={styles.rightGestureZone} {...volumeResponder.panHandlers} />
      </Pressable>

      <View pointerEvents="none" style={[styles.brightnessShade, { opacity: brightnessShadeOpacity }]} />

      {controlsVisible && (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.titleCard}>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
            <Text style={styles.subtitleText} numberOfLines={1}>{subtitle}</Text>
          </View>

          <View style={styles.sideMeterLeft} pointerEvents="none">
            <MaterialCommunityIcons name="brightness-6" size={26} color="#fff" />
            {gestureHint === 'brightness' && (
              <Text style={styles.sideValue}>{Math.round(brightness * 100)}%</Text>
            )}
          </View>

          <View style={styles.sideMeterRight} pointerEvents="none">
            <FontAwesome5 name="volume-up" size={24} color="#fff" />
            {gestureHint === 'volume' && (
              <Text style={styles.sideValue}>{Math.round(volume * 100)}%</Text>
            )}
          </View>

          <View style={styles.centerControls} pointerEvents="box-none">
            <TouchableOpacity style={styles.skipButton} activeOpacity={0.84} onPress={() => seekBy(-10)}>
              <MaterialCommunityIcons name="rewind-10" size={48} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.9} onPress={togglePlayback}>
              <LinearGradient
                colors={['#00B7FF', '#7F33FF', '#FF33D1']}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.playButton}
              >
                <FontAwesome5
                  name={isPlaying ? 'pause' : 'play'}
                  size={34}
                  color="#fff"
                  style={!isPlaying && styles.playIconOffset}
                />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipButton} activeOpacity={0.84} onPress={() => seekBy(10)}>
              <MaterialCommunityIcons name="fast-forward-10" size={48} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.bottomControls}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Slider
              style={styles.progressSlider}
              value={progressRatio}
              minimumValue={0}
              maximumValue={1}
              minimumTrackTintColor="#169BFF"
              maximumTrackTintColor="rgba(255,255,255,0.34)"
              thumbTintColor="#fff"
              onValueChange={(value) => setCurrentTime((duration || 0) * value)}
              onSlidingComplete={seekToRatio}
            />
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
            <Text style={styles.hdBadge}>HD</Text>
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.84} onPress={revealControls}>
              <FontAwesome5 name="cog" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.84} onPress={toggleFullscreen}>
              <MaterialCommunityIcons name="fullscreen" size={28} color="#8B54FF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    flexDirection: 'row-reverse',
  },
  leftGestureZone: {
    flex: 1,
  },
  rightGestureZone: {
    flex: 1,
  },
  brightnessShade: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  titleCard: {
    position: 'absolute',
    top: 14,
    right: 12,
    minWidth: 230,
    maxWidth: '42%',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(28, 28, 48, 0.82)',
  },
  titleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitleText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sideMeterLeft: {
    position: 'absolute',
    left: 20,
    top: '48%',
    alignItems: 'center',
    gap: 8,
  },
  sideMeterRight: {
    position: 'absolute',
    right: 20,
    top: '48%',
    alignItems: 'center',
    gap: 8,
  },
  sideValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  centerControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '42%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 50,
  },
  skipButton: {
    width: 72,
    height: 72,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 78,
    height: 78,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7F33FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 12,
  },
  playIconOffset: {
    marginLeft: 5,
  },
  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 62,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: 'rgba(20, 20, 38, 0.82)',
  },
  timeText: {
    width: 56,
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  progressSlider: {
    flex: 1,
    height: 32,
  },
  hdBadge: {
    color: '#17A9FF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
