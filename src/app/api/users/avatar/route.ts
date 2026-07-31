import { getAuthUser, errorResponse } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;
    if (!file) return errorResponse('No file provided');
    if (!file.type.startsWith('image/')) return errorResponse('File must be an image');
    if (file.size > 2 * 1024 * 1024) return errorResponse('Image must be under 2MB');

    const bytes = await file.arrayBuffer();
    const base64 = `data:${file.type};base64,${btoa(String.fromCharCode(...new Uint8Array(bytes)))}`;

    await db.user.update({
      where: { id: user.id },
      data: { avatar: base64 },
    });

    return Response.json({ success: true, data: { avatar: base64 } });
  } catch {
    return errorResponse('Failed to upload avatar', 500);
  }
}
