/**
 * Server-side Cloudinary media service.
 *
 * NEVER import this file on the client — it uses FormData and the
 * Cloudinary upload API which requires the upload preset. Client code
 * sends files through /api/media/upload which calls this service.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface CloudinaryUploadResult {
  url: string; // secure_url
  publicId: string;
  resourceType: 'image' | 'video';
  width: number;
  height: number;
  bytes: number;
  format: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

function getCloudConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET)');
  }
  return { cloudName, uploadPreset };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Upload an image for chat messages (max 5MB, JPEG/PNG/GIF/WebP only).
 */
export async function uploadChatImage(file: File | null): Promise<CloudinaryUploadResult> {
  if (!file) throw new MediaUploadError('No file provided');
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new MediaUploadError('Only JPEG, PNG, GIF, and WebP images are allowed');
  }
  if (file.size > MAX_IMAGE_SIZE) throw new MediaUploadError('Image must be under 5MB');
  if (file.size === 0) throw new MediaUploadError('File is empty');

  return uploadToCloudinary(file);
}

/**
 * Upload a user avatar (max 2MB, any image type).
 */
export async function uploadAvatar(file: File | null): Promise<CloudinaryUploadResult> {
  if (!file) throw new MediaUploadError('No file provided');
  if (!file.type.startsWith('image/')) throw new MediaUploadError('File must be an image');
  if (file.size > MAX_AVATAR_SIZE) throw new MediaUploadError('Image must be under 2MB');

  return uploadToCloudinary(file);
}

/* ------------------------------------------------------------------ */
/*  Internal                                                          */
/* ------------------------------------------------------------------ */

async function uploadToCloudinary(file: File): Promise<CloudinaryUploadResult> {
  const { cloudName, uploadPreset } = getCloudConfig();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', 'kivo');

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData },
  );

  const json = await res.json();

  if (!res.ok || json.error) {
    throw new MediaUploadError(json.error?.message || `Cloudinary upload failed (HTTP ${res.status})`);
  }

  return {
    url: json.secure_url,
    publicId: json.public_id,
    resourceType: json.resource_type ?? 'image',
    width: json.width ?? 0,
    height: json.height ?? 0,
    bytes: json.bytes ?? file.size,
    format: json.format ?? '',
  };
}

/* ------------------------------------------------------------------ */
/*  Error class                                                       */
/* ------------------------------------------------------------------ */

export class MediaUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaUploadError';
  }
}
