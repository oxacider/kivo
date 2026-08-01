import { getAuthUser, errorResponse } from '@/lib/auth';
import { updatePrivacySettings, type PrivacyInput } from '@/lib/profiles-service';

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const body = await request.json();
    const data: Record<string, boolean> = {};
    for (const key of ['showOnline', 'showLastSeen', 'showReadReceipts']) {
      if (typeof body[key] === 'boolean') data[key] = body[key];
    }
    if (Object.keys(data).length === 0) return errorResponse('No valid fields to update');

    const updated = await updatePrivacySettings(user.id, data as PrivacyInput);
    return Response.json({ success: true, data: updated });
  } catch {
    return errorResponse('Failed to update privacy settings', 500);
  }
}
