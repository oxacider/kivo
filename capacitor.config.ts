import type { CapacitorConfig } from '@capacitor/cli';

/**
 * KIVO Capacitor Configuration
 *
 * Production APK flow:
 *   1. Deploy the Next.js server (standalone output)
 *   2. Set CAPACITOR_SERVER_URL=<https://your-kivo-server.com>
 *   3. Run the build:android script (or manual steps below)
 *   4. The WebView loads from server.url; local webDir is a fallback shell
 *
 * Development (live reload) flow:
 *   1. Run `bun run dev` and note the LAN IP
 *   2. CAPACITOR_SERVER_URL=http://<LAN_IP>:3000 npx cap run android -l
 */

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.kivo.messenger',
  appName: 'KIVO',
  webDir: 'out',
  server: serverUrl
    ? {
        url: serverUrl,
        androidScheme: 'https',
        cleartext: true,
      }
    : undefined,
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#f5f3ff',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#f5f3ff',
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
