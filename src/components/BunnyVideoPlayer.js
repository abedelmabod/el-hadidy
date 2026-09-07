import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const buildBunnyEmbedUrl = ({
  videoId,
  videoLibraryId,
  autoplay = false,
  muted = false,
  loop = false,
  preload = true,
  playsinline = true,
  responsive = true,
}) => {
  const library = encodeURIComponent(String(videoLibraryId || '').trim());
  const video = encodeURIComponent(String(videoId || '').trim());
  const params = new URLSearchParams({
    autoplay: String(Boolean(autoplay)),
    muted: String(Boolean(muted)),
    loop: String(Boolean(loop)),
    preload: String(Boolean(preload)),
    playsinline: String(Boolean(playsinline)),
    responsive: String(Boolean(responsive)),
  });

  return `https://player.mediadelivery.net/embed/${library}/${video}?${params.toString()}`;
};

const buildBunnyPlayerHtml = (playerUrl, fillMode = 'contain') => {
  const isCover = fillMode === 'cover';
  const isFill = fillMode === 'fill';

  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: #000;
        overflow: hidden;
      }

      .player-shell {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        background: #000;
      }

      iframe {
        position: absolute;
        ${isCover ? 'top: 50%; left: 50%;' : 'inset: 0;'}
        width: ${isCover ? 'max(100vw, calc(100vh * 16 / 9))' : '100%'};
        height: ${isCover ? 'max(100vh, calc(100vw * 9 / 16))' : '100%'};
        transform: ${isCover ? 'translate(-50%, -50%)' : 'none'};
        border: 0;
        background: #000;
      }

      ${isFill ? `
      iframe {
        object-fit: fill;
      }
      ` : ''}
    </style>
  </head>
  <body>
    <div class="player-shell">
      <iframe
        src="${playerUrl}"
        loading="eager"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowfullscreen="true"
        webkitallowfullscreen="true"
        mozallowfullscreen="true"
      ></iframe>
    </div>
  </body>
</html>
`;
};

export default function BunnyVideoPlayer({
  videoId,
  videoLibraryId,
  style,
  autoplay = false,
  muted = false,
  loop = false,
  preload = true,
  playsinline = true,
  fillMode = 'contain',
  onLoad,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const hasRequiredIds = Boolean(String(videoId || '').trim() && String(videoLibraryId || '').trim());

  const playerUrl = useMemo(() => {
    if (!hasRequiredIds) return '';
    return buildBunnyEmbedUrl({
      videoId,
      videoLibraryId,
      autoplay,
      muted,
      loop,
      preload,
      playsinline,
      responsive: true,
    });
  }, [autoplay, hasRequiredIds, loop, muted, playsinline, preload, videoId, videoLibraryId]);

  const playerHtml = useMemo(() => {
    if (!playerUrl) return '';
    return buildBunnyPlayerHtml(playerUrl, fillMode);
  }, [fillMode, playerUrl]);

  if (!hasRequiredIds) {
    return (
      <View style={[styles.container, styles.emptyState, style]}>
        <Text style={styles.emptyText}>Video is unavailable.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        source={{ html: playerHtml, baseUrl: 'https://player.mediadelivery.net' }}
        style={styles.webView}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={!autoplay}
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures={false}
        androidLayerType="hardware"
        androidHardwareAccelerationDisabled={false}
        thirdPartyCookiesEnabled
        onLoadEnd={(event) => {
          setLoading(false);
          onLoad?.(event);
        }}
        onError={(event) => {
          setLoading(false);
          onError?.(event);
        }}
      />
      {loading && (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
    </View>
  );
}

export { buildBunnyEmbedUrl };

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
