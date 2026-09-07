import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { I18nManager } from 'react-native';

// Force RTL execution before the app tree is loaded.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
I18nManager.swapLeftAndRightInRTL(true);

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
