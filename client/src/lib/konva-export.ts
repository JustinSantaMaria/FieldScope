import Konva from "konva";
import type { AnnotationData } from "@/components/annotation-canvas";
import { computeContainTransform, assertPixelRatioConsistency, NORMALIZATION_VERSION } from "@/lib/image-transform";
import { computeDimensionLayout, DEFAULT_DIMENSION_SIDE_SIGN } from "@/lib/dimension-layout";

const isDev = import.meta.env.DEV;
const MAX_CANVAS_DIMENSION = 4096;

const DEFAULT_STROKE_WIDTH = 4;
const DEFAULT_FONT_SIZE = 20;

export type ExportMode = "annotated" | "clean";

interface ExportCanvasOptions {
  imageUrl: string;
  annotations: AnnotationData;
  mode: ExportMode;
  format?: "png" | "jpeg";
  quality?: number;
}

function debugLog(...args: unknown[]) {
  if (isDev) {
    console.log("[konva-export]", ...args);
  }
}

async function loadImageWithCors(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error(`Image loaded but has zero dimensions: ${url}`));
        return;
      }
      debugLog("Image loaded:", {
        url,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
      resolve(img);
    };
    
    img.onerror = () => {
      reject(new Error(`Failed to load image: ${url}. Check CORS headers.`));
    };
    
    img.src = url;
  });
}

function clampPixelRatio(pixelRatio: number, stageWidth: number, stageHeight: number): number {
  const maxDim = Math.max(stageWidth, stageHeight) * pixelRatio;
  if (maxDim > MAX_CANVAS_DIMENSION) {
    const clampedRatio = MAX_CANVAS_DIMENSION / Math.max(stageWidth, stageHeight);
    debugLog(`Clamping pixelRatio from ${pixelRatio} to ${clampedRatio} (max dimension: ${MAX_CANVAS_DIMENSION})`);
    return clampedRatio;
  }
  return pixelRatio;
}

async function waitForRender(): Promise<void> {
  await new Promise(r => requestAnimationFrame(r));
}

export async function exportAnnotatedCanvas(options: ExportCanvasOptions): Promise<Blob> {
  const {
    imageUrl,
    annotations,
    mode,
    format = "png",
    quality = 0.92,
  } = options;

  debugLog("Starting export:", { imageUrl, mode, format });
  
  const img = await loadImageWithCors(imageUrl);
  
  const savedStageWidth = annotations.stageWidth || img.naturalWidth;
  const savedStageHeight = annotations.stageHeight || img.naturalHeight;
  const imageNaturalWidth = annotations.imageNaturalWidth || img.naturalWidth;
  const imageNaturalHeight = annotations.imageNaturalHeight || img.naturalHeight;
  
  const { pixelRatio: rawPixelRatio, isConsistent } = assertPixelRatioConsistency(
    imageNaturalWidth,
    imageNaturalHeight,
    savedStageWidth,
    savedStageHeight
  );
  
  if (!isConsistent) {
    debugLog("Pixel ratio inconsistency detected - using min ratio");
  }
  
  const pixelRatio = clampPixelRatio(rawPixelRatio, savedStageWidth, savedStageHeight);
  
  const savedTransform = annotations.imageRenderTransform || computeContainTransform(
    imageNaturalWidth,
    imageNaturalHeight,
    savedStageWidth,
    savedStageHeight
  );
  
  const imageScale = 'imageScale' in savedTransform ? savedTransform.imageScale : savedTransform.scale;
  const imageX = 'imageX' in savedTransform ? savedTransform.imageX : savedTransform.x;
  const imageY = 'imageY' in savedTransform ? savedTransform.imageY : savedTransform.y;
  const imageRotation = 'imageRotation' in savedTransform ? savedTransform.imageRotation : 0;
  
  debugLog("Export parameters:", {
    savedStageWidth,
    savedStageHeight,
    imageNaturalWidth,
    imageNaturalHeight,
    pixelRatio,
    outputWidth: savedStageWidth * pixelRatio,
    outputHeight: savedStageHeight * pixelRatio,
    transform: { imageScale, imageX, imageY, imageRotation },
  });

  const container = document.createElement("div");
  container.style.cssText = `position: fixed; left: -10000px; top: -10000px; width: ${savedStageWidth}px; height: ${savedStageHeight}px; pointer-events: none;`;
  document.body.appendChild(container);

  try {
    const stage = new Konva.Stage({
      container,
      width: savedStageWidth,
      height: savedStageHeight,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    const konvaImage = new Konva.Image({
      image: img,
      x: imageX,
      y: imageY,
      width: imageNaturalWidth * imageScale,
      height: imageNaturalHeight * imageScale,
      rotation: imageRotation,
    });
    layer.add(konvaImage);

    if (mode === "annotated") {
      addAnnotationsToLayer(layer, annotations);
    }

    layer.batchDraw();
    stage.batchDraw();
    await waitForRender();
    layer.batchDraw();
    await waitForRender();

    const canvas = stage.toCanvas({
      pixelRatio,
      x: 0,
      y: 0,
      width: savedStageWidth,
      height: savedStageHeight,
    });

    debugLog("Canvas created:", {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        format === "jpeg" ? "image/jpeg" : "image/png",
        quality
      );
    });

    stage.destroy();

    if (!blob) {
      throw new Error("Failed to create image blob - canvas.toBlob returned null");
    }

    debugLog("Export complete:", { blobSize: blob.size, blobType: blob.type });
    return blob;
    
  } finally {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  }
}

function addAnnotationsToLayer(layer: Konva.Layer, annotations: AnnotationData): void {
  const group = new Konva.Group();
  layer.add(group);

  for (const line of annotations.lines || []) {
    if (line.points && line.points.length >= 4) {
      group.add(new Konva.Line({
        points: line.points,
        stroke: line.color,
        strokeWidth: 4,
        tension: 0,
        lineCap: "round",
        lineJoin: "round",
      }));
    }
  }

  for (const rect of annotations.rects || []) {
    if (rect.x !== undefined && rect.y !== undefined && rect.width && rect.height) {
      group.add(new Konva.Rect({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        stroke: rect.color,
        strokeWidth: 4,
      }));
    }
  }

  for (const arrow of annotations.arrows || []) {
    if (arrow.points && arrow.points.length >= 4) {
      group.add(new Konva.Arrow({
        points: arrow.points,
        stroke: arrow.color,
        strokeWidth: 4,
        fill: arrow.color,
        pointerLength: 10,
        pointerWidth: 10,
      }));
    }
  }

  for (const txt of annotations.texts || []) {
    if (txt.x !== undefined && txt.y !== undefined && txt.text) {
      group.add(new Konva.Text({
        x: txt.x,
        y: txt.y,
        text: txt.text,
        fontSize: txt.fontSize || 20,
        fill: txt.color,
        fontStyle: "bold",
      }));
    }
  }

  const stageBounds = {
    width: annotations.stageWidth || 1920,
    height: annotations.stageHeight || 1080,
  };

  for (const dim of annotations.dimensions || []) {
    if (dim.points && dim.points.length >= 4) {
      addDimensionAnnotation(group, dim, stageBounds);
    }
  }
}

function addDimensionAnnotation(
  group: Konva.Group,
  dim: { points: number[]; value: string; unit: string; color: string; strokeWidth?: number; fontSize?: number; comment?: string },
  stageBounds: { width: number; height: number }
): void {
  const [x1, y1, x2, y2] = dim.points;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const dimensionText = `${dim.value} ${dim.unit}`;
  const commentText = dim.comment || "";
  
  const dimStrokeWidth = dim.strokeWidth || DEFAULT_STROKE_WIDTH;
  const dimFontSize = dim.fontSize || DEFAULT_FONT_SIZE;
  
  const layout = computeDimensionLayout({
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
    strokeWidth: dimStrokeWidth,
    fontSize: dimFontSize,
    labelText: dimensionText,
    commentText: commentText,
    stageBounds: stageBounds,
    preferredSideSign: DEFAULT_DIMENSION_SIDE_SIGN,
  });

  group.add(new Konva.Line({
    points: dim.points,
    stroke: dim.color,
    strokeWidth: dimStrokeWidth,
    lineCap: "round",
  }));

  group.add(new Konva.Arrow({
    points: [x1, y1, x1 + layout.arrowLength * Math.cos(angle), y1 + layout.arrowLength * Math.sin(angle)],
    stroke: dim.color,
    fill: dim.color,
    strokeWidth: dimStrokeWidth,
    pointerLength: layout.arrowLength,
    pointerWidth: layout.arrowWidth,
  }));

  group.add(new Konva.Arrow({
    points: [x2, y2, x2 - layout.arrowLength * Math.cos(angle), y2 - layout.arrowLength * Math.sin(angle)],
    stroke: dim.color,
    fill: dim.color,
    strokeWidth: dimStrokeWidth,
    pointerLength: layout.arrowLength,
    pointerWidth: layout.arrowWidth,
  }));

  group.add(new Konva.Circle({ x: x1, y: y1, radius: layout.capRadius, fill: dim.color }));
  group.add(new Konva.Circle({ x: x2, y: y2, radius: layout.capRadius, fill: dim.color }));

  group.add(new Konva.Text({
    x: layout.labelX,
    y: layout.labelY,
    text: dimensionText,
    fontSize: dimFontSize,
    fill: dim.color,
    fontStyle: "bold",
  }));

  if (commentText) {
    group.add(new Konva.Text({
      x: layout.commentX,
      y: layout.commentY,
      text: commentText,
      fontSize: dimFontSize - 2,
      fill: dim.color,
    }));
  }
}

export function generateAnnotationHash(photoId: number, annotations: AnnotationData): string {
  const hashData = {
    photoId,
    lines: annotations.lines,
    rects: annotations.rects,
    arrows: annotations.arrows,
    texts: annotations.texts,
    dimensions: annotations.dimensions,
    stageWidth: annotations.stageWidth,
    stageHeight: annotations.stageHeight,
    imageNaturalWidth: annotations.imageNaturalWidth,
    imageNaturalHeight: annotations.imageNaturalHeight,
    imageRenderTransform: annotations.imageRenderTransform,
    normalizedVersion: annotations.normalizedVersion || 0,
    imageNormalizedVersion: annotations.imageNormalizedVersion || 0,
  };
  const data = JSON.stringify(hashData);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export async function exportAnnotatedImageAsDataUrl(
  imageUrl: string,
  annotations: AnnotationData,
  mode: ExportMode = "annotated",
  format: "png" | "jpeg" = "png"
): Promise<string> {
  const blob = await exportAnnotatedCanvas({ imageUrl, annotations, mode, format });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to convert blob to data URL"));
    reader.readAsDataURL(blob);
  });
}
