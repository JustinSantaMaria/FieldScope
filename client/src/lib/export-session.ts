import { exportAnnotatedCanvas, type ExportMode } from "./konva-export";
import { apiRequest } from "./queryClient";
import type { AnnotationData } from "@/components/annotation-canvas";
import type { Photo } from "@shared/schema";
import { normalizeStorageUrl } from "./storageUrl";

export interface ExportSessionPhoto {
  photoId: number;
  filename: string;
}

export interface CreateSessionResponse {
  sessionId: number;
  baseName: string;
  photoCount: number;
  photos: ExportSessionPhoto[];
}

export interface ExportProgress {
  phase: "creating" | "rendering" | "uploading" | "generating" | "complete" | "error";
  totalPhotos: number;
  renderedClean: number;
  renderedAnnotated: number;
  uploadedClean: number;
  uploadedAnnotated: number;
  message: string;
  error?: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to convert blob to base64"));
    reader.readAsDataURL(blob);
  });
}

export async function runExportSession(
  projectId: number,
  photos: Photo[],
  onProgress: ProgressCallback
): Promise<{ sessionId: number; baseName: string }> {
  const progress: ExportProgress = {
    phase: "creating",
    totalPhotos: photos.length,
    renderedClean: 0,
    renderedAnnotated: 0,
    uploadedClean: 0,
    uploadedAnnotated: 0,
    message: "Creating export session...",
  };

  onProgress({ ...progress });

  const response = await apiRequest(
    "POST",
    `/api/projects/${projectId}/export-sessions`
  );
  const sessionResponse: CreateSessionResponse = await response.json();

  const { sessionId, baseName, photos: sessionPhotos } = sessionResponse;

  const photoLookup = new Map<number, ExportSessionPhoto>();
  for (const sp of sessionPhotos) {
    photoLookup.set(sp.photoId, sp);
  }

  progress.phase = "rendering";
  progress.message = "Rendering and uploading images...";
  onProgress({ ...progress });

  for (const photo of photos) {
    const sessionPhoto = photoLookup.get(photo.id);
    if (!sessionPhoto) {
      console.warn(`Photo ${photo.id} not found in session`);
      continue;
    }

    const annotations: AnnotationData = (photo.annotationData as AnnotationData) || {
      lines: [],
      rects: [],
      arrows: [],
      texts: [],
      dimensions: [],
    };

    const imageUrl = normalizeStorageUrl((photo as any).canonicalUrl || photo.originalUrl);
    try {
      const cleanBlob = await exportAnnotatedCanvas({
        imageUrl,
        annotations,
        mode: "clean",
        format: "png",
      });
      progress.renderedClean++;
      progress.message = `Rendered clean: ${progress.renderedClean}/${progress.totalPhotos}`;
      onProgress({ ...progress });

      const cleanBase64 = await blobToBase64(cleanBlob);
      await apiRequest("POST", `/api/export-sessions/${sessionId}/upload`, {
        photoId: photo.id,
        mode: "clean",
        imageData: cleanBase64,
      });
      progress.uploadedClean++;
      onProgress({ ...progress });

      const annotatedBlob = await exportAnnotatedCanvas({
        imageUrl,
        annotations,
        mode: "annotated",
        format: "png",
      });
      progress.renderedAnnotated++;
      progress.message = `Rendered annotated: ${progress.renderedAnnotated}/${progress.totalPhotos}`;
      onProgress({ ...progress });

      const annotatedBase64 = await blobToBase64(annotatedBlob);
      await apiRequest("POST", `/api/export-sessions/${sessionId}/upload`, {
        photoId: photo.id,
        mode: "annotated",
        imageData: annotatedBase64,
      });
      progress.uploadedAnnotated++;
      progress.message = `Uploaded: ${progress.uploadedClean} clean, ${progress.uploadedAnnotated} annotated of ${progress.totalPhotos}`;
      onProgress({ ...progress });

    } catch (err) {
      console.error(`Failed to export photo ${photo.id}:`, err);
      progress.phase = "error";
      progress.error = err instanceof Error ? err.message : "Export failed";
      progress.message = `Failed on photo ${photo.id}`;
      onProgress({ ...progress });
      throw err;
    }
  }

  progress.phase = "generating";
  progress.message = "Generating ZIP and PDF files...";
  onProgress({ ...progress });

  await apiRequest("POST", `/api/export-sessions/${sessionId}/generate`);

  progress.phase = "complete";
  progress.message = "Export complete!";
  onProgress({ ...progress });

  return { sessionId, baseName };
}

export async function pollSessionStatus(sessionId: number): Promise<{
  status: string;
  cleanZipUrl?: string;
  annotatedZipUrl?: string;
  pdfUrl?: string;
  csvUrl?: string;
  errorMessage?: string;
}> {
  const response = await fetch(`/api/export-sessions/${sessionId}`);
  if (!response.ok) {
    throw new Error("Failed to get session status");
  }
  return response.json();
}

export async function waitForSessionReady(
  sessionId: number,
  maxWaitMs = 120000,
  pollIntervalMs = 2000
): Promise<{
  status: string;
  cleanZipUrl?: string;
  annotatedZipUrl?: string;
  pdfUrl?: string;
  csvUrl?: string;
}> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await pollSessionStatus(sessionId);
    
    if (status.status === "ready") {
      return status;
    }
    
    if (status.status === "error") {
      throw new Error(status.errorMessage || "Export failed");
    }
    
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  
  throw new Error("Export timed out");
}
