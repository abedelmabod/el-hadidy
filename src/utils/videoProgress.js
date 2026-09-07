import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_WATCHING_KEY = 'elhadidy_continue_watching';
const PROGRESS_MAP_KEY = 'elhadidy_video_progress_map';

export const getVideoProgressKey = ({ lectureId, originalVideoUrl, videoUrl } = {}) => {
  if (lectureId) return `lecture:${lectureId}`;
  if (originalVideoUrl) return `url:${originalVideoUrl}`;
  if (videoUrl) return `url:${videoUrl}`;
  return '';
};

const readProgressMap = async () => {
  const raw = await AsyncStorage.getItem(PROGRESS_MAP_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeProgressMap = (progressMap) =>
  AsyncStorage.setItem(PROGRESS_MAP_KEY, JSON.stringify(progressMap));

export const getLastWatchingProgress = async () => {
  const raw = await AsyncStorage.getItem(LAST_WATCHING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const getAllVideoProgress = readProgressMap;

export const getSortedVideoProgress = async () => {
  const progressMap = await readProgressMap();
  return Object.values(progressMap)
    .filter((item) => item?.videoUrl || item?.originalVideoUrl)
    .sort((a, b) => (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0));
};

export const getVideoProgress = async (identity = {}) => {
  const key = getVideoProgressKey(identity);
  if (!key) return null;
  const progressMap = await readProgressMap();
  return progressMap[key] || null;
};

export const saveVideoProgress = async (identity = {}, payload = {}) => {
  const key = getVideoProgressKey(identity);
  if (!key) return;

  const nextPayload = {
    ...payload,
    progressKey: key,
    lectureId: identity.lectureId || payload.lectureId || '',
    originalVideoUrl: identity.originalVideoUrl || payload.originalVideoUrl || '',
    videoUrl: identity.videoUrl || payload.videoUrl || '',
    updatedAt: Date.now(),
  };

  const progressMap = await readProgressMap();
  progressMap[key] = nextPayload;

  await Promise.all([
    writeProgressMap(progressMap),
    AsyncStorage.setItem(LAST_WATCHING_KEY, JSON.stringify(nextPayload)),
  ]);
};

export const clearVideoProgress = async (identity = {}) => {
  const key = getVideoProgressKey(identity);
  if (!key) return;

  const progressMap = await readProgressMap();
  delete progressMap[key];
  await writeProgressMap(progressMap);

  const last = await getLastWatchingProgress();
  if (last?.progressKey === key) {
    await AsyncStorage.removeItem(LAST_WATCHING_KEY);
  }
};
