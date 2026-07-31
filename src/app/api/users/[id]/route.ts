import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, displayName: true, username: true, avatar: true, bio: true, status: true, online: true, lastSeen: true, createdAt: true },
    });
    if (!user) return errorResponse('User not found', 404);
    return Response.json({ success: true, data: user });
  } catch {
    return errorResponse('Failed to fetch user', 500);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) return errorResponse('Unauthorized', 401);
    const { id } = await params;
    if (authUser.id !== id) return errorResponse('Forbidden', 403);

    const body = await request.json();
    const allowed = ['displayName', 'bio', 'status', 'avatar', 'theme', 'username'];
    const data: Record<string, string> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key];
    }

    if (data.username) {
      if (!/^[a-z0-9_]{3,30}$/.test(data.username)) {
        return errorResponse('Username must be 3-30 characters, lowercase letters, numbers, and underscores only');
      }
      const existing = await db.user.findFirst({ where: { username: data.username, NOT: { id } } });
      if (existing) return errorResponse('Username already taken', 409);
    }

    const user = await db.user.update({ where: { id }, data });
    const { password: _, ...safeUser } = user;
    return Response.json({ success: true, data: safeUser });
  } catch {
    return errorResponse('Update failed', 500);
  }
}