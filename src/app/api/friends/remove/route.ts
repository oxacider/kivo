import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const { userId } = await request.json();
    if (!userId) return errorResponse('userId is required');

    await db.friendship.deleteMany({
      where: {
        OR: [
          { senderId: user.id, receiverId: userId },
          { senderId: userId, receiverId: user.id },
        ],
      },
    });

    return Response.json({ success: true });
  } catch {
    return errorResponse('Failed to remove friend', 500);
  }
}
