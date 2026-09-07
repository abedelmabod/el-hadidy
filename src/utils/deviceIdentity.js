import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

const DEVICE_INSTALL_ID_KEY = 'elhadidy_device_install_id';

export const getClientDevice = async () => {
  let installId = await AsyncStorage.getItem(DEVICE_INSTALL_ID_KEY);

  if (!installId) {
    installId = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    await AsyncStorage.setItem(DEVICE_INSTALL_ID_KEY, installId);
  }

  return {
    id: installId,
    type: Device.osName || Platform.OS,
    info: `${Device.brand || 'device'} ${Device.modelName || ''}`.trim(),
  };
};
