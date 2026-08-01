import { getAuthUser, errorResponse } from '@/lib/auth';
import { searchProfiles } from '@/lib/profiles-service';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim();
    if (!q) return errorResponse('Search query is required');

    const users = await searchProfiles(q, user.id);
    return Response.json({ success: true, data: users });
  } catch {
    return errorResponse('Search failed', 500);
  }
}