import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useEventListener } from 'expo';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenCapture from 'expo-screen-capture';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearVideoProgress, getVideoProgress, saveVideoProgress } from '../utils/videoProgress';
import { checkActiveVideoAccess, getAccessDeniedMessage } from '../utils/studentAccessGuard';
import { getBunnyPlaybackHeaders } from '../services/bunny-service';

const PLAYBACK_SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

const enablePitchCorrection = (player) => {
  try {
    if (player && 'preservesPitch' in player) {
      player.preservesPitch = true;
    }
  } catch {}
};

const hideAndroidNavigationBar = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await NavigationBar.setBehaviorAsync('overlay-swipe');
    await NavigationBar.setVisibilityAsync('hidden');
  } catch {}
};

const showAndroidNavigationBar = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await NavigationBar.setVisibilityAsync('visible');
    await NavigationBar.setBehaviorAsync('inset-touch');
  } catch {}
};

export default function VideoPlayerScreen({ route, navigation, user }) {
  const {
    videoUrl = '',
    originalVideoUrl = '',
    videoTitle = 'فيديو',
    videoSubtitle = '',
    lectureId = '',
    subjectName = '',
    chapterName = '',
    accessYear = '',
    user: routeUser = null,
    resumeAt = 0,
  } = route?.params || {};

  const activeUser = routeUser || user || null;
  const screenshotsAllowed =
    activeUser?.allowScreenshots === true ||
    activeUser?.screenshotAllowed === true ||
    activeUser?.canTakeScreenshots === true;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const didResumeRef = useRef(false);
  const lastSavedSecondRef = useRef(0);
  const playbackPositionRef = useRef(0);
  const pendingPlaybackRestoreRef = useRef(null);
  const loadedSourceKeyRef = useRef('');
  const statusErrorShownRef = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [accessState, setAccessState] = useState({ checking: true, allowed: false });
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedOptions, setShowSpeedOptions] = useState(false);
  const activeUserKey = useMemo(() => JSON.stringify([
    activeUser?.id,
    activeUser?.uid,
    activeUser?.isBanned,
    activeUser?.isSubscribed,
    activeUser?.usedCode,
    activeUser?.usedCodes || [],
  ]), [activeUser]);

  const source = useMemo(() => {
    if (!accessState.allowed) return null;
    if (!videoUrl) return null;
    const isHls = /\.m3u8($|\?)/i.test(videoUrl);
    const headers = getBunnyPlaybackHeaders({
      playbackUrl: videoUrl,
      originalUrl: originalVideoUrl || videoUrl,
    });
    return {
      uri: videoUrl,
      ...(isHls ? { contentType: 'hls' } : {}),
      ...(headers ? { headers } : {}),
      metadata: {
        title: videoTitle || 'فيديو',
        artist: 'El Hadidy Platform',
      },
    };
  }, [accessState.allowed, originalVideoUrl, videoTitle, videoUrl]);


  const sourceKey = source?.uri || '';

  const player = useVideoPlayer(null, (instance) => {
    instance.loop = false;
    enablePitchCorrection(instance);
    instance.timeUpdateEventInterval = 0.5;
  });

  useEffect(() => {
    hideAndroidNavigationBar();
    return () => {
      showAndroidNavigationBar();
    };
  }, []);

  useEffect(() => {
    if (!player || !source || !sourceKey || loadedSourceKeyRef.current === sourceKey) return;

    let cancelled = false;
    loadedSourceKeyRef.current = sourceKey;
    statusErrorShownRef.current = false;
    setPlayerLoading(true);

    const loadSource = async () => {
      try {
        if (typeof player.replaceAsync === 'function') {
          await player.replaceAsync(source);
        } else {
          player.replace(source, true);
        }

        if (cancelled) return;
        enablePitchCorrection(player);
        player.currentTime = Number(resumeAt) > 5 ? Number(resumeAt) : playbackPositionRef.current || 0;
        player.play();
      } catch {
        if (!cancelled) {
          loadedSourceKeyRef.current = '';
          Alert.alert('تعذر التشغيل', 'لم يتمكن مشغل Expo من تشغيل رابط الفيديو الحالي.');
        }
      } finally {
        if (!cancelled) setPlayerLoading(false);
      }
    };

    loadSource();

    return () => {
      cancelled = true;
    };
  }, [player, resumeAt, source, sourceKey]);

  useEffect(() => {
    let isMounted = true;

    const verifyAccess = async () => {
      setAccessState({ checking: true, allowed: false });
      const accessCheck = await checkActiveVideoAccess(activeUser, accessYear);
      if (!isMounted) return;

      if (!accessCheck.allowed) {
        setAccessState({ checking: false, allowed: false });
        try { player?.pause?.(); } catch {}
        Alert.alert('تنبيه', getAccessDeniedMessage(accessCheck.reason), [
          { text: 'رجوع', onPress: () => navigation?.goBack?.() },
        ]);
        return;
      }

      setAccessState({ checking: false, allowed: true });
    };

    verifyAccess().catch(() => {
      if (!isMounted) return;
      setAccessState({ checking: false, allowed: false });
      Alert.alert('تنبيه', 'لا يمكن التحقق من أهلية الوصول حاليًا. حاول مرة أخرى.', [
        { text: 'رجوع', onPress: () => navigation?.goBack?.() },
      ]);
    });

    return () => {
      isMounted = false;
    };
  }, [accessYear, activeUserKey, navigation]);

  useEventListener(player, 'timeUpdate', ({ currentTime: nextTime }) => {
    if (!accessState.allowed) return;
    const safeTime = Number.isFinite(nextTime) ? nextTime : 0;
    const safeDuration = Number.isFinite(player.duration) ? player.duration : 0;
    playbackPositionRef.current = safeTime;
    const roundedSecond = Math.floor(safeTime);
    const shouldSave = roundedSecond > 5 && Math.abs(roundedSecond - lastSavedSecondRef.current) >= 3;
    if (!shouldSave) return;

    lastSavedSecondRef.current = roundedSecond;
    if (safeDuration > 0 && safeDuration - safeTime <= 15) {
      clearVideoProgress({ lectureId, originalVideoUrl: originalVideoUrl || videoUrl, videoUrl }).catch(() => {});
      return;
    }

    saveVideoProgress(
      { lectureId, originalVideoUrl: originalVideoUrl || videoUrl, videoUrl },
      {
        videoUrl,
        originalVideoUrl: originalVideoUrl || videoUrl,
        videoTitle,
        videoSubtitle,
        lectureId,
        subjectName,
        chapterName,
        currentTime: safeTime,
        duration: safeDuration,
      }
    ).catch(() => {});
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      setPlayerLoading(false);
      return;
    }

    if (status === 'loading') {
      setPlayerLoading(true);
      return;
    }

    if (status === 'error' && !statusErrorShownRef.current) {
      statusErrorShownRef.current = true;
      setPlayerLoading(false);
      Alert.alert(
        'تعذر تشغيل الفيديو',
        'مشغل Expo لم يستطع تشغيل هذا الرابط. تأكد أن رابط الفيديو HLS أو MP4 مباشر وصالح للتشغيل.'
      );
    }
  });

  useEventListener(player, 'playbackRateChange', () => {
    enablePitchCorrection(player);
  });

  useEffect(() => {
    if (!player) return;

    try {
      player.playbackRate = playbackRate;
      enablePitchCorrection(player);
    } catch {}
  }, [playbackRate, player]);

  useEffect(() => {
    const prepareScreen = async () => {
      try {
        if (screenshotsAllowed) {
          await ScreenCapture.allowScreenCaptureAsync();
        } else {
          await ScreenCapture.preventScreenCaptureAsync();
        }
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } catch {}
    };

    prepareScreen();

    return () => {
      try { player?.pause?.(); } catch {}
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [player, screenshotsAllowed]);

  useEffect(() => {
    if (!player || !videoUrl || didResumeRef.current) return;
    didResumeRef.current = true;

    const restoreProgress = async () => {
      const directResumeTime = Number(resumeAt) || 0;
      if (directResumeTime > 5) {
        player.currentTime = directResumeTime;
        return;
      }

      try {
        const saved = await getVideoProgress({ lectureId, originalVideoUrl, videoUrl });
        const savedTime = Number(saved?.currentTime) || 0;
        if (savedTime > 5) {
          player.currentTime = savedTime;
        }
      } catch {}
    };

    restoreProgress();
  }, [lectureId, originalVideoUrl, player, resumeAt, videoUrl]);

  const toggleFullscreen = useCallback(async () => {
    const nextFullscreen = !isFullscreen;
    const currentTime = Number(player?.currentTime);
    const restoreTime = Number.isFinite(currentTime) && currentTime > 0
      ? currentTime
      : playbackPositionRef.current;

    pendingPlaybackRestoreRef.current = {
      time: restoreTime,
      shouldPlay: Boolean(player?.playing) || accessState.allowed,
    };

    setIsFullscreen(nextFullscreen);

    try {
      if (Platform.OS !== 'web') {
        await ScreenOrientation.lockAsync(
          nextFullscreen
            ? ScreenOrientation.OrientationLock.LANDSCAPE
            : ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
      }
    } catch {}
  }, [accessState.allowed, isFullscreen, player]);

  useEffect(() => {
    if (!player || !accessState.allowed || !pendingPlaybackRestoreRef.current) return undefined;

    const restorePlayback = () => {
      const pending = pendingPlaybackRestoreRef.current;
      if (!pending) return;

      try {
        if (Number.isFinite(pending.time) && pending.time > 0) {
          player.currentTime = pending.time;
          playbackPositionRef.current = pending.time;
        }
        if (pending.shouldPlay) {
          player.play();
        }
      } catch {}

      pendingPlaybackRestoreRef.current = null;
    };

    const timer = setTimeout(restorePlayback, 350);
    return () => clearTimeout(timer);
  }, [accessState.allowed, isFullscreen, player]);

  if (!videoUrl) {
    return (
      <View style={styles.emptyScreen}>
        <Text style={styles.emptyTitle}>رابط الفيديو غير متاح</Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => navigation?.goBack?.()}>
          <Text style={styles.emptyButtonText}>رجوع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (accessState.checking || !player) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#7A4E2F" />
      </View>
    );
  }

  if (!accessState.allowed) {
    return (
      <View style={styles.emptyScreen}>
        <Text style={styles.emptyTitle}>هذا المحتوى غير متاح حالياً</Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => navigation?.goBack?.()}>
          <Text style={styles.emptyButtonText}>رجوع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const portraitVideoWidth = Math.min(width, 520);
  const landscapeVideoWidth = Math.max(width, height);
  const landscapeVideoHeight = Math.min(width, height);
  const fullscreenVideoFrameStyle = isFullscreen
    ? {
      width: landscapeVideoWidth,
      height: landscapeVideoHeight,
    }
    : null;
  const headerSafeAreaStyle = {
    top: Math.max(insets.top + 8, 18),
    right: Math.max(insets.right + 18, 18),
    left: Math.max(insets.left + 18, 18),
  };

  const selectPlaybackRate = (nextRate) => {
    setPlaybackRate(nextRate);
    setShowSpeedOptions(false);
  };

  return (
    <View style={[styles.screen, isFullscreen ? styles.screenFullscreen : styles.screenPortrait]}>
      <StatusBar hidden={isFullscreen} barStyle="light-content" backgroundColor="#000000" />

      {!isFullscreen && (
        <View style={[styles.portraitHeader, { paddingTop: Math.max(insets.top + 10, 18) }]}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation?.goBack?.()} activeOpacity={0.82}>
            <FontAwesome5 name="arrow-right" size={17} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{videoTitle || 'فيديو'}</Text>
            {!!videoSubtitle && <Text style={styles.headerSubtitle} numberOfLines={1}>{videoSubtitle}</Text>}
          </View>
          <TouchableOpacity style={styles.headerButton} onPress={toggleFullscreen} activeOpacity={0.82}>
            <MaterialCommunityIcons name="fullscreen" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {!isFullscreen && <View style={styles.videoCenterSpacer} />}

      <View
        style={[
          styles.videoFrame,
          isFullscreen
            ? [styles.videoFrameFullscreen, fullscreenVideoFrameStyle]
            : {
              width: portraitVideoWidth,
              height: portraitVideoWidth * 9 / 16,
              marginTop: 0,
            },
        ]}
      >
        <VideoView
          player={player}
          style={styles.video}
          contentFit={isFullscreen ? 'cover' : 'contain'}
          nativeControls
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
        {playerLoading && (
          <View pointerEvents="none" style={styles.playerLoadingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        )}
      </View>

      {!isFullscreen && <View style={styles.videoCenterSpacer} />}

      {isFullscreen && (
        <>
          <View style={[styles.headerOverlay, headerSafeAreaStyle]}>
            <TouchableOpacity style={styles.floatingButton} onPress={() => navigation?.goBack?.()} activeOpacity={0.82}>
              <FontAwesome5 name="times" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.floatingButton, styles.speedButton]}
                onPress={() => setShowSpeedOptions((visible) => !visible)}
                activeOpacity={0.82}
              >
                <Text style={styles.speedButtonText}>{playbackRate}x</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.floatingButton} onPress={toggleFullscreen} activeOpacity={0.82}>
                <MaterialCommunityIcons
                  name="fullscreen-exit"
                  size={24}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>
          </View>

          {showSpeedOptions && (
            <View style={[styles.speedMenu, { top: headerSafeAreaStyle.top + 52, right: headerSafeAreaStyle.right }]}>
              {PLAYBACK_SPEEDS.map((speed) => {
                const active = playbackRate === speed;
                return (
                  <TouchableOpacity
                    key={speed}
                    style={[styles.speedOption, active && styles.speedOptionActive]}
                    onPress={() => selectPlaybackRate(speed)}
                    activeOpacity={0.82}
                  >
                    <Text style={[styles.speedOptionText, active && styles.speedOptionTextActive]}>
                      {speed}x
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  screenPortrait: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
  },
  screenFullscreen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitHeader: {
    width: '100%',
    maxWidth: 560,
    paddingBottom: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  videoCenterSpacer: {
    flex: 1,
    minHeight: 18,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 12,
    fontWeight: '700',
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 3,
  },
  videoFrame: {
    backgroundColor: '#000000',
    overflow: 'hidden',
    borderRadius: 18,
  },
  videoFrameFullscreen: {
    marginTop: 0,
    borderRadius: 0,
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  playerLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  headerOverlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  headerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  floatingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  speedButton: {
    width: 58,
  },
  speedButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  controlsPanel: {
    width: '100%',
    maxWidth: 560,
    marginTop: 16,
    padding: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  controlsHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  controlsTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  controlsValue: {
    color: '#F5D39A',
    fontSize: 14,
    fontWeight: '900',
  },
  speedChips: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  speedChip: {
    minWidth: 58,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  speedChipActive: {
    backgroundColor: '#F5D39A',
    borderColor: '#F5D39A',
  },
  speedChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  speedChipTextActive: {
    color: '#20140D',
  },
  nativeHint: {
    marginTop: 12,
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    fontWeight: '700',
    writingDirection: 'rtl',
    textAlign: 'right',
    lineHeight: 18,
  },
  speedMenu: {
    position: 'absolute',
    width: 190,
    borderRadius: 18,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    zIndex: 20,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  speedOption: {
    minWidth: 50,
    minHeight: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  speedOptionActive: {
    backgroundColor: '#FFFFFF',
  },
  speedOptionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  speedOptionTextActive: {
    color: '#000000',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  emptyScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    padding: 24,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 16,
  },
  emptyButton: {
    minWidth: 120,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#7A4E2F',
    alignItems: 'center',
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
});
