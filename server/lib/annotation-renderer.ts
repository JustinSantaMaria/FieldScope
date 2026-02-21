/**
 * Server-side Annotation Renderer
 * Renders annotations (rectangles, arrows, lines, text, dimensions) onto photos
 * using sharp for image processing and node-canvas for drawing overlays.
 * 
 * IMPORTANT: All annotation coordinates are NORMALIZED (0-1 range).
 * strokeWidth and fontSize are in "natural image pixels" and must be scaled.
 * 
 * WYSIWYG PARITY: This renderer matches the editor exactly:
 * - Arrow: Filled triangle, pointerLength=10, pointerWidth=10 (scaled by sizeScale)
 * - Dimension: Proportional arrows (clamped), endpoint circles, plain bold text (no outline)
 * - Text: Normal weight, left+top baseline, no background pill or outline
 * - Font: Inter (registered via font-init.ts), fallback Arial, sans-serif
 */

import sharp from "sharp";
import { createCanvas, type Canvas, type CanvasRenderingContext2D } from "canvas";
import { initCanvasFontsOnce } from "./font-init";

initCanvasFontsOnce();

export interface RectAnnotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
}

export interface ArrowAnnotation {
  id: string;
  points: number[];
  color: string;
  strokeWidth?: number;
}

export interface LineAnnotation {
  id: string;
  points: number[];
  color: string;
  strokeWidth?: number;
}

export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface DimensionAnnotation {
  id: string;
  points: number[];
  value: string;
  unit: string;
  color: string;
  strokeWidth?: number;
  fontSize?: number;
}

export interface ImageRenderTransform {
  imageScale: number;
  imageX: number;
  imageY: number;
  imageRotation: number;
}

export interface AnnotationData {
  rects?: RectAnnotation[];
  arrows?: ArrowAnnotation[];
  lines?: LineAnnotation[];
  texts?: TextAnnotation[];
  dimensions?: DimensionAnnotation[];
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
  stageWidth?: number;
  stageHeight?: number;
  imageRenderTransform?: ImageRenderTransform;
}

const DEFAULT_EXPORT_MAX_EDGE = 1800;

/**
 * Parse annotation data - handles JSON string, double-encoded JSON, or object
 * Some DB rows return annotation_data as a JSON string, some may return as an object.
 * This handles double-encoded cases (JSON.parse returns another string).
 */
export function parseAnnotationData(annotationData: unknown): AnnotationData | null {
  if (!annotationData) return null;
  
  // Handle string input - may need multiple parse passes for double-encoding
  if (typeof annotationData === "string") {
    let parsed: unknown = annotationData;
    let attempts = 0;
    const maxAttempts = 3; // Prevent infinite loops from malformed data
    
    while (typeof parsed === "string" && attempts < maxAttempts) {
      try {
        parsed = JSON.parse(parsed);
        attempts++;
      } catch (e) {
        console.error("[annotation-renderer] Failed to parse annotationData JSON string:", e);
        return null;
      }
    }
    
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as AnnotationData;
    }
    return null;
  }
  
  if (typeof annotationData === "object") {
    return annotationData as AnnotationData;
  }
  
  return null;
}

/**
 * Check if annotations have any drawable shapes (accepts raw data, parses internally)
 */
export function hasDrawableAnnotations(annotationData: unknown): boolean {
  const parsed = parseAnnotationData(annotationData);
  return hasDrawableAnnotationsParsed(parsed);
}

/**
 * Check if PARSED annotations have any drawable shapes (avoids re-parsing)
 */
export function hasDrawableAnnotationsParsed(parsed: AnnotationData | null): boolean {
  if (!parsed) return false;
  
  const rectCount = parsed.rects?.length ?? 0;
  const arrowCount = parsed.arrows?.length ?? 0;
  const lineCount = parsed.lines?.length ?? 0;
  const textCount = parsed.texts?.length ?? 0;
  const dimCount = parsed.dimensions?.length ?? 0;
  
  return (rectCount + arrowCount + lineCount + textCount + dimCount) > 0;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function fillTriangle(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

/**
 * Get annotation counts for display
 */
export function getAnnotationCounts(annotationData: unknown): {
  rects: number;
  arrows: number;
  lines: number;
  texts: number;
  dimensions: number;
  total: number;
} {
  const parsed = parseAnnotationData(annotationData);
  if (!parsed) {
    return { rects: 0, arrows: 0, lines: 0, texts: 0, dimensions: 0, total: 0 };
  }
  
  const rects = parsed.rects?.length ?? 0;
  const arrows = parsed.arrows?.length ?? 0;
  const lines = parsed.lines?.length ?? 0;
  const texts = parsed.texts?.length ?? 0;
  const dimensions = parsed.dimensions?.length ?? 0;
  
  return {
    rects,
    arrows,
    lines,
    texts,
    dimensions,
    total: rects + arrows + lines + texts + dimensions,
  };
}

// Drawing context with coordinate transformers
interface DrawContext {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  sizeScale: number;
  sx: (n: number) => number;  // normalized X -> pixels
  sy: (n: number) => number;  // normalized Y -> pixels
  sw: (w?: number) => number; // strokeWidth scaling
  fs: (f?: number) => number; // fontSize scaling
}

function createDrawContext(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  annotations: AnnotationData | null,
  imageNaturalWidth: number,
  imageNaturalHeight: number
): DrawContext {
  // WYSIWYG fix: Use the editor's reference size for stroke/font scaling.
  // strokeWidth and fontSize were authored at the editor's display scale, NOT at natural image size.
  // 
  // Priority for sourceWidth/sourceHeight (what the user actually saw/drew on):
  // 1. Rendered image in editor = imageNaturalWidth * imageRenderTransform.imageScale
  // 2. Fallback: stageWidth/stageHeight (Konva stage size)
  // 3. Last resort: imageNaturalWidth/imageNaturalHeight (causes "too small" strokes on large photos)
  
  let sourceWidth = imageNaturalWidth;
  let sourceHeight = imageNaturalHeight;
  
  // 1) Best: rendered image dimensions in editor (natural * imageScale)
  const imageScale = annotations?.imageRenderTransform?.imageScale;
  if (typeof imageScale === "number" && isFinite(imageScale) && imageScale > 0) {
    sourceWidth = imageNaturalWidth * imageScale;
    sourceHeight = imageNaturalHeight * imageScale;
  } else if (
    typeof annotations?.stageWidth === "number" &&
    typeof annotations?.stageHeight === "number" &&
    isFinite(annotations.stageWidth) &&
    isFinite(annotations.stageHeight) &&
    annotations.stageWidth > 0 &&
    annotations.stageHeight > 0
  ) {
    // 2) Fallback: stage size (ok when image nearly fills stage)
    sourceWidth = annotations.stageWidth;
    sourceHeight = annotations.stageHeight;
  }
  
  // Use AVERAGE scale to match editor sizing behavior
  const scaleX = canvasWidth / sourceWidth;
  const scaleY = canvasHeight / sourceHeight;
  const sizeScale = (scaleX + scaleY) / 2;
  
  return {
    ctx,
    canvasWidth,
    canvasHeight,
    sizeScale,
    sx: (n: number) => n * canvasWidth,
    sy: (n: number) => n * canvasHeight,
    sw: (w?: number) => Math.max(1, (w ?? 2) * sizeScale),
    fs: (f?: number) => Math.max(10, (f ?? 16) * sizeScale),
  };
}

function drawRectangle(dc: DrawContext, rect: RectAnnotation): void {
  const { ctx, sx, sy, sw } = dc;
  
  const x = sx(rect.x);
  const y = sy(rect.y);
  const width = sx(rect.width);
  const height = sy(rect.height);
  const strokeWidth = sw(rect.strokeWidth);
  
  ctx.strokeStyle = rect.color || "#ff0000";
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeRect(x, y, width, height);
}

function drawLine(dc: DrawContext, line: LineAnnotation): void {
  const { ctx, sx, sy, sw } = dc;
  
  if (!line.points || line.points.length < 4) return;
  
  ctx.strokeStyle = line.color || "#ff0000";
  ctx.lineWidth = sw(line.strokeWidth);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  ctx.beginPath();
  ctx.moveTo(sx(line.points[0]), sy(line.points[1]));
  
  for (let i = 2; i < line.points.length; i += 2) {
    ctx.lineTo(sx(line.points[i]), sy(line.points[i + 1]));
  }
  ctx.stroke();
}

/**
 * Draw arrow - EXACT EDITOR MATCH
 * Editor uses: pointerLength=10, pointerWidth=10 (fixed, not proportional to stroke)
 * Shaft is trimmed by pointerLength so arrowhead sits at the endpoint
 */
function drawArrow(dc: DrawContext, arrow: ArrowAnnotation): void {
  const { ctx, sx, sy, sw, sizeScale } = dc;
  
  if (!arrow.points || arrow.points.length < 4) return;
  
  const strokeWidth = sw(arrow.strokeWidth);
  const color = arrow.color || "#ff0000";
  
  const lastIdx = arrow.points.length;
  const toX = sx(arrow.points[lastIdx - 2]);
  const toY = sy(arrow.points[lastIdx - 1]);
  const fromX = sx(arrow.points[lastIdx - 4]);
  const fromY = sy(arrow.points[lastIdx - 3]);
  
  const angle = Math.atan2(toY - fromY, toX - fromX);
  
  const pointerLength = 10 * sizeScale;
  const pointerWidth = 10 * sizeScale;
  
  const trimX = toX - pointerLength * Math.cos(angle);
  const trimY = toY - pointerLength * Math.sin(angle);
  
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  ctx.beginPath();
  ctx.moveTo(sx(arrow.points[0]), sy(arrow.points[1]));
  for (let i = 2; i < arrow.points.length - 2; i += 2) {
    ctx.lineTo(sx(arrow.points[i]), sy(arrow.points[i + 1]));
  }
  ctx.lineTo(trimX, trimY);
  ctx.stroke();
  
  const leftX = toX - pointerLength * Math.cos(angle) + pointerWidth * Math.cos(angle - Math.PI / 2);
  const leftY = toY - pointerLength * Math.sin(angle) + pointerWidth * Math.sin(angle - Math.PI / 2);
  const rightX = toX - pointerLength * Math.cos(angle) + pointerWidth * Math.cos(angle + Math.PI / 2);
  const rightY = toY - pointerLength * Math.sin(angle) + pointerWidth * Math.sin(angle + Math.PI / 2);
  
  ctx.fillStyle = color;
  fillTriangle(ctx, toX, toY, leftX, leftY, rightX, rightY);
}

/**
 * Draw text - EXACT EDITOR MATCH
 * Editor uses: normal weight (not bold), left+top baseline, no background pill, no outline
 * Opacity is applied via globalAlpha if present on annotation
 */
function drawText(dc: DrawContext, text: TextAnnotation): void {
  const { ctx, sx, sy, fs } = dc;
  
  const x = sx(text.x);
  const y = sy(text.y);
  const fontSize = fs(text.fontSize);
  const color = text.color || "#ff0000";
  
  ctx.font = `${fontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  
  ctx.fillStyle = color;
  ctx.fillText(text.text, x, y);
}

/**
 * Draw dimension - EXACT EDITOR MATCH
 * Editor uses:
 * - Proportional arrows: pointerLength = clamp(strokeWidth*3, 10, 28), pointerWidth = clamp(strokeWidth*2, 6, 20)
 * - Endpoint circles: r = max(3, lineW * 0.6)
 * - Offset formula: max(8, strokeWidth*2 + fontSize*0.4) + labelHeight/2 + strokeWidth/2 + 4
 * - Plain bold text (no shadow/outline), font weight 700
 */
function drawDimension(dc: DrawContext, dim: DimensionAnnotation): void {
  const { ctx, sx, sy, sw, fs, sizeScale } = dc;
  
  if (!dim.points || dim.points.length < 4) return;
  
  const px1 = sx(dim.points[0]);
  const py1 = sy(dim.points[1]);
  const px2 = sx(dim.points[2]);
  const py2 = sy(dim.points[3]);
  
  const color = dim.color || "#ef4444";
  const lineW = sw(dim.strokeWidth);
  
  const angle = Math.atan2(py2 - py1, px2 - px1);
  
  const pointerLength = clamp(lineW * 3, 10 * sizeScale, 28 * sizeScale);
  const pointerWidth = clamp(lineW * 2, 6 * sizeScale, 20 * sizeScale);
  
  const trim1X = px1 + pointerLength * Math.cos(angle);
  const trim1Y = py1 + pointerLength * Math.sin(angle);
  const trim2X = px2 - pointerLength * Math.cos(angle);
  const trim2Y = py2 - pointerLength * Math.sin(angle);
  
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  
  ctx.beginPath();
  ctx.moveTo(trim1X, trim1Y);
  ctx.lineTo(trim2X, trim2Y);
  ctx.stroke();
  
  ctx.fillStyle = color;
  
  const left1X = px1 + pointerLength * Math.cos(angle) + pointerWidth * Math.cos(angle - Math.PI / 2);
  const left1Y = py1 + pointerLength * Math.sin(angle) + pointerWidth * Math.sin(angle - Math.PI / 2);
  const right1X = px1 + pointerLength * Math.cos(angle) + pointerWidth * Math.cos(angle + Math.PI / 2);
  const right1Y = py1 + pointerLength * Math.sin(angle) + pointerWidth * Math.sin(angle + Math.PI / 2);
  fillTriangle(ctx, px1, py1, left1X, left1Y, right1X, right1Y);
  
  const left2X = px2 - pointerLength * Math.cos(angle) + pointerWidth * Math.cos(angle - Math.PI / 2);
  const left2Y = py2 - pointerLength * Math.sin(angle) + pointerWidth * Math.sin(angle - Math.PI / 2);
  const right2X = px2 - pointerLength * Math.cos(angle) + pointerWidth * Math.cos(angle + Math.PI / 2);
  const right2Y = py2 - pointerLength * Math.sin(angle) + pointerWidth * Math.sin(angle + Math.PI / 2);
  fillTriangle(ctx, px2, py2, left2X, left2Y, right2X, right2Y);
  
  const r = Math.max(3, lineW * 0.6);
  ctx.beginPath();
  ctx.arc(px1, py1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px2, py2, r, 0, Math.PI * 2);
  ctx.fill();
  
  const label = `${dim.value ?? ""} ${dim.unit ?? ""}`.trim();
  if (!label) return;
  
  const midX = (px1 + px2) / 2;
  const midY = (py1 + py2) / 2;
  
  // Calculate text rotation for readability (keep text right-side-up)
  let textAngle = angle;
  if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
    textAngle += Math.PI;
  }
  
  const fontPx = fs(dim.fontSize);
  ctx.font = `bold ${fontPx}px Inter, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  const metrics = ctx.measureText(label);
  const labelHeight = fontPx;
  const offset = Math.max(8, lineW * 2 + fontPx * 0.4) + labelHeight / 2 + lineW / 2 + 4;
  
  // Use ORIGINAL angle for perpendicular offset (match frontend)
  // Frontend uses: nx = -uy * sideSign, ny = ux * sideSign where ux=cos(angle), uy=sin(angle)
  // With default sideSign=1: nx = -sin(angle), ny = cos(angle)
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  
  const labelX = midX + nx * offset;
  const labelY = midY + ny * offset;
  
  ctx.save();
  ctx.translate(labelX, labelY);
  ctx.rotate(textAngle);
  
  ctx.fillStyle = color;
  ctx.fillText(label, 0, 0);
  
  ctx.restore();
  
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function roundRectFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

export interface RenderOptions {
  mode: "pdf" | "full";
  maxEdge?: number;
  quality?: number;
}

/**
 * Render annotations onto an image - accepts PARSED AnnotationData directly.
 * 
 * IMPORTANT: Handles EXIF orientation swap for natural dimensions.
 * If the image has EXIF orientation that swaps width/height (orientations 5-8),
 * we swap imageNaturalWidth/Height to match.
 * 
 * Modes:
 * - "pdf": Resize to maxEdge (default 1800) for PDF export performance
 * - "full": No resize, render at original post-rotate dimensions for full-res image downloads
 */
export async function renderAnnotatedImage(
  imageBuffer: Buffer,
  annotations: AnnotationData,
  optionsOrMaxEdge: RenderOptions | number = DEFAULT_EXPORT_MAX_EDGE
): Promise<Buffer> {
  // Backward compatibility: accept number as maxEdge (old API)
  const options: RenderOptions = typeof optionsOrMaxEdge === "number"
    ? { mode: "pdf", maxEdge: optionsOrMaxEdge }
    : optionsOrMaxEdge;
  
  const { mode, maxEdge = DEFAULT_EXPORT_MAX_EDGE, quality = mode === "full" ? 95 : 88 } = options;
  const isFullRes = mode === "full";
  
  if (!hasDrawableAnnotationsParsed(annotations)) {
    // No annotations - just rotate (and resize if not full-res mode)
    if (isFullRes) {
      const rotated = await sharp(imageBuffer)
        .rotate()
        .jpeg({ quality })
        .toBuffer();
      return rotated;
    }
    const resized = await sharp(imageBuffer)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    return resized;
  }
  
  const metadata = await sharp(imageBuffer).metadata();
  const rawW = metadata.width || 1000;
  const rawH = metadata.height || 1000;
  const exifOrientation = metadata.orientation ?? 1;
  
  const swapsAxes = exifOrientation >= 5 && exifOrientation <= 8;
  const postRotateW = swapsAxes ? rawH : rawW;
  const postRotateH = swapsAxes ? rawW : rawH;
  
  // Use annotation's stored natural dimensions for coordinate scaling
  // These represent the dimensions when annotations were created
  const imageNaturalWidth = annotations.imageNaturalWidth ?? postRotateW;
  const imageNaturalHeight = annotations.imageNaturalHeight ?? postRotateH;
  
  let targetWidth: number;
  let targetHeight: number;
  
  if (isFullRes) {
    // Full resolution mode: no resize, use post-rotate dimensions
    targetWidth = postRotateW;
    targetHeight = postRotateH;
    console.log(`[FULL-RES ANNOTATED] exportDims = ${targetWidth}x${targetHeight} (original post-rotate)`);
  } else {
    // PDF mode: resize to fit within maxEdge
    if (postRotateW > postRotateH) {
      targetWidth = Math.min(postRotateW, maxEdge);
      targetHeight = Math.round(targetWidth * (postRotateH / postRotateW));
    } else {
      targetHeight = Math.min(postRotateH, maxEdge);
      targetWidth = Math.round(targetHeight * (postRotateW / postRotateH));
    }
  }
  
  // Prepare base image buffer (rotated, resized if not full-res)
  let baseBuffer: Buffer;
  if (isFullRes) {
    // Full-res: just rotate, no resize
    baseBuffer = await sharp(imageBuffer)
      .rotate()
      .png()
      .toBuffer();
  } else {
    baseBuffer = await sharp(imageBuffer)
      .rotate()
      .resize({ width: targetWidth, height: targetHeight, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  }
  
  const baseMeta = await sharp(baseBuffer).metadata();
  const canvasWidth = baseMeta.width || targetWidth;
  const canvasHeight = baseMeta.height || targetHeight;
  
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  
  const { loadImage } = await import("canvas");
  const img = await loadImage(baseBuffer);
  ctx.drawImage(img, 0, 0);
  
  const dc = createDrawContext(ctx, canvasWidth, canvasHeight, annotations, imageNaturalWidth, imageNaturalHeight);
  
  if (annotations.rects) {
    for (const rect of annotations.rects) {
      drawRectangle(dc, rect);
    }
  }
  
  if (annotations.lines) {
    for (const line of annotations.lines) {
      drawLine(dc, line);
    }
  }
  
  if (annotations.arrows) {
    for (const arrow of annotations.arrows) {
      drawArrow(dc, arrow);
    }
  }
  
  if (annotations.dimensions) {
    for (const dim of annotations.dimensions) {
      drawDimension(dc, dim);
    }
  }
  
  if (annotations.texts) {
    for (const text of annotations.texts) {
      drawText(dc, text);
    }
  }
  
  const flattenedBuffer = canvas.toBuffer("image/png");
  const jpegBuffer = await sharp(flattenedBuffer)
    .jpeg({ quality })
    .toBuffer();
  
  return jpegBuffer;
}

export async function resizeImageForPdf(
  imageBuffer: Buffer,
  maxEdge: number = DEFAULT_EXPORT_MAX_EDGE
): Promise<Buffer> {
  const resized = await sharp(imageBuffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return resized;
}

// PDF Export-specific settings
// High quality mode - larger images
const PDF_MAX_EDGE = 1400;
const PDF_JPEG_QUALITY = 78;
// Compact mode - smaller images for single-file PDFs with many photos
const PDF_COMPACT_MAX_EDGE = 800;
const PDF_COMPACT_JPEG_QUALITY = 55;

/**
 * Render a clean (no annotations) image for PDF embedding.
 * Always outputs JPEG at capped PDF size - NEVER PNG.
 * This is the ONLY function that should be used for clean images in PDFs.
 * @param compact - If true, uses smaller dimensions for compact single-file PDFs
 */
export async function renderCleanImageForPdf(imageBuffer: Buffer, compact: boolean = false): Promise<Buffer> {
  const maxEdge = compact ? PDF_COMPACT_MAX_EDGE : PDF_MAX_EDGE;
  const quality = compact ? PDF_COMPACT_JPEG_QUALITY : PDF_JPEG_QUALITY;
  return sharp(imageBuffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/**
 * Render an annotated image for PDF embedding.
 * Always outputs JPEG at capped PDF size - NEVER PNG in final output.
 * This is the ONLY function that should be used for annotated images in PDFs.
 * @param compact - If true, uses smaller dimensions for compact single-file PDFs
 */
export async function renderAnnotatedImageForPdf(
  imageBuffer: Buffer,
  annotationData: unknown,
  compact: boolean = false
): Promise<Buffer> {
  const parsed = parseAnnotationData(annotationData);
  const hasAnnotations = hasDrawableAnnotationsParsed(parsed);
  
  // No annotations - just return clean PDF image
  if (!hasAnnotations || !parsed) {
    return renderCleanImageForPdf(imageBuffer, compact);
  }
  
  const maxEdge = compact ? PDF_COMPACT_MAX_EDGE : PDF_MAX_EDGE;
  const quality = compact ? PDF_COMPACT_JPEG_QUALITY : PDF_JPEG_QUALITY;
  
  // Get image metadata
  const metadata = await sharp(imageBuffer).metadata();
  const rawW = metadata.width || 1000;
  const rawH = metadata.height || 1000;
  const exifOrientation = metadata.orientation ?? 1;
  
  const swapsAxes = exifOrientation >= 5 && exifOrientation <= 8;
  const postRotateW = swapsAxes ? rawH : rawW;
  const postRotateH = swapsAxes ? rawW : rawH;
  
  // Use annotation's stored natural dimensions for coordinate scaling
  const imageNaturalWidth = parsed.imageNaturalWidth ?? postRotateW;
  const imageNaturalHeight = parsed.imageNaturalHeight ?? postRotateH;
  
  // Calculate target dimensions (capped at maxEdge)
  let targetWidth: number;
  let targetHeight: number;
  if (postRotateW > postRotateH) {
    targetWidth = Math.min(postRotateW, maxEdge);
    targetHeight = Math.round(targetWidth * (postRotateH / postRotateW));
  } else {
    targetHeight = Math.min(postRotateH, maxEdge);
    targetWidth = Math.round(targetHeight * (postRotateW / postRotateH));
  }
  
  // Prepare base image - use PNG temporarily for canvas (required by node-canvas)
  // but final output is always JPEG
  const baseBuffer = await sharp(imageBuffer)
    .rotate()
    .resize({ width: targetWidth, height: targetHeight, fit: "inside", withoutEnlargement: true })
    .png() // Required for node-canvas, will convert to JPEG at the end
    .toBuffer();
  
  const baseMeta = await sharp(baseBuffer).metadata();
  const canvasWidth = baseMeta.width || targetWidth;
  const canvasHeight = baseMeta.height || targetHeight;
  
  // Create canvas and draw base image
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  
  const { loadImage } = await import("canvas");
  const img = await loadImage(baseBuffer);
  ctx.drawImage(img, 0, 0);
  
  // Draw annotations
  const dc = createDrawContext(ctx, canvasWidth, canvasHeight, parsed, imageNaturalWidth, imageNaturalHeight);
  
  if (parsed.rects) {
    for (const rect of parsed.rects) {
      drawRectangle(dc, rect);
    }
  }
  
  if (parsed.lines) {
    for (const line of parsed.lines) {
      drawLine(dc, line);
    }
  }
  
  if (parsed.arrows) {
    for (const arrow of parsed.arrows) {
      drawArrow(dc, arrow);
    }
  }
  
  if (parsed.dimensions) {
    for (const dim of parsed.dimensions) {
      drawDimension(dc, dim);
    }
  }
  
  if (parsed.texts) {
    for (const text of parsed.texts) {
      drawText(dc, text);
    }
  }
  
  // Convert canvas to PNG buffer (required), then immediately to JPEG
  const pngBuffer = canvas.toBuffer("image/png");
  
  // Convert to JPEG with mozjpeg for better compression
  const jpegBuffer = await sharp(pngBuffer)
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  
  return jpegBuffer;
}

export async function resizeImageForThumbnail(
  imageBuffer: Buffer,
  maxEdge: number = 400
): Promise<Buffer> {
  const resized = await sharp(imageBuffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return resized;
}

/**
 * Get a full-resolution clean image (no annotations, just EXIF rotation).
 * Used for "clean" variant in selected photo downloads.
 */
export async function getFullResCleanBuffer(
  imageBuffer: Buffer,
  quality: number = 95
): Promise<Buffer> {
  const rotated = await sharp(imageBuffer)
    .rotate()
    .jpeg({ quality })
    .toBuffer();
  
  // Log dimensions for verification
  const meta = await sharp(rotated).metadata();
  console.log(`[FULL-RES CLEAN] exportDims = ${meta.width}x${meta.height} (original post-rotate)`);
  
  return rotated;
}

/**
 * Unified export buffer function - SINGLE SOURCE OF TRUTH for annotated photo exports.
 * Used by both PDF exports and ZIP "Download annotated photos" exports.
 * 
 * @param imageBuffer - Original image buffer
 * @param annotationData - Raw annotation data from database (handles string/object/double-encoded)
 * @param optionsOrMaxEdge - RenderOptions object or number (maxEdge for backward compatibility)
 * @returns Object with buffer and metadata about the render
 * @throws If hasAnnotations is true but rendering fails (no silent fallback)
 */
export async function getAnnotatedExportBuffer(
  imageBuffer: Buffer,
  annotationData: unknown,
  optionsOrMaxEdge: RenderOptions | number = DEFAULT_EXPORT_MAX_EDGE
): Promise<{
  buffer: Buffer;
  hasAnnotations: boolean;
  renderSuccess: boolean;
  errorMessage?: string;
}> {
  // Backward compatibility: accept number as maxEdge (old API)
  const options: RenderOptions = typeof optionsOrMaxEdge === "number"
    ? { mode: "pdf", maxEdge: optionsOrMaxEdge }
    : optionsOrMaxEdge;
  
  const { mode, maxEdge = DEFAULT_EXPORT_MAX_EDGE, quality = mode === "full" ? 95 : 88 } = options;
  const isFullRes = mode === "full";
  
  const parsed = parseAnnotationData(annotationData);
  const hasAnnotations = hasDrawableAnnotationsParsed(parsed);
  
  if (!hasAnnotations || !parsed) {
    // No annotations - just rotate (and resize if not full-res mode)
    let buffer: Buffer;
    if (isFullRes) {
      buffer = await sharp(imageBuffer)
        .rotate()
        .jpeg({ quality })
        .toBuffer();
    } else {
      buffer = await sharp(imageBuffer)
        .rotate()
        .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    }
    
    return {
      buffer,
      hasAnnotations: false,
      renderSuccess: true,
    };
  }
  
  try {
    const annotatedBuffer = await renderAnnotatedImage(imageBuffer, parsed, options);
    return {
      buffer: annotatedBuffer,
      hasAnnotations: true,
      renderSuccess: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[getAnnotatedExportBuffer] Render failed:", errorMessage);
    throw new Error(`Annotation render failed: ${errorMessage}`);
  }
}
