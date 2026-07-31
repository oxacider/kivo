import { db } from '@/lib/db';
import { errorResponse } from '@/lib/auth';

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) return errorResponse('Email is required');

    const user = await db.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (user) {
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await db.user.update({
        where: { id: user.id },
        data: { resetCode: code, resetCodeExpires: expiresAt },
      });

      // In production, send code via email service here.
      const isDev = process.env.NODE_ENV !== 'production';
      return Response.json({
        success: true,
        data: {
          message: isDev
            ? `Password reset code: ${code}`
            : 'If an account exists, a reset code has been sent to your email',
          code: isDev ? code : undefined,
        },
      });
    }

    return Response.json({
      success: true,
      data: { message: 'If an account exists, a reset code has been sent to your email' },
    });
  } catch {
    return errorResponse('Failed to process request', 500);
  }
}
