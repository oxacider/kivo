import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kivo.messenger',
  appName: 'KIVO',
  webDir: 'out',
  server: {
    // In production, point Capacitor WebView to your deployed KIVO server.
    // All relative API/socket URLs in the web app resolve against this origin.
    // For local development with Android emulator: use your machine's LAN IP.
    url: process.env.CAPACITOR_SERVER_URL,
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#f5f3ff',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#7c3aed',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'none' as any,
      resizeOnFullScreen: true,
    },
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#f5f3ff',
  },
};

export default config;
