import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import archiver from "archiver";
import { storage } from "./storage";
import type { Photo, Project, Area, Export } from "@shared/schema";
import { EXPORT_STATUS, EXPORT_TYPES, buildPhotoExportName, sanitizeForFilename } from "@shared/schema";
import { ObjectStorageService } from "./replit_integrations/object_storage";
import { getAnnotatedExportBuffer, hasDrawableAnnotations } from "./lib/annotation-renderer";

const objectStorageService = new ObjectStorageService();

// ============================================================================
// MEMORY LOGGING UTILITY
// ============================================================================

function logMemory(exportId: number | string, step: string): void {
  const mem = process.memoryUsage();
  const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  console.log(
    `[MEMORY] Export ${exportId} | ${step} | ` +
    `RSS: ${formatMB(mem.rss)}MB | ` +
    `HeapUsed: ${formatMB(mem.heapUsed)}MB | ` +
    `HeapTotal: ${formatMB(mem.heapTotal)}MB | ` +
    `External: ${formatMB(mem.external)}MB`
  );
}

// ============================================================================
// TEMP DIRECTORY HELPERS
// ============================================================================

const TEMP_BASE = "/tmp/fieldscope/exports";

function getTempDir(exportId: number | string): string {
  return path.join(TEMP_BASE, String(exportId));
}

async function ensureTempDir(exportId: number | string): Promise<string> {
  const dir = getTempDir(exportId);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

async function cleanupTempDir(exportId: number | string): Promise<void> {
  const dir = getTempDir(exportId);
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
    console.log(`[CLEANUP] Deleted temp dir: ${dir}`);
  } catch (err) {
    console.error(`[CLEANUP] Failed to delete temp dir ${dir}:`, err);
  }
}

// Cleanup old export dirs (older than 24 hours)
export async function cleanupOldExportDirs(): Promise<void> {
  try {
    if (!fs.existsSync(TEMP_BASE)) return;
    
    const dirs = await fs.promises.readdir(TEMP_BASE);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const dir of dirs) {
      const fullPath = path.join(TEMP_BASE, dir);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (now - stat.mtimeMs > maxAge) {
          await fs.promises.rm(fullPath, { recursive: true, force: true });
          console.log(`[CLEANUP] Removed old export dir: ${fullPath}`);
        }
      } catch {
        // Ignore errors for individual dirs
      }
    }
  } catch (err) {
    console.error("[CLEANUP] Error cleaning old export dirs:", err);
  }
}

// ============================================================================
// STREAMING FILE DOWNLOAD TO DISK
// ============================================================================

async function downloadToDisk(url: string, destPath: string): Promise<void> {
  // Ensure parent directory exists
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

  if (url.startsWith("data:")) {
    // Handle base64 data URLs - decode and write to disk
    const base64Data = url.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    await fs.promises.writeFile(destPath, buffer);
    return;
  }

  if (url.startsWith("/objects/")) {
    // Stream from object storage to disk
    const objectPath = url.replace("/objects/", "");
    await objectStorageService.downloadToFile(objectPath, destPath);
    return;
  }

  if (url.startsWith("http")) {
    // Stream from HTTP to disk
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    if (!response.body) {
      throw new Error(`No response body for ${url}`);
    }
    
    const fileStream = fs.createWriteStream(destPath);
    const reader = response.body.getReader();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(value);
      }
      fileStream.end();
      await new Promise<void>((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });
    } finally {
      reader.releaseLock();
    }
    return;
  }

  throw new Error(`Unsupported URL format: ${url}`);
}

/**
 * Fetch image buffer from URL (object storage, HTTP, or data URL)
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const base64Data = url.split(",")[1];
    return Buffer.from(base64Data, "base64");
  }

  if (url.startsWith("/objects/")) {
    const objectPath = url.replace("/objects/", "");
    const buffer = await objectStorageService.downloadBuffer(objectPath);
    if (!buffer) {
      throw new Error(`Failed to download from object storage: ${objectPath}`);
    }
    return buffer;
  }

  if (url.startsWith("http")) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error(`Unsupported URL format: ${url}`);
}

// ============================================================================
// ANNOTATION TYPES AND HELPERS
// ============================================================================

export interface ExportOptions {
  projectId: number;
  includeAnnotations: boolean;
  organizeByArea: boolean;
  areaIds?: number[];
  photoIds?: number[];
  createdBy?: string;
}

export interface AnnotationItem {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  value?: string;
  unit?: string;
  color?: string;
  fontSize?: number;
  points?: number[];
}

export interface AnnotationData {
  lines?: AnnotationItem[];
  rects?: AnnotationItem[];
  texts?: AnnotationItem[];
  arrows?: AnnotationItem[];
  dimensions?: AnnotationItem[];
  shapes?: AnnotationItem[];
  stageWidth?: number;
  stageHeight?: number;
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
}

export function sanitizeFilename(input: string, maxLength: number = 100): string {
  return input
    .replace(/[^a-zA-Z0-9_\-.\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .substring(0, maxLength);
}

/**
 * Compute per-location-type sequence numbers for a set of photos.
 * Returns a map of photo.id -> sequence number within its location type.
 * For example: INT_001, INT_002, EXT_001, VEH_001, etc.
 */
export function computeSeqMapPerLoc(photos: Array<{ id: number; interiorExterior?: string | null }>): Map<number, number> {
  const seqMap = new Map<number, number>();
  const counters: Record<string, number> = {};
  
  for (const photo of photos) {
    const locType = (photo.interiorExterior || "unknown").toLowerCase();
    counters[locType] = (counters[locType] || 0) + 1;
    seqMap.set(photo.id, counters[locType]);
  }
  
  return seqMap;
}

export function generateExportFilename(
  photo: Photo,
  project: Project,
  area: Area,
  seq: number
): string {
  return buildPhotoExportName({
    locationType: photo.interiorExterior,
    seq,
    clientName: project.clientName,
    siteName: project.siteName,
    areaName: area.name,
  });
}

export function ensureUniqueFilename(filename: string, existingNames: Set<string>): string {
  if (!existingNames.has(filename)) {
    existingNames.add(filename);
    return filename;
  }
  
  const ext = filename.lastIndexOf(".");
  const base = ext > 0 ? filename.substring(0, ext) : filename;
  const extPart = ext > 0 ? filename.substring(ext) : "";
  
  let counter = 2;
  let uniqueName = `${base}_${String(counter).padStart(2, "0")}${extPart}`;
  while (existingNames.has(uniqueName)) {
    counter++;
    uniqueName = `${base}_${String(counter).padStart(2, "0")}${extPart}`;
  }
  
  existingNames.add(uniqueName);
  return uniqueName;
}

// ============================================================================
// STREAMING ZIP GENERATION (NO MEMORY BUFFERING)
// ============================================================================

interface PhotoWithArea extends Photo {
  area: Area;
}

async function generateStreamingZip(
  exportId: number,
  tempDir: string,
  photos: PhotoWithArea[],
  project: Project,
  includeAnnotations: boolean,
  organizeByArea: boolean,
  onProgress?: (current: number, total: number) => void
): Promise<{ zipPath: string; photoCount: number; manifestCsv: string }> {
  
  const zipPath = path.join(tempDir, "export.zip");
  const imagesDir = path.join(tempDir, "images");
  await fs.promises.mkdir(imagesDir, { recursive: true });

  logMemory(exportId, "start_download_images");

  // Compute per-location-type sequence numbers for consistent naming
  const seqMap = computeSeqMapPerLoc(photos);

  const existingNames = new Set<string>();
  const manifestRows: string[][] = [];
  manifestRows.push([
    "Original Filename",
    "Exported Filename",
    "Area",
    "Project",
    "Timestamp",
    "GPS Lat",
    "GPS Lng",
    "Location Type",
    "Illuminated",
    "Sided",
    "Surface Type",
    "Custom Tags"
  ]);

  // Track files to add to ZIP and render failures
  const filesToZip: Array<{ diskPath: string; zipPath: string }> = [];
  const renderFailures: Array<{ photoId: number; filename: string; error: string }> = [];

  // Process images to disk sequentially (cap peak memory)
  for (let i = 0; i < photos.length; i++) {
    const { area, ...photo } = photos[i];
    
    const seq = seqMap.get(photo.id) || (i + 1);
    let exportFilename = generateExportFilename(photo, project, area, seq);
    exportFilename = ensureUniqueFilename(exportFilename, existingNames);

    const folderPath = organizeByArea ? sanitizeFilename(area.name) : "";
    const zipEntryPath = folderPath ? `${folderPath}/${exportFilename}` : exportFilename;

    // Always use base image URL (prefer canonicalUrl over originalUrl)
    const sourceUrl: string | null = (photo as any).canonicalUrl || photo.originalUrl;

    if (sourceUrl) {
      const diskPath = path.join(imagesDir, exportFilename);
      try {
        // Fetch the base image buffer
        const imageBuffer = await fetchImageBuffer(sourceUrl);
        
        // If annotations are requested, render them using the unified pipeline
        if (includeAnnotations && hasDrawableAnnotations(photo.annotationData)) {
          try {
            const result = await getAnnotatedExportBuffer(imageBuffer, photo.annotationData, 1800);
            await fs.promises.writeFile(diskPath, result.buffer);
            filesToZip.push({ diskPath, zipPath: zipEntryPath });
          } catch (renderError) {
            // Track render failure - do NOT silently fall back
            const errorMsg = renderError instanceof Error ? renderError.message : String(renderError);
            console.error(`[ZIP Export] Annotation render failed for photo ${photo.id}:`, errorMsg);
            renderFailures.push({
              photoId: photo.id,
              filename: photo.filename,
              error: errorMsg,
            });
            // Still include the base image but note the failure
            await fs.promises.writeFile(diskPath, imageBuffer);
            filesToZip.push({ diskPath, zipPath: zipEntryPath });
          }
        } else {
          // No annotations or not including annotations - just write the base image
          await fs.promises.writeFile(diskPath, imageBuffer);
          filesToZip.push({ diskPath, zipPath: zipEntryPath });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to process image ${photo.id}:`, errorMsg);
      }
    }

    // Add to manifest - format sided value (null/empty/NA -> "N/A")
    const sidedValue = photo.singleDoubleSided;
    const formattedSided = (!sidedValue || sidedValue === "NA") ? "N/A" : sidedValue;
    
    manifestRows.push([
      photo.filename,
      exportFilename,
      area.name,
      `${project.clientName} - ${project.siteName}`,
      photo.timestamp ? new Date(photo.timestamp).toISOString() : "",
      photo.geoLat?.toString() || "",
      photo.geoLng?.toString() || "",
      photo.interiorExterior || "",
      photo.illuminated || "",
      formattedSided,
      (photo.wallTypeTags || []).join("; "),
      (photo.customTags || []).join("; ")
    ]);

    if (onProgress) {
      onProgress(i + 1, photos.length);
    }

    // Log memory every 10 photos
    if ((i + 1) % 10 === 0) {
      logMemory(exportId, `downloaded_${i + 1}_of_${photos.length}`);
    }
  }

  // If there were render failures, include a render_failures.json file in the ZIP
  if (renderFailures.length > 0) {
    const failuresPath = path.join(imagesDir, "render_failures.json");
    await fs.promises.writeFile(failuresPath, JSON.stringify(renderFailures, null, 2));
    filesToZip.push({ diskPath: failuresPath, zipPath: "render_failures.json" });
    console.warn(`[ZIP Export] ${renderFailures.length} photos had annotation render failures`);
  }

  logMemory(exportId, "start_zip_creation");

  // Create manifest CSV file
  const escapeCSV = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const manifestCsv = manifestRows.map(row => row.map(escapeCSV).join(",")).join("\n");
  const manifestPath = path.join(imagesDir, "manifest.csv");
  await fs.promises.writeFile(manifestPath, manifestCsv);
  filesToZip.push({ diskPath: manifestPath, zipPath: "manifest.csv" });

  // Create streaming ZIP archive with smaller internal buffer
  const output = fs.createWriteStream(zipPath, { highWaterMark: 64 * 1024 });
  const archive = archiver("zip", { 
    zlib: { level: 5 },
    highWaterMark: 64 * 1024 // Smaller internal buffer
  });

  const archivePromise = new Promise<void>((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);

  // Add files from disk (streaming, not buffering)
  for (const file of filesToZip) {
    archive.file(file.diskPath, { name: file.zipPath });
  }

  await archive.finalize();
  await archivePromise;

  // Hint garbage collection if available
  if (global.gc) {
    global.gc();
  }

  logMemory(exportId, "zip_complete");

  return { zipPath, photoCount: photos.length, manifestCsv };
}

// ============================================================================
// MAIN EXPORT FUNCTIONS
// ============================================================================

export async function startPhotoExport(options: ExportOptions): Promise<Export> {
  const exportType = options.includeAnnotations 
    ? EXPORT_TYPES.PHOTOS_ANNOTATED_ZIP 
    : EXPORT_TYPES.PHOTOS_CLEAN_ZIP;

  const exportRecord = await storage.createExport({
    projectId: options.projectId,
    type: exportType,
    status: EXPORT_STATUS.PENDING,
    includeAnnotations: options.includeAnnotations,
    organizeByArea: options.organizeByArea,
    createdBy: options.createdBy,
  });

  // Start background processing (don't await)
  processExportInBackground(exportRecord.id, options);

  return exportRecord;
}

async function processExportInBackground(exportId: number, options: ExportOptions): Promise<void> {
  const tempDir = await ensureTempDir(exportId);
  
  try {
    logMemory(exportId, "export_start");
    
    await storage.updateExport(exportId, { status: EXPORT_STATUS.GENERATING });

    const { projectId, includeAnnotations, organizeByArea, areaIds, photoIds } = options;

    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    let allAreas = await storage.getAreas(projectId);
    if (areaIds && areaIds.length > 0) {
      allAreas = allAreas.filter(a => areaIds.includes(a.id));
    }

    const allPhotosWithArea: PhotoWithArea[] = [];
    for (const area of allAreas) {
      let areaPhotos = await storage.getPhotos(area.id);
      if (photoIds && photoIds.length > 0) {
        areaPhotos = areaPhotos.filter(p => photoIds.includes(p.id));
      }
      for (const photo of areaPhotos) {
        allPhotosWithArea.push({ ...photo, area });
      }
    }

    logMemory(exportId, "loaded_photo_metadata");

    // Generate ZIP using streaming approach
    const { zipPath, photoCount } = await generateStreamingZip(
      exportId,
      tempDir,
      allPhotosWithArea,
      project,
      includeAnnotations,
      organizeByArea
    );

    logMemory(exportId, "start_upload");

    // Upload ZIP using signed URL streaming (zero memory buffering)
    const typeSuffix = includeAnnotations ? "annotated" : "clean";
    const zipFilename = `${sanitizeFilename(project.clientName)}_${sanitizeFilename(project.siteName)}_${typeSuffix}_${Date.now()}.zip`;
    
    const fileUrl = await objectStorageService.uploadExportArtifact(
      exportId,
      zipPath,
      zipFilename,
      "application/zip"
    );

    // Immediately unlink local file after upload to free disk and encourage GC
    try {
      await fs.promises.unlink(zipPath);
      console.log(`[EXPORT ${exportId}] Deleted local ZIP after upload`);
    } catch (unlinkErr) {
      console.warn(`[EXPORT ${exportId}] Failed to unlink ZIP:`, unlinkErr);
    }

    logMemory(exportId, "upload_complete");

    // Update export record with URL (not base64!)
    await storage.updateExport(exportId, {
      status: EXPORT_STATUS.READY,
      fileUrl,
      photoCount,
    });

    logMemory(exportId, "export_complete");

  } catch (err) {
    console.error(`[EXPORT ${exportId}] Export generation failed:`, err);
    await storage.updateExport(exportId, {
      status: EXPORT_STATUS.ERROR,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    // Always cleanup temp directory
    await cleanupTempDir(exportId);
    logMemory(exportId, "cleanup_complete");
  }
}

// ============================================================================
// IMAGE CANONICALIZATION (format standardization + EXIF normalization)
// ============================================================================

export interface CanonicalizeResult {
  canonicalUrl: string;
  canonicalFormat: "jpeg" | "png";
  canonicalWidth: number;
  canonicalHeight: number;
  originalFormat: string;
  originalExifOrientation: number;
}

async function detectIfTransparentOrGraphic(
  sharpInstance: any,
  metadata: any
): Promise<boolean> {
  if (metadata.hasAlpha) {
    try {
      const { data, info } = await sharpInstance
        .clone()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      const pixels = info.width * info.height;
      let transparentPixels = 0;
      
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          transparentPixels++;
        }
      }
      
      const transparencyRatio = transparentPixels / pixels;
      if (transparencyRatio > 0.01) {
        console.log(`[CANONICALIZE] Detected ${(transparencyRatio * 100).toFixed(1)}% transparency`);
        return true;
      }
    } catch (err) {
      console.error("[CANONICALIZE] Error detecting transparency:", err);
    }
  }
  
  try {
    const stats = await sharpInstance.clone().stats();
    const channels = stats.channels || [];
    
    let lowEntropy = true;
    for (const ch of channels) {
      const range = (ch.max || 0) - (ch.min || 0);
      if (range > 200 && (ch.stdev || 0) > 40) {
        lowEntropy = false;
        break;
      }
    }
    
    if (lowEntropy && channels.length > 0) {
      console.log("[CANONICALIZE] Detected screenshot/graphic (low color entropy)");
      return true;
    }
  } catch (err) {
    console.error("[CANONICALIZE] Error detecting screenshot:", err);
  }
  
  return false;
}

export async function canonicalizeImage(originalUrl: string): Promise<CanonicalizeResult | null> {
  if (!originalUrl.startsWith("/objects/")) {
    return null;
  }
  
  const tempId = `canon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempDir = await ensureTempDir(tempId);
  
  try {
    const sharp = (await import("sharp")).default;
    
    const lastSegment = originalUrl.split("/").pop() || "";
    const dotIndex = lastSegment.lastIndexOf(".");
    let ext = "bin";
    if (dotIndex > 0 && dotIndex < lastSegment.length - 1) {
      const possibleExt = lastSegment.slice(dotIndex + 1).toLowerCase();
      if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tiff", "tif", "bmp"].includes(possibleExt)) {
        ext = possibleExt;
      }
    }
    const inputPath = path.join(tempDir, `input.${ext}`);
    
    const objectPath = originalUrl.replace("/objects/", "");
    await objectStorageService.downloadToFile(objectPath, inputPath);
    
    const sharpInstance = sharp(inputPath);
    const metadata = await sharpInstance.metadata();
    
    const originalFormat = metadata.format || ext;
    const originalExifOrientation = metadata.orientation || 1;
    
    const isTransparentOrGraphic = await detectIfTransparentOrGraphic(sharpInstance, metadata);
    const outputFormat: "jpeg" | "png" = isTransparentOrGraphic ? "png" : "jpeg";
    
    const outputExt = outputFormat === "png" ? "png" : "jpg";
    const outputPath = path.join(tempDir, `output.${outputExt}`);
    
    let pipeline = sharp(inputPath).rotate();
    
    if (outputFormat === "jpeg") {
      pipeline = pipeline
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 88, mozjpeg: true });
    } else {
      pipeline = pipeline.png({ compressionLevel: 6 });
    }
    
    pipeline = pipeline.withMetadata({ orientation: undefined });
    
    const info = await pipeline.toFile(outputPath);
    
    const contentType = outputFormat === "png" ? "image/png" : "image/jpeg";
    const newFilename = `uploads/canonical-${Date.now()}-${Math.random().toString(36).slice(2)}.${outputExt}`;
    
    const canonicalUrl = await objectStorageService.uploadFromFile(
      outputPath,
      newFilename,
      contentType
    );
    
    console.log(`[CANONICALIZE] ${originalFormat} → ${outputFormat}, orientation ${originalExifOrientation} → 1, uploaded to ${canonicalUrl}`);
    
    return {
      canonicalUrl,
      canonicalFormat: outputFormat,
      canonicalWidth: info.width,
      canonicalHeight: info.height,
      originalFormat,
      originalExifOrientation,
    };
  } catch (err) {
    console.error("[CANONICALIZE] Error canonicalizing image:", err);
    return null;
  } finally {
    await cleanupTempDir(tempId);
  }
}

export async function normalizeExifOrientation(originalUrl: string): Promise<string> {
  const result = await canonicalizeImage(originalUrl);
  return result?.canonicalUrl || originalUrl;
}
