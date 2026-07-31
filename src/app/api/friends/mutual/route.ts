import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const url = new URL(request.url);
    const id = url.searchParams.get('userId');
    if (!id) return errorResponse('userId is required');

    // Get current user's friend IDs
    const myFriendships = await db.friendship.findMany({
      where: {
        AND: [{ status: 'accepted' }, { OR: [{ senderId: user.id }, { receiverId: user.id }] }],
      },
      select: { senderId: true, receiverId: true },
    });
    const myFriendIds = new Set(
      myFriendships.map((f) => (f.senderId === user.id ? f.receiverId : f.senderId))
    );

    // Get target user's friend IDs
    const theirFriendships = await db.friendship.findMany({
      where: {
        AND: [{ status: 'accepted' }, { OR: [{ senderId: id }, { receiverId: id }] }],
      },
      select: { senderId: true, receiverId: true },
    });
    const theirFriendIds = new Set(
      theirFriendships.map((f) => (f.senderId === id ? f.receiverId : f.senderId))
    );

    // Find mutual IDs
    const mutualIds = [...myFriendIds].filter((fid) => theirFriendIds.has(fid));

    if (mutualIds.length === 0) {
      return Response.json({ success: true, data: { count: 0, friends: [] } });
    }

    const mutualFriends = await db.user.findMany({
      where: { id: { in: mutualIds } },
      select: { id: true, displayName: true, username: true, avatar: true, online: true },
    });

    return Response.json({ success: true, data: { count: mutualFriends.length, friends: mutualFriends } });
  } catch {
    return errorResponse('Failed to fetch mutual friends', 500);
  }
}
