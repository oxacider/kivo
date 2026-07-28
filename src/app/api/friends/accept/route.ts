import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const { requestId } = await request.json();
    if (!requestId) return errorResponse('requestId is required');

    const friendship = await db.friendship.findUnique({ where: { id: requestId } });
    if (!friendship) return errorResponse('Request not found', 404);
    if (friendship.receiverId !== user.id) return errorResponse('Forbidden', 403);
    if (friendship.status !== 'pending') return errorResponse('Request not pending', 409);

    const updated = await db.friendship.update({
      where: { id: requestId },
      data: { status: 'accepted' },
    });

    const [id1, id2] = [friendship.senderId, friendship.receiverId].sort();
    const existing = await db.conversation.findFirst({
      where: { user1Id: id1, user2Id: id2 },
    });
    if (!existing) {
      await db.conversation.create({
        data: { user1Id: id1, user2Id: id2 },
      });
    }

    return Response.json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    return errorResponse('Failed to accept request', 500);
  }
}