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
  if (adminApp) return adminApp;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  try {
    const admin = await import('firebase-admin/app');

    // Reuse an existing admin app if already initialized
    if (admin.getApps().length > 0) {
      adminApp = admin.getApps()[0];
      return adminApp;
    }

    const options: import('firebase-admin/app').AppOptions = { projectId };

    if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
      const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf-8');
      options.credential = admin.cert(JSON.parse(json));
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const sa = await import(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      options.credential = admin.cert(sa);
    }

    adminApp = admin.initializeApp(options);
    return adminApp;
  } catch (err) {
    console.error('[Firebase Admin] Failed to initialize:', err);
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
    if (!app) return null;

    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth(app).verifyIdToken(token);

    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
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
