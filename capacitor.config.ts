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

// Public Firebase Auth domain (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN). Listed in
// server.allowNavigation so Firebase Auth flows (popup/redirect) stay inside
// the WebView instead of opening the external browser. Falls back to the
// known project domain if the env var isn't present in this build context.
const FIREBASE_AUTH_DOMAIN =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'kivo-96303.firebaseapp.com';

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.kivo.messenger',
  appName: 'KIVO',
  webDir: 'out',
  server: serverUrl
    ? {
        url: serverUrl,
        androidScheme: 'https',
        // Cleartext only needed for http:// dev/LAN origins — keep production
        // https builds hardened (cleartext defaults to false on Android).
        cleartext: serverUrl.startsWith('http://'),
        // Local bundled page shown when the configured server can't be
        // reached (offline / server down) — keeps a KIVO-branded placeholder
        // fallback even in server.url (production) mode. Generated into the
        // webDir by .zscripts/ensure-webdir.cjs as offline.html.
        errorPath: 'offline.html',
        allowNavigation: [FIREBASE_AUTH_DOMAIN],
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
