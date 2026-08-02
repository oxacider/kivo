/**
 * Server-side Firebase Admin helper — verifies Firebase ID tokens.
 *
 * Used by API routes (`getAuthUser`) and the socket mini-service so that
 * Firebase ID tokens issued by the client are accepted as the bearer token.
 *
 * The admin app is lazily initialized. Credentials are optional for
 * `verifyIdToken` (public keys are fetched anonymously), but a service
 * account can be provided for full Admin SDK features.
 *
 * firebase-admin is server-only — always loaded via dynamic imports so it
 * is never bundled into the client.
 */

let adminApp: import('firebase-admin/app').App | null = null;

/**
 * Get (or lazily initialize) the Firebase Admin app.
 * Returns null when no project id is configured (e.g. missing env).
 */
export async function getFirebaseAdminApp(): Promise<import('firebase-admin/app').App | null> {
  console.log("========== FIREBASE ADMIN INIT ==========");
  if (adminApp) return adminApp;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const hasServiceAccountPath = !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  // Temporary diagnostic logging (no secrets)
  console.log('[Firebase Admin] Init — projectId:', projectId || '(not set)');
  console.log('[Firebase Admin] Init — FIREBASE_SERVICE_ACCOUNT_B64 present:', hasServiceAccount);
  console.log('[Firebase Admin] Init — FIREBASE_SERVICE_ACCOUNT_PATH present:', hasServiceAccountPath);
  console.log('[Firebase Admin] Init — NODE_ENV:', process.env.NODE_ENV || '(not set)');

  if (!projectId) {
    console.log('[Firebase Admin] Aborting init — no projectId configured');
    return null;
  }

  try {
    const admin = await import('firebase-admin/app');
    console.log('[Firebase Admin] firebase-admin/app imported successfully');

    // Reuse an existing admin app if already initialized
    if (admin.getApps().length > 0) {
      adminApp = admin.getApps()[0];
      console.log('[Firebase Admin] Reusing existing admin app, app name:', adminApp.name);
      return adminApp;
    }

    const options: import('firebase-admin/app').AppOptions = { projectId };

    if (hasServiceAccount) {
      try {
        const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64!;
        console.log('[Firebase Admin] Decoding service account — base64 length:', b64.length);
        const json = Buffer.from(b64, 'base64').toString('utf-8');
        const parsed = JSON.parse(json);
        console.log('[Firebase Admin] Service account parsed — project_id:', parsed.project_id, 'client_email:', parsed.client_email);
        options.credential = admin.cert(parsed);
        console.log('[Firebase Admin] Credential created from service account');
      } catch (saErr: any) {
        console.error('[Firebase Admin] Service account parse failed:', saErr?.message || saErr);
        throw saErr; // re-throw so the outer catch becomes the single exit point
      }
    } else if (hasServiceAccountPath) {
      console.log('[Firebase Admin] Loading service account from path:', process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      const sa = await import(process.env.FIREBASE_SERVICE_ACCOUNT_PATH!);
      options.credential = admin.cert(sa);
    } else {
      console.log('[Firebase Admin] No service account configured — using application default credentials');
    }

    adminApp = admin.initializeApp(options);
    console.log('[Firebase Admin] App initialized successfully — name:', adminApp.name, 'projectId:', projectId);
    return adminApp;
  } catch (err: any) {
    console.error('[Firebase Admin] Failed to initialize:', err?.message || err, err?.stack?.split('\n').slice(0, 3).join('\n'));
    return null;
  }
}

/**
 * Verify a Firebase ID token.
 * Returns `{ uid, email }` on success, or null if invalid / not a Firebase token.
 * Never throws.
 */
export async function verifyFirebaseIdToken(
  token: string,
): Promise<{ uid: string; email: string | null } | null> {
  try {
    const app = await getFirebaseAdminApp();
    if (!app) {
      console.log('[Firebase Admin] verifyFirebaseIdToken — getFirebaseAdminApp() returned null');
      return null;
    }

    const { getAuth } = await import('firebase-admin/auth');
    console.log('[Firebase Admin] verifyFirebaseIdToken — calling verifyIdToken()');
    const decoded = await getAuth(app).verifyIdToken(token);
    console.log('[Firebase Admin] verifyFirebaseIdToken — success, uid:', decoded.uid, 'email:', decoded.email);

    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch (err: any) {
    console.error('[Firebase Admin] verifyFirebaseIdToken — FAILED:', err?.message || err, 'code:', err?.code || '(no code)');
    return null;
  }
}

/**
 * Check whether the Firebase account behind an ID token has a verified email.
 * Returns `true`/`false` on success, or null if the token is invalid or
 * Firebase is not configured. Never throws.
 */
export async function isFirebaseEmailVerified(
  token: string,
): Promise<boolean | null> {
  try {
    const app = await getFirebaseAdminApp();
    if (!app) return null;

    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth(app).verifyIdToken(token);
    const record = await getAuth(app).getUser(decoded.uid);
    return record.emailVerified;
  } catch {
    return null;
  }
}
