import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);
    const { id } = await params;

    const conv = await db.conversation.findUnique({ where: { id } });
    if (!conv) return errorResponse('Conversation not found', 404);
    if (conv.user1Id !== user.id && conv.user2Id !== user.id) {
      return errorResponse('Forbidden', 403);
    }

    await db.message.updateMany({
      where: { conversationId: id, senderId: { not: user.id }, status: { not: 'read' }, deleted: false },
      data: { status: 'read' },
    });

    return Response.json({ success: true });
  } catch {
    return errorResponse('Failed to mark read', 500);
  }
}