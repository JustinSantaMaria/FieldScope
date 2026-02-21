import heic2any from 'heic2any';

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface CompressedImageResult {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  sizeBytes: number;
  orientationDegrees: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxDimension: 2000,
  quality: 0.8,
  mimeType: 'image/jpeg',
};

function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  console.log(`[HEIC] Starting conversion for ${file.name}, type: ${file.type}, size: ${file.size}`);
  
  try {
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    });
    
    const jpegBlob = Array.isArray(result) ? result[0] : result;
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    const jpegFile = new File([jpegBlob], newName, { type: 'image/jpeg' });
    
    console.log(`[HEIC] Conversion successful: ${jpegFile.name}, size: ${jpegFile.size}`);
    return jpegFile;
  } catch (error) {
    console.error('[HEIC] Conversion failed:', error);
    throw new Error(
      "This HEIC photo couldn't be converted on this device/browser. Try uploading as JPG or PNG instead."
    );
  }
}

export async function ensureCompatibleFormat(file: File): Promise<File> {
  if (isHeicFile(file)) {
    return await convertHeicToJpeg(file);
  }
  return file;
}

function getDebugInfo(): string {
  const ua = navigator.userAgent;
  let platform = 'unknown';
  if (/iPhone|iPad|iPod/.test(ua)) {
    platform = 'iOS';
  } else if (/Android/.test(ua)) {
    platform = 'Android';
  } else if (/Mac/.test(ua)) {
    platform = 'macOS';
  } else if (/Windows/.test(ua)) {
    platform = 'Windows';
  } else if (/Linux/.test(ua)) {
    platform = 'Linux';
  }
  
  let browser = 'unknown';
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    browser = 'Safari';
  } else if (/Chrome/.test(ua)) {
    browser = 'Chrome';
  } else if (/Firefox/.test(ua)) {
    browser = 'Firefox';
  }
  
  return `${browser}/${platform}`;
}

async function createNormalizedBitmap(file: File): Promise<ImageBitmap> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });
    console.log(`[ImageCompression] createImageBitmap with imageOrientation:'from-image' succeeded`);
    return bitmap;
  } catch (e) {
    console.log(`[ImageCompression] imageOrientation option not supported, falling back to default createImageBitmap`);
    return await createImageBitmap(file);
  }
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const debugInfo = getDebugInfo();
  
  console.log(`[ImageCompression] Starting compression on ${debugInfo}`);
  console.log(`[ImageCompression] Original file: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);

  const bitmap = await createNormalizedBitmap(file);
  
  console.log(`[ImageCompression] Decoded bitmap dimensions: ${bitmap.width}x${bitmap.height}`);

  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;

  let targetWidth = bitmap.width;
  let targetHeight = bitmap.height;

  if (bitmap.width > opts.maxDimension || bitmap.height > opts.maxDimension) {
    const ratio = Math.min(
      opts.maxDimension / bitmap.width,
      opts.maxDimension / bitmap.height
    );
    targetWidth = Math.round(bitmap.width * ratio);
    targetHeight = Math.round(bitmap.height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  
  console.log(`[ImageCompression] Canvas dimensions: ${canvas.width}x${canvas.height}`);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to create blob'));
      },
      opts.mimeType,
      opts.quality
    );
  });

  console.log(`[ImageCompression] Output blob: type=${blob.type}, size=${blob.size} bytes`);
  
  const verifyBitmap = await createImageBitmap(blob);
  console.log(`[ImageCompression] Verification re-decode: ${verifyBitmap.width}x${verifyBitmap.height}`);
  console.log(`[ImageCompression] DB record will save: width=${targetWidth}, height=${targetHeight}, orientationDegrees=0`);

  return {
    blob,
    width: targetWidth,
    height: targetHeight,
    originalWidth,
    originalHeight,
    sizeBytes: blob.size,
    orientationDegrees: 0,
  };
}

export async function compressImageIfNeeded(
  file: File,
  maxSizeBytes: number = 15 * 1024 * 1024,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> {
  const result = await compressImage(file, options);

  if (result.sizeBytes > maxSizeBytes) {
    let quality = (options.quality || DEFAULT_OPTIONS.quality) - 0.1;
    let attempt = result;

    while (attempt.sizeBytes > maxSizeBytes && quality > 0.3) {
      attempt = await compressImage(file, { ...options, quality });
      quality -= 0.1;
    }

    return attempt;
  }

  return result;
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const validTypes = [
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'image/gif', 'image/bmp', 'image/tiff'
  ];
  const validExtensions = /\.(jpg|jpeg|png|webp|heic|heif|gif|bmp|tiff|tif)$/i;
  
  const typeMatches = validTypes.includes(file.type.toLowerCase());
  const extMatches = validExtensions.test(file.name.toLowerCase());
  
  if (!typeMatches && !extMatches) {
    return { 
      valid: false, 
      error: `Unsupported image type: ${file.type || 'unknown'}. Please upload JPG, PNG, HEIC, WebP, GIF, BMP, or TIFF.` 
    };
  }

  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: `File too large: ${Math.round(file.size / 1024 / 1024)}MB (max 50MB)` };
  }

  return { valid: true };
}

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_BATCH_SIZE = 50;

export async function correctImageOrientation(file: File): Promise<File> {
  const debugInfo = getDebugInfo();
  console.log(`[correctImageOrientation] Starting on ${debugInfo}, file: ${file.name}`);
  
  const bitmap = await createNormalizedBitmap(file);
  
  console.log(`[correctImageOrientation] Bitmap dimensions: ${bitmap.width}x${bitmap.height}`);
  
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.log(`[correctImageOrientation] Failed to get canvas context, returning original file`);
    return file;
  }
  
  ctx.drawImage(bitmap, 0, 0);
  
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to create blob'));
      },
      'image/jpeg',
      0.92
    );
  });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `photo_${timestamp}.jpg`;
  
  console.log(`[correctImageOrientation] Output: ${filename}, size: ${blob.size} bytes`);
  
  return new File([blob], filename, { type: 'image/jpeg' });
}
