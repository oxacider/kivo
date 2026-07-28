import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const { userId } = await request.json();
    if (!userId) return errorResponse('userId is required');
    if (userId === user.id) return errorResponse('Cannot block yourself');

    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) return errorResponse('User not found', 404);

    const existing = await db.block.findFirst({
      where: { blockerId: user.id, blockedId: userId },
    });
    if (existing) return errorResponse('Already blocked', 409);

    await db.block.create({ data: { blockerId: user.id, blockedId: userId } });

    // Also remove friendship if exists
    await db.friendship.deleteMany({
      where: {
        OR: [
          { senderId: user.id, receiverId: userId },
          { senderId: userId, receiverId: user.id },
        ],
      },
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error(err);
    return errorResponse('Failed to block user', 500);
  }
}
