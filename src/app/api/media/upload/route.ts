import { getAuthUser, errorResponse } from '@/lib/auth';
import { db } from '@/lib/db';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorResponse('No file provided');

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return errorResponse('Only JPEG, PNG, GIF, and WebP images are allowed');
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return errorResponse('Image must be under 5MB');
    }
    if (file.size === 0) {
      return errorResponse('File is empty');
    }

    const width = formData.get('width') ? parseInt(String(formData.get('width')), 10) : null;
    const height = formData.get('height') ? parseInt(String(formData.get('height')), 10) : null;

    // Read file and convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const dataUrl = `data:${file.type};base64,${base64}`;

    // Create MediaAttachment record (not linked to message yet)
    const attachment = await db.mediaAttachment.create({
      data: {
        type: 'image',
        url: dataUrl,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        width,
        height,
      },
    });

    return Response.json({ success: true, data: attachment });
  } catch {
    return errorResponse('Failed to upload media', 500);
  }
}
