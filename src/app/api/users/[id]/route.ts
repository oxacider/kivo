import { getAuthUser, errorResponse } from '@/lib/auth';
import { getProfile, updateProfile, ProfileValidationError, ProfileConflictError } from '@/lib/profiles-service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getProfile(id);
    if (!user) return errorResponse('User not found', 404);
    return Response.json({ success: true, data: user });
  } catch {
    return errorResponse('Failed to fetch user', 500);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) return errorResponse('Unauthorized', 401);
    const { id } = await params;
    if (authUser.id !== id) return errorResponse('Forbidden', 403);

    const body = await request.json();
    const user = await updateProfile(id, body);
    return Response.json({ success: true, data: user });
  } catch (err) {
    if (err instanceof ProfileConflictError) return errorResponse(err.message, 409);
    if (err instanceof ProfileValidationError) return errorResponse(err.message);
    return errorResponse('Update failed', 500);
  }
}