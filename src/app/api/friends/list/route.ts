import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const friendships = await db.friendship.findMany({
      where: {
        AND: [
          { status: 'accepted' },
          { OR: [{ senderId: user.id }, { receiverId: user.id }] },
        ],
      },
      include: {
        sender: { select: { id: true, displayName: true, username: true, avatar: true, bio: true, status: true, online: true, lastSeen: true } },
        receiver: { select: { id: true, displayName: true, username: true, avatar: true, bio: true, status: true, online: true, lastSeen: true } },
      },
    });

    const friends = friendships.map((f) =>
      f.senderId === user.id ? f.receiver : f.sender
    );

    return Response.json({ success: true, data: friends });
  } catch {
    return errorResponse('Failed to fetch friends', 500);
  }
}