import Constants from 'expo-constants';

const DEFAULT_STREAM_DOMAIN = 'vz-7d113049-fda.b-cdn.net';
const STREAM_LIBRARY_DOMAINS = {
  675556: 'vz-5db52be9-935.b-cdn.net',
  711770: 'vz-7d113049-fda.b-cdn.net',
};

const readExtra = () => Constants.expoConfig?.extra || Constants.manifest?.extra || {};

export const getBunnyConfig = () => {
  const extra = readExtra();
  return {
    streamDomain:
      extra.bunnyStreamDomain
      || process.env.EXPO_PUBLIC_BUNNY_STREAM_DOMAIN
      || DEFAULT_STREAM_DOMAIN,
  };
};

const buildBunnyCdnPlaylistUrl = ({ playbackDomain, videoId }) => {
  const cleanVideoId = String(videoId || '').trim();
  const cleanDomain = String(playbackDomain || '').trim();
  if (!cleanDomain || !cleanVideoId) return '';
  return `https://${cleanDomain}/${cleanVideoId}/playlist.m3u8`;
};

export const parseBunnyVideoReference = (url = '') => {
  const raw = String(url || '').trim();
  if (!raw) return null;

  const match = raw.match(/(?:iframe|player)\.mediadelivery\.net\/(?:embed|play)\/([^/?#]+)\/([^/?#]+)/i);
  if (!match) return null;

  const [, videoLibraryId, videoId] = match;
  return {
    videoLibraryId,
    videoId,
  };
};

export const resolveBunnyPlaybackUrl = async (url = '') => {
  const raw = String(url || '').trim();
  if (!raw) return '';

  const streamMatch = raw.match(/(?:iframe|player)\.mediadelivery\.net\/(?:embed|play)\/([^/?#]+)\/([^/?#]+)/i);
  if (streamMatch) {
    const [, libraryId, videoId] = streamMatch;
    const { streamDomain } = getBunnyConfig();
    const playbackDomain = STREAM_LIBRARY_DOMAINS[libraryId] || streamDomain || `vz-${libraryId}.b-cdn.net`;
    return buildBunnyCdnPlaylistUrl({ playbackDomain, videoId });
  }

  const cdnMatch = raw.match(/^https?:\/\/([^/]+)\/([^/?#]+)\/playlist\.m3u8/i);
  if (cdnMatch && /\.b-cdn\.net$/i.test(cdnMatch[1])) {
    return raw;
  }

  return raw;
};

export const getBunnyPlaybackHeaders = ({ playbackUrl = '', originalUrl = '' } = {}) => {
  const reference = parseBunnyVideoReference(originalUrl);
  const cdnMatch = String(playbackUrl || '').match(/^https?:\/\/([^/]+)\/([^/?#]+)\/playlist\.m3u8/i);

  let videoLibraryId = reference?.videoLibraryId || '';
  const videoId = reference?.videoId || cdnMatch?.[2] || '';

  if (!videoLibraryId && cdnMatch?.[1]) {
    const domain = String(cdnMatch[1]).toLowerCase();
    videoLibraryId = Object.entries(STREAM_LIBRARY_DOMAINS)
      .find(([, streamDomain]) => streamDomain.toLowerCase() === domain)?.[0] || '711770';
  }

  if (!videoLibraryId || !videoId) return null;

  const referer = `https://iframe.mediadelivery.net/embed/${videoLibraryId}/${videoId}`;
  return {
    Referer: referer,
    Origin: 'https://iframe.mediadelivery.net',
  };
};
