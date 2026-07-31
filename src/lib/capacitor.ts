/**
 * KIVO Capacitor Platform Layer
 *
 * Centralizes all Capacitor access so the rest of the codebase
 * never imports from @capacitor/core directly.
 *
 * On web (including dev), every helper gracefully degrades —
 * isNative returns false, plugins return no-ops.
 */

import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';

// -------------------------------------------------------------------
//  Platform Detection
// -------------------------------------------------------------------

export const isNative = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isIOS = Capacitor.getPlatform() === 'ios';
export const isWeb = !isNative;
export const platform = Capacitor.getPlatform();

// -------------------------------------------------------------------
//  Plugin Wrappers (no-ops on web)
// -------------------------------------------------------------------

/** Light haptic tap */
export async function hapticLight() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* */ }
}

/** Medium haptic impact */
export async function hapticMedium() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* */ }
}

/** Heavy haptic impact */
export async function hapticHeavy() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch { /* */ }
}

/** Success haptic notification */
export async function hapticSuccess() {
  if (!isNative) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* */ }
}

/** Error haptic notification */
export async function hapticError() {
  if (!isNative) return;
  try { await Haptics.notification({ type: NotificationType.Error }); } catch { /* */ }
}

/** Warning haptic notification */
export async function hapticWarning() {
  if (!isNative) return;
  try { await Haptics.notification({ type: NotificationType.Warning }); } catch { /* */ }
}

// -------------------------------------------------------------------
//  StatusBar
// -------------------------------------------------------------------

export async function setStatusBarStyle(dark: boolean) {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? '#1a1625' : '#f5f3ff' });
  } catch { /* */ }
}

// -------------------------------------------------------------------
//  Keyboard
// -------------------------------------------------------------------

/** Programmatically hide the soft keyboard */
export async function hideKeyboard() {
  if (!isNative) return;
  try { await Keyboard.hide(); } catch { /* */ }
}

/** Show the soft keyboard */
export async function showKeyboard() {
  if (!isNative) return;
  try { await Keyboard.show(); } catch { /* */ }
}

// -------------------------------------------------------------------
//  SplashScreen
// -------------------------------------------------------------------

/** Hide the native splash screen (call after KIVO's web splash finishes) */
export async function hideSplash() {
  if (!isNative) return;
  try { await SplashScreen.hide({ fadeOutDuration: 300 }); } catch { /* */ }
}

// -------------------------------------------------------------------
//  Network
// -------------------------------------------------------------------

export async function getNetworkStatus() {
  if (!isNative) return { connected: true, connectionType: 'wifi' as const };
  try { return await Network.getStatus(); } catch { return { connected: true, connectionType: 'unknown' as const }; }
}

// -------------------------------------------------------------------
//  Socket URL
// -------------------------------------------------------------------

/**
 * Returns the Socket.IO connection URL.
 *
 * - Web (sandbox): uses Caddy gateway with XTransformPort
 * - Native: uses configurable env or default socket path
 *
 * NEXT_PUBLIC_SOCKET_URL is baked at build time by Next.js.
 * For native, this should be set to the proper socket path on your
 * production server (e.g. '/socket.io' if behind a proper reverse proxy).
 */
export const SOCKET_URL: string =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  (isNative ? '/socket.io' : '/?XTransformPort=3003');
