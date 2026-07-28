import { getAuthUser, errorResponse } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);
    const { password: _, ...safeUser } = user as any;
    return Response.json({ success: true, data: safeUser });
  } catch {
    return errorResponse('Failed to fetch user', 500);
  }
}
