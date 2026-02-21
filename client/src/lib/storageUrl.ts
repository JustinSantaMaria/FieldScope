/**
 * Normalizes a storage URL for use in img src or fetch requests.
 * Handles various formats:
 * - /objects/... -> /api/storage/public/objects/...
 * - objects/... -> /api/storage/public/objects/...
 * - /api/storage/public/objects/... -> /api/storage/public/objects/...
 * - /api/storage/public//objects/... (double slash) -> /api/storage/public/objects/...
 */
export function normalizeStorageUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  // Remove double slashes (except in protocol)
  let normalized = url.replace(/([^:])\/\/+/g, '$1/');
  
  // If already has the full prefix, return normalized
  if (normalized.startsWith('/api/storage/public/')) {
    return normalized;
  }
  
  // Handle /objects/... format
  if (normalized.startsWith('/objects/')) {
    return `/api/storage/public${normalized}`;
  }
  
  // Handle objects/... format (no leading slash)
  if (normalized.startsWith('objects/')) {
    return `/api/storage/public/${normalized}`;
  }
  
  // Return as-is for external URLs or other formats
  return normalized;
}
