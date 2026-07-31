import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

const PAGE_SIZE = 30;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);
    const { id } = await params;

    const conversation = await db.conversation.findUnique({ where: { id } });
    if (!conversation) return errorResponse('Conversation not found', 404);
    if (conversation.user1Id !== user.id && conversation.user2Id !== user.id) {
      return errorResponse('Forbidden', 403);
    }

    const url = new URL(request.url);
    const before = url.searchParams.get('before');

    const where: any = { conversationId: id, deleted: false };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    // Fetch PAGE_SIZE + 1 in DESC order to get the latest/most-recent messages
    const fetched = await db.message.findMany({
      where,
      include: {
        sender: { select: { id: true, displayName: true, username: true, avatar: true } },
        replyTo: { select: { id: true, content: true, senderId: true, sender: { select: { displayName: true } } } },
        reactions: {
          include: {
            user: { select: { id: true, displayName: true, avatar: true } },
          },
        },
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
    });

    const hasMore = fetched.length > PAGE_SIZE;
    const sliced = hasMore ? fetched.slice(0, PAGE_SIZE) : fetched;
    // Reverse to ascending order for display
    const messages = sliced.reverse();

    // Auto-deliver messages on fetch
    await db.message.updateMany({
      where: { conversationId: id, senderId: { not: user.id }, status: 'sent', deleted: false },
      data: { status: 'delivered' },
    });

    return Response.json({ success: true, data: { messages, hasMore } });
  } catch (err) {
    console.error(err);
    return errorResponse('Failed to fetch messages', 500);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);
    const { id } = await params;

    const { messageId, content } = await request.json();
    if (!messageId || !content) return errorResponse('messageId and content required');

    const message = await db.message.findUnique({ where: { id: messageId } });
    if (!message) return errorResponse('Message not found', 404);
    if (message.senderId !== user.id) return errorResponse('Forbidden', 403);
    if (message.deleted) return errorResponse('Cannot edit deleted message');

    const updated = await db.message.update({
      where: { id: messageId },
      data: { content, edited: true },
      include: {
        sender: { select: { id: true, displayName: true, username: true, avatar: true } },
      },
    });

    return Response.json({ success: true, data: updated });
  } catch {
    return errorResponse('Failed to edit message', 500);
  }
}
