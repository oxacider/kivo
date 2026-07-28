import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim();
    if (!q) return errorResponse('Search query is required');

    const users = await db.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } },
          {
            OR: [
              { displayName: { contains: q } },
              { username: { contains: q } },
            ],
          },
        ],
      },
      select: { id: true, displayName: true, username: true, avatar: true, bio: true, status: true, online: true, lastSeen: true },
      take: 20,
    });

    return Response.json({ success: true, data: users });
  } catch {
    return errorResponse('Search failed', 500);
  }
}