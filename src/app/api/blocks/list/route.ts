import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const blocks = await db.block.findMany({
      where: { blockerId: user.id },
      include: {
        blocked: {
          select: { id: true, displayName: true, username: true, avatar: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = blocks.map((b) => b.blocked);
    return Response.json({ success: true, data });
  } catch {
    return errorResponse('Failed to fetch blocked users', 500);
  }
}
