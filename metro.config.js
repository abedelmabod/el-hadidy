const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// منع Metro تماماً من قراءة مجلد electron أو أي ملفات تخصه
config.resolver.blockList = [
  /.*\/electron\/.*/,
  /.*node_modules\/electron\/.*/
];

// استخدام الـ Mock اللي إنت عملته (الظاهر في الصورة)
config.resolver.extraNodeModules = {
  electron: path.resolve(__dirname, 'electron-mock.js'),
};

module.exports = config;