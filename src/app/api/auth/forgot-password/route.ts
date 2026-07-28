import { db } from '@/lib/db';
import { errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) return errorResponse('Email is required');

    const user = await db.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    return Response.json({ success: true, message: 'If an account exists, a reset code has been generated' });
  } catch {
    return errorResponse('Failed to process request', 500);
  }
}
