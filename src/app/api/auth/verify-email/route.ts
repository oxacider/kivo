import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';
import { verifyFirebaseIdToken, isFirebaseEmailVerified } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    if (user.emailVerified) {
      return Response.json({ success: true, data: { verified: true } });
    }

    // Firebase path (primary): the verification status lives in Firebase,
    // so check it directly instead of relying on a legacy DB code.
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      const firebaseToken = await verifyFirebaseIdToken(token);
      if (firebaseToken) {
        const verified = await isFirebaseEmailVerified(token);
        if (verified) {
          // Sync the Firebase verification state into the DB profile
          await db.user.update({
            where: { id: user.id },
            data: { emailVerified: true, verificationCode: null },
          });
          return Response.json({ success: true, data: { verified: true } });
        }
        // Not verified in Firebase yet — client keeps polling via reload()
        return Response.json({ success: true, data: { verified: false } });
      }
    }

    // Legacy path (backward compatibility): code-based verification
    const { code } = await request.json();
    if (!code) return errorResponse('Verification code is required');

    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { verificationCode: true },
    });

    if (!dbUser?.verificationCode) {
      return errorResponse('No verification code found. Please request a new one.');
    }

    if (dbUser.verificationCode !== code) {
      return errorResponse('Invalid verification code', 400);
    }

    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationCode: null },
    });

    return Response.json({ success: true, data: { verified: true } });
  } catch {
    return errorResponse('Verification failed', 500);
  }
}
