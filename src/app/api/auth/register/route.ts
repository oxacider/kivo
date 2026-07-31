import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import { generateToken, errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password, displayName, username } = await request.json();

    if (!email || !password || !displayName || !username) {
      return errorResponse('All fields are required');
    }

    if (password.length < 6) {
      return errorResponse('Password must be at least 6 characters');
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return errorResponse('Username must be 3-30 characters, lowercase letters, numbers, and underscores only');
    }

    const existing = await db.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      return errorResponse(existing.email === email ? 'Email already taken' : 'Username already taken', 409);
    }

    const hashedPassword = await hash(password, 12);
    const user = await db.user.create({
      data: { email, password: hashedPassword, displayName, username },
    });

    const token = await generateToken(user.id);
    const { password: _, ...safeUser } = user;

    return Response.json({ success: true, data: { user: safeUser, token } }, { status: 201 });
  } catch (err) {
    console.error('Register error:', err);
    return errorResponse('Registration failed', 500);
  }
}
