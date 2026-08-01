import { getAuthUser, errorResponse } from '@/lib/auth';
import { storeAvatar } from '@/lib/profiles-service';
import { uploadAvatar, MediaUploadError } from '@/lib/media-service';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;
    if (!file) return errorResponse('No file provided');

    // Validation and upload delegated to media-service
    const result = await uploadAvatar(file);
    const avatar = await storeAvatar(user.id, result.url);

    return Response.json({ success: true, data: { avatar } });
  } catch (err) {
    if (err instanceof MediaUploadError) {
      return errorResponse(err.message);
    }
    return errorResponse('Failed to upload avatar', 500);
  }
}
