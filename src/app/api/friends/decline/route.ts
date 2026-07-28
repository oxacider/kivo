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

    await db.friendship.update({ where: { id: requestId }, data: { status: 'declined' } });

    return Response.json({ success: true });
  } catch {
    return errorResponse('Failed to decline request', 500);
  }
}
