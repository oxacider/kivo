import { getAuthUser, errorResponse } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const body = await request.json();
    const allowed = ['showOnline', 'showLastSeen', 'showReadReceipts'];
    const data: Record<string, boolean> = {};
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') data[key] = body[key];
    }
    if (Object.keys(data).length === 0) return errorResponse('No valid fields to update');

    const updated = await db.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        showOnline: true,
        showLastSeen: true,
        showReadReceipts: true,
      },
    });

    return Response.json({ success: true, data: updated });
  } catch {
    return errorResponse('Failed to update privacy settings', 500);
  }
}
