import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const conversations = await db.conversation.findMany({
      where: { OR: [{ user1Id: user.id }, { user2Id: user.id }] },
      include: {
        user1: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
        user2: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const data = await Promise.all(conversations.map(async (c) => {
      const otherUser = c.user1Id === user.id ? c.user2 : c.user1;
      const lastMessage = c.messages[0] || null;
      const unreadCount = await db.message.count({
        where: { conversationId: c.id, senderId: { not: user.id }, status: { not: 'read' }, deleted: false },
      });
      return {
        id: c.id, user1Id: c.user1Id, user2Id: c.user2Id,
        createdAt: c.createdAt, updatedAt: c.updatedAt,
        lastMessage, otherUser, unreadCount,
      };
    }));

    return Response.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return errorResponse('Failed to fetch conversations', 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const { userId } = await request.json();
    if (!userId) return errorResponse('userId is required');
    if (userId === user.id) return errorResponse('Cannot create conversation with yourself');

    const friendship = await db.friendship.findFirst({
      where: { status: 'accepted', OR: [{ senderId: user.id, receiverId: userId }, { senderId: userId, receiverId: user.id }] },
    });
    if (!friendship) return errorResponse('Not friends', 403);

    const [user1Id, user2Id] = user.id < userId ? [user.id, userId] : [userId, user.id];
    const conversation = await db.conversation.upsert({
      where: { user1Id_user2Id: { user1Id, user2Id } },
      create: { user1Id, user2Id },
      update: {},
      include: {
        user1: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
        user2: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
      },
    });

    const otherUser = conversation.user1Id === user.id ? conversation.user2 : conversation.user1;
    return Response.json({ success: true, data: { ...conversation, otherUser } }, { status: 201 });
  } catch (err) {
    console.error(err);
    return errorResponse('Failed to create conversation', 500);
  }
}
