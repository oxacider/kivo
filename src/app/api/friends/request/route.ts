import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const { receiverId } = await request.json();
    if (!receiverId) return errorResponse('receiverId is required');
    if (receiverId === user.id) return errorResponse('Cannot send request to yourself');

    const target = await db.user.findUnique({ where: { id: receiverId } });
    if (!target) return errorResponse('User not found', 404);

    const existing = await db.friendship.findFirst({
      where: {
        OR: [
          { senderId: user.id, receiverId },
          { senderId: receiverId, receiverId: user.id },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'accepted') return errorResponse('Already friends', 409);
      if (existing.status === 'pending') return errorResponse('Request already pending', 409);
      if (existing.status === 'declined') {
        await db.friendship.delete({ where: { id: existing.id } });
      }
    }

    const blocked = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: receiverId },
          { blockerId: receiverId, blockedId: user.id },
        ],
      },
    });
    if (blocked) return errorResponse('Cannot send request', 403);

    const friendship = await db.friendship.create({
      data: { senderId: user.id, receiverId },
      include: { sender: true, receiver: true },
    });

    return Response.json({ success: true, data: friendship }, { status: 201 });
  } catch (err) {
    console.error(err);
    return errorResponse('Failed to send request', 500);
  }
}
