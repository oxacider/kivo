import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import { errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, code, newPassword } = await request.json();
    if (!email || !code || !newPassword) return errorResponse('All fields are required');
    if (newPassword.length < 6) return errorResponse('Password must be at least 6 characters');

    // In production, verify code against a stored reset token.
    // For this demo, accept any 6-digit code and reset the password directly.
    if (!/^\d{6}$/.test(code)) return errorResponse('Invalid reset code');

    const user = await db.user.findUnique({ where: { email } });
    if (!user) return errorResponse('Invalid email or code', 404);

    const hashedPassword = await hash(newPassword, 12);
    await db.user.update({ where: { id: user.id }, data: { password: hashedPassword } });

    return Response.json({ success: true, message: 'Password reset successfully' });
  } catch {
    return errorResponse('Failed to reset password', 500);
  }
}
