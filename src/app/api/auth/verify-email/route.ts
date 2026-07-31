import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    if (user.emailVerified) {
      return Response.json({ success: true, data: { verified: true } });
    }

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
