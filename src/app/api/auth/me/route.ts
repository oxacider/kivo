import { getAuthUser, errorResponse } from '@/lib/auth';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';
import { ensureFirestoreUserMapping } from '@/lib/firestore-admin';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    // Phase 2: keep users/{firebaseUid} → { kivoId } in sync so Firestore
    // security rules can resolve the participant mapping on every session.
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const fb = await verifyFirebaseIdToken(token);
      if (fb) {
        await ensureFirestoreUserMapping(fb.uid, user.id);
      }
    }

    const { password: _, ...safeUser } = user as any;
    return Response.json({ success: true, data: safeUser });
  } catch {
    return errorResponse('Failed to fetch user', 500);
  }
}
