import { registerRootComponent } from 'expo';
import { Alert } from 'react-native';

// Global error handler - shows errors instead of crashing
const originalHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
  try {
    Alert.alert(
      isFatal ? "Fatal Error" : "Error",
      error?.message || String(error),
      [{ text: "OK" }]
    );
  } catch (e) {
    // fallback
  }
  if (originalHandler) {
    originalHandler(error, isFatal);
  }
});

import App from './App';

registerRootComponent(App);
// v2.0.0
