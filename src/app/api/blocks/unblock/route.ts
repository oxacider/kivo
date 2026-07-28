import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const { userId } = await request.json();
    if (!userId) return errorResponse('userId is required');

    const result = await db.block.deleteMany({
      where: { blockerId: user.id, blockedId: userId },
    });

    if (result.count === 0) return errorResponse('Not blocked', 404);

    return Response.json({ success: true });
  } catch {
    return errorResponse('Failed to unblock user', 500);
  }
}
