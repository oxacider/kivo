import { db } from '@/lib/db';
import { compare } from 'bcryptjs';
import { generateToken, errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return errorResponse('Email and password are required');
    }

    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true, email: true, password: true, displayName: true, username: true,
        avatar: true, bio: true, status: true, online: true,
        lastSeen: true, theme: true, emailVerified: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!user) {
      return errorResponse('Invalid credentials', 401);
    }

    const valid = await compare(password, user.password);
    if (!valid) {
      return errorResponse('Invalid credentials', 401);
    }

    await db.user.update({ where: { id: user.id }, data: { online: true, lastSeen: new Date() } });

    const token = await generateToken(user.id);
    const { password: _, ...safeUser } = user;

    return Response.json({ success: true, data: { user: safeUser, token } });
  } catch (err) {
    console.error('Login error:', err);
    return errorResponse('Login failed', 500);
  }
}
