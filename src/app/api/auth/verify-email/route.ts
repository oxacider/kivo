import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';
import { verifyFirebaseIdToken, isFirebaseEmailVerified } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Log Firebase identity WITHOUT changing the auth flow (getAuthUser still gates)
    if (token) {
      const fb = await verifyFirebaseIdToken(token);
      console.log('[verify-email] Firebase uid:', fb?.uid ?? '(unavailable)', '| Firebase email:', fb?.email ?? '(unavailable)');
    } else {
      console.log('[verify-email] No Bearer token in Authorization header');
    }

    const user = await getAuthUser(request);
    console.log('[verify-email] authenticated DB user:', user ? { id: user.id, email: user.email, emailVerified: user.emailVerified } : 'null');
    if (!user) return errorResponse('Unauthorized', 401);

    if (user.emailVerified) {
      return Response.json({ success: true, data: { verified: true } });
    }

    // Log request payload (read once, reused by the legacy path below) — redact the code value
    let payload: any = null;
    try {
      payload = await request.json();
      console.log('[verify-email] request payload:', JSON.stringify(payload, (k, v) => (k === 'code' ? '***' : v)), '| hasCode:', !!payload?.code);
    } catch (payloadErr: any) {
      console.log('[verify-email] request payload: (no JSON body or unparseable) —', payloadErr?.message || payloadErr);
    }

    // Firebase path (primary): the verification status lives in Firebase,
    // so check it directly instead of relying on a legacy DB code.
    if (token) {
      const firebaseToken = await verifyFirebaseIdToken(token);
      if (firebaseToken) {
        console.log('[verify-email] Firebase token verified — uid:', firebaseToken.uid);
        const verified = await isFirebaseEmailVerified(token);
        console.log('[verify-email] isFirebaseEmailVerified:', verified);
        if (verified) {
          // Sync the Firebase verification state into the DB profile
          console.log('[verify-email] Prisma query: db.user.update({ where: { id: "' + user.id + '" }, data: { emailVerified: true, verificationCode: null } })');
          await db.user.update({
            where: { id: user.id },
            data: { emailVerified: true, verificationCode: null },
          });
          return Response.json({ success: true, data: { verified: true } });
        }
        // Not verified in Firebase yet — client keeps polling via reload()
        return Response.json({ success: true, data: { verified: false } });
      }
      console.log('[verify-email] Firebase token verification returned null — falling through to legacy path');
    }

    // Legacy path (backward compatibility): code-based verification
    const { code } = payload ?? {};
    if (!code) return errorResponse('Verification code is required');

    console.log('[verify-email] Prisma query: db.user.findUnique({ where: { id: "' + user.id + '" }, select: { verificationCode: true } })');
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { verificationCode: true },
    });
    console.log('[verify-email] db.user.findUnique result: user found =', !!dbUser, '| hasStoredCode:', !!dbUser?.verificationCode);

    if (!dbUser?.verificationCode) {
      return errorResponse('No verification code found. Please request a new one.');
    }

    if (dbUser.verificationCode !== code) {
      console.log('[verify-email] Code mismatch — codesMatch: false (values intentionally not logged)');
      return errorResponse('Invalid verification code', 400);
    }

    console.log('[verify-email] Prisma query: db.user.update({ where: { id: "' + user.id + '" }, data: { emailVerified: true, verificationCode: null } })');
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationCode: null },
    });

    return Response.json({ success: true, data: { verified: true } });
  } catch (err) {
    console.error('[verify-email] EXCEPTION:', err);
    if (err instanceof Error) console.error('[verify-email] STACK TRACE:\n', err.stack);
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('[verify-email] PRISMA ERROR CODE:', err.code);
    }

    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(message, 500);
  }
}
