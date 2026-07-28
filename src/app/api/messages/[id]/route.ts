import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);
    const { id } = await params;

    const message = await db.message.findUnique({ where: { id } });
    if (!message) return errorResponse('Message not found', 404);
    if (message.senderId !== user.id) return errorResponse('Forbidden', 403);

    const updated = await db.message.update({
      where: { id },
      data: { deleted: true, content: 'This message was deleted' },
    });

    return Response.json({ success: true, data: updated });
  } catch {
    return errorResponse('Failed to delete message', 500);
  }
}