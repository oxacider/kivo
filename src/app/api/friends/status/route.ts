import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return errorResponse('userId is required');

    // Check friendship
    const friendship = await db.friendship.findFirst({
      where: {
        OR: [
          { senderId: user.id, receiverId: userId },
          { senderId: userId, receiverId: user.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check block
    const block = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: userId },
          { blockerId: userId, blockedId: user.id },
        ],
      },
    });

    let status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked' | 'blocked_by' = 'none';
    if (block) {
      status = block.blockerId === user.id ? 'blocked' : 'blocked_by';
    } else if (friendship) {
      if (friendship.status === 'accepted') status = 'accepted';
      else if (friendship.status === 'pending') {
        status = friendship.senderId === user.id ? 'pending_sent' : 'pending_received';
      }
    }

    // Get mutual count
    const myFriendships = await db.friendship.findMany({
      where: { AND: [{ status: 'accepted' }, { OR: [{ senderId: user.id }, { receiverId: user.id }] }] },
      select: { senderId: true, receiverId: true },
    });
    const myFriendIds = new Set(myFriendships.map((f) => (f.senderId === user.id ? f.receiverId : f.senderId)));

    const theirFriendships = await db.friendship.findMany({
      where: { AND: [{ status: 'accepted' }, { OR: [{ senderId: userId }, { receiverId: userId }] }] },
      select: { senderId: true, receiverId: true },
    });
    const theirFriendIds = new Set(theirFriendships.map((f) => (f.senderId === userId ? f.receiverId : f.senderId)));

    const mutualCount = [...myFriendIds].filter((fid) => theirFriendIds.has(fid)).length;

    return Response.json({ success: true, data: { status, mutualCount, requestId: friendship?.id || null } });
  } catch {
    return errorResponse('Failed to fetch friend status', 500);
  }
}
