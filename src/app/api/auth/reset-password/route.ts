import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import { errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, code, newPassword } = await request.json();
    if (!email || !code || !newPassword) return errorResponse('All fields are required');
    if (newPassword.length < 6) return errorResponse('Password must be at least 6 characters');
    if (!/^\d{6}$/.test(code)) return errorResponse('Invalid reset code format');

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, tokenVersion: true, resetCode: true, resetCodeExpires: true },
    });
    if (!user) return errorResponse('Invalid email or code', 404);

    if (!user.resetCode) return errorResponse('No reset code found. Please request a new one.');
    if (user.resetCode !== code) return errorResponse('Invalid reset code', 400);

    if (user.resetCodeExpires && new Date() > user.resetCodeExpires) {
      return errorResponse('Reset code has expired. Please request a new one.');
    }

    const hashedPassword = await hash(newPassword, 12);
    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        tokenVersion: (user.tokenVersion ?? 0) + 1,
        resetCode: null,
        resetCodeExpires: null,
      },
    });

    return Response.json({ success: true, message: 'Password reset successfully' });
  } catch {
    return errorResponse('Failed to reset password', 500);
  }
}
