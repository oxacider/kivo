/**
 * Cloudinary image URL optimization helper.
 *
 * Generates responsive, optimized image URLs with:
 *   - Automatic format selection (WebP when supported)
 *   - Quality optimization
 *   - Responsive width based on container size
 *   - No visual quality loss
 *
 * Usage:
 *   optimizedCloudinaryUrl(url, { w: 200 })  // avatar thumbnail
 *   optimizedCloudinaryUrl(url, { w: 600 })  // chat image
 *   optimizedCloudinaryUrl(url)              // default (auto format, auto quality)
 */

const CLOUDINARY_BASE = 'res.cloudinary.com';

export interface CloudinaryUrlOptions {
  /** Target width in pixels */
  w?: number;
  /** Target height in pixels (maintains aspect ratio if omitted) */
  h?: number;
  /** Crop mode: 'fill', 'fit', 'thumb' */
  c?: 'fill' | 'fit' | 'thumb';
}

/**
 * Returns an optimized Cloudinary URL with transformations.
 * If the URL is not a Cloudinary URL, returns it unchanged.
 */
export function optimizedCloudinaryUrl(
  url: string | undefined | null,
  options: CloudinaryUrlOptions = {}
): string | undefined {
  if (!url) return undefined;
  if (!url.includes(CLOUDINARY_BASE)) return url;

  const { w, h, c } = options;

  // Build transformation segments
  const transforms: string[] = [];

  // Auto format + quality (always applied for Cloudinary URLs)
  transforms.push('f_auto');
  transforms.push('q_auto:good');

  // Responsive width
  if (w) transforms.push(`w_${w}`);
  if (h) transforms.push(`h_${h}`);
  if (c) transforms.push(`c_${c}`);

  if (transforms.length === 0) return url;

  const tx = transforms.join(',');

  // Insert transformation after /upload/
  return url.replace('/upload/', `/upload/${tx}/`);
}
