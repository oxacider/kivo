import { getAuthUser, errorResponse } from '@/lib/auth';
import { uploadChatImage, MediaUploadError, type CloudinaryUploadResult } from '@/lib/media-service';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return errorResponse('No file provided');

    // Validation and upload delegated to media-service
    const result: CloudinaryUploadResult = await uploadChatImage(file);

    return Response.json({
      success: true,
      data: {
        id: result.publicId,
        url: result.url,
        type: 'image',
        publicId: result.publicId,
        name: file.name,
        size: result.bytes,
        mimeType: file.type,
        width: result.width,
        height: result.height,
      },
    });
  } catch (err) {
    if (err instanceof MediaUploadError) {
      return errorResponse(err.message);
    }
    return errorResponse('Failed to upload media', 500);
  }
}
