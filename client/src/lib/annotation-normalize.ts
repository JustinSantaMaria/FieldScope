import type { 
  AnnotationData, 
  LineAnnotation, 
  RectAnnotation, 
  ArrowAnnotation, 
  TextAnnotation, 
  DimensionAnnotation 
} from "@/components/annotation-canvas";

export const NORMALIZED_COORD_VERSION = 2;

export interface NormalizationContext {
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  stageWidth: number;
  stageHeight: number;
  imageScale: number;
  imageX: number;
  imageY: number;
}

function isLegacyAnnotationData(data: AnnotationData | null): boolean {
  if (!data) return false;
  if (data.normalizedVersion === NORMALIZED_COORD_VERSION) return false;
  return true;
}

function stageToImageNormalized(
  stageX: number, 
  stageY: number, 
  ctx: NormalizationContext
): { x: number; y: number } {
  const imageSpaceX = (stageX - ctx.imageX) / ctx.imageScale;
  const imageSpaceY = (stageY - ctx.imageY) / ctx.imageScale;
  
  return {
    x: imageSpaceX / ctx.imageNaturalWidth,
    y: imageSpaceY / ctx.imageNaturalHeight,
  };
}

function imageNormalizedToStage(
  normX: number, 
  normY: number, 
  ctx: NormalizationContext
): { x: number; y: number } {
  const imageSpaceX = normX * ctx.imageNaturalWidth;
  const imageSpaceY = normY * ctx.imageNaturalHeight;
  
  return {
    x: ctx.imageX + imageSpaceX * ctx.imageScale,
    y: ctx.imageY + imageSpaceY * ctx.imageScale,
  };
}

function normalizeSizeToImage(
  width: number,
  height: number,
  ctx: NormalizationContext
): { width: number; height: number } {
  return {
    width: (width / ctx.imageScale) / ctx.imageNaturalWidth,
    height: (height / ctx.imageScale) / ctx.imageNaturalHeight,
  };
}

function denormalizeSizeFromImage(
  normWidth: number,
  normHeight: number,
  ctx: NormalizationContext
): { width: number; height: number } {
  return {
    width: normWidth * ctx.imageNaturalWidth * ctx.imageScale,
    height: normHeight * ctx.imageNaturalHeight * ctx.imageScale,
  };
}

function normalizePoints(points: number[], ctx: NormalizationContext): number[] {
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const { x, y } = stageToImageNormalized(points[i], points[i + 1], ctx);
    result.push(x, y);
  }
  return result;
}

function denormalizePoints(points: number[], ctx: NormalizationContext): number[] {
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const { x, y } = imageNormalizedToStage(points[i], points[i + 1], ctx);
    result.push(x, y);
  }
  return result;
}

export function normalizeAnnotationsForStorage(
  annotations: AnnotationData,
  ctx: NormalizationContext
): AnnotationData {
  const lines: LineAnnotation[] = annotations.lines.map(line => ({
    ...line,
    points: normalizePoints(line.points, ctx),
  }));

  const rects: RectAnnotation[] = annotations.rects.map(rect => {
    const { x, y } = stageToImageNormalized(rect.x, rect.y, ctx);
    const { width, height } = normalizeSizeToImage(rect.width, rect.height, ctx);
    return { ...rect, x, y, width, height };
  });

  const arrows: ArrowAnnotation[] = annotations.arrows.map(arrow => ({
    ...arrow,
    points: normalizePoints(arrow.points, ctx),
  }));

  // fontSize is a style property like strokeWidth - store as-is in absolute pixels, do NOT normalize
  const texts: TextAnnotation[] = annotations.texts.map(text => {
    const { x, y } = stageToImageNormalized(text.x, text.y, ctx);
    return { ...text, x, y }; // fontSize passed through as-is
  });

  // fontSize/strokeWidth are style properties - store as-is in absolute pixels, do NOT normalize
  const dimensions: DimensionAnnotation[] = annotations.dimensions.map(dim => {
    return {
      ...dim,
      points: normalizePoints(dim.points, ctx),
      // fontSize and strokeWidth passed through as-is
    };
  });

  return {
    lines,
    rects,
    arrows,
    texts,
    dimensions,
    imageNaturalWidth: ctx.imageNaturalWidth,
    imageNaturalHeight: ctx.imageNaturalHeight,
    normalizedVersion: NORMALIZED_COORD_VERSION,
    imageRenderTransform: annotations.imageRenderTransform,
  };
}

export function denormalizeAnnotationsForDisplay(
  annotations: AnnotationData,
  ctx: NormalizationContext
): AnnotationData {
  const lines: LineAnnotation[] = annotations.lines.map(line => ({
    ...line,
    points: denormalizePoints(line.points, ctx),
  }));

  const rects: RectAnnotation[] = annotations.rects.map(rect => {
    const { x, y } = imageNormalizedToStage(rect.x, rect.y, ctx);
    const { width, height } = denormalizeSizeFromImage(rect.width, rect.height, ctx);
    return { ...rect, x, y, width, height };
  });

  const arrows: ArrowAnnotation[] = annotations.arrows.map(arrow => ({
    ...arrow,
    points: denormalizePoints(arrow.points, ctx),
  }));

  // fontSize is a style property stored in absolute pixels - pass through as-is, do NOT denormalize
  const texts: TextAnnotation[] = annotations.texts.map(text => {
    const { x, y } = imageNormalizedToStage(text.x, text.y, ctx);
    return { ...text, x, y }; // fontSize passed through as-is
  });

  // fontSize/strokeWidth are style properties stored in absolute pixels - pass through as-is
  const dimensions: DimensionAnnotation[] = annotations.dimensions.map(dim => {
    return {
      ...dim,
      points: denormalizePoints(dim.points, ctx),
      // fontSize and strokeWidth passed through as-is
    };
  });

  return {
    ...annotations,
    lines,
    rects,
    arrows,
    texts,
    dimensions,
    stageWidth: ctx.stageWidth,
    stageHeight: ctx.stageHeight,
  };
}

export function migrateLegacyAnnotations(
  annotations: AnnotationData | null,
  legacyCtx: NormalizationContext | null
): AnnotationData | null {
  if (!annotations) return null;
  if (!isLegacyAnnotationData(annotations)) return annotations;
  
  if (!legacyCtx) {
    if (!annotations.stageWidth || !annotations.stageHeight || 
        !annotations.imageNaturalWidth || !annotations.imageNaturalHeight) {
      return annotations;
    }
    
    const imgW = annotations.imageNaturalWidth;
    const imgH = annotations.imageNaturalHeight;
    const stgW = annotations.stageWidth;
    const stgH = annotations.stageHeight;
    const scale = Math.min(stgW / imgW, stgH / imgH);
    const offsetX = (stgW - imgW * scale) / 2;
    const offsetY = (stgH - imgH * scale) / 2;
    
    legacyCtx = {
      imageNaturalWidth: imgW,
      imageNaturalHeight: imgH,
      stageWidth: stgW,
      stageHeight: stgH,
      imageScale: scale,
      imageX: offsetX,
      imageY: offsetY,
    };
  }
  
  return normalizeAnnotationsForStorage(annotations, legacyCtx);
}

export function buildNormalizationContext(
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  stageWidth: number,
  stageHeight: number
): NormalizationContext {
  const scale = Math.min(stageWidth / imageNaturalWidth, stageHeight / imageNaturalHeight);
  const offsetX = (stageWidth - imageNaturalWidth * scale) / 2;
  const offsetY = (stageHeight - imageNaturalHeight * scale) / 2;
  
  return {
    imageNaturalWidth,
    imageNaturalHeight,
    stageWidth,
    stageHeight,
    imageScale: scale,
    imageX: offsetX,
    imageY: offsetY,
  };
}
