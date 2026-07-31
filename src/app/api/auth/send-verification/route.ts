import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    if (user.emailVerified) {
      return Response.json({ success: true, data: { alreadyVerified: true } });
    }

    const code = generateCode();
    await db.user.update({
      where: { id: user.id },
      data: { verificationCode: code },
    });

    // In production, send code via email service here.
    // For development, return the code so the user can test the flow.
    const isDev = process.env.NODE_ENV !== 'production';

    return Response.json({
      success: true,
      data: {
        message: isDev ? `Verification code: ${code}` : 'Verification email sent',
        code: isDev ? code : undefined,
      },
    });
  } catch {
    return errorResponse('Failed to send verification', 500);
  }
}
