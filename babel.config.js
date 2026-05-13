module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // أي بلجنز أخرى تريد إضافتها مستقبلاً توضع هنا
      
      'react-native-reanimated/plugin', // يجب أن يظل دائماً في آخر القائمة
    ],
  };
};