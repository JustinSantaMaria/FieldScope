import Konva from "konva";

export const DEFAULT_DIMENSION_SIDE_SIGN = 1;
const DEFAULT_STROKE_WIDTH = 4;
const DEFAULT_FONT_SIZE = 20;
const MAX_PUSH_ITERATIONS = 8;
const BOUNDS_TOLERANCE = 10;
const BBOX_PADDING = 8;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export interface DimensionLayoutParams {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  strokeWidth: number;
  fontSize: number;
  labelText: string;
  commentText?: string;
  stageBounds: { width: number; height: number };
  preferredSideSign?: 1 | -1;
  fontFamily?: string;
  fontStyle?: string;
}

export interface DimensionLayoutResult {
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  commentX: number;
  commentY: number;
  commentWidth: number;
  commentHeight: number;
  arrowLength: number;
  arrowWidth: number;
  capRadius: number;
  usedSideSign: 1 | -1;
}

let measureTextNode: Konva.Text | null = null;

function getMeasureTextNode(): Konva.Text {
  if (!measureTextNode) {
    measureTextNode = new Konva.Text({
      text: "",
      fontSize: 16,
      fontStyle: "normal",
    });
  }
  return measureTextNode;
}

function measureText(
  text: string,
  fontSize: number,
  fontStyle: string = "normal",
  fontFamily: string = "Arial"
): { width: number; height: number } {
  const node = getMeasureTextNode();
  node.text(text);
  node.fontSize(fontSize);
  node.fontStyle(fontStyle);
  node.fontFamily(fontFamily);
  const rect = node.getClientRect({ skipTransform: true });
  return { width: rect.width, height: rect.height };
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const left = rx;
  const right = rx + rw;
  const top = ry;
  const bottom = ry + rh;

  function pointInRect(px: number, py: number): boolean {
    return px >= left && px <= right && py >= top && py <= bottom;
  }

  if (pointInRect(x1, y1) || pointInRect(x2, y2)) {
    return true;
  }

  function lineIntersectsSegment(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number
  ): boolean {
    const denom = (dy - cy) * (bx - ax) - (dx - cx) * (by - ay);
    if (Math.abs(denom) < 1e-10) return false;

    const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / denom;
    const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  if (lineIntersectsSegment(x1, y1, x2, y2, left, top, right, top)) return true;
  if (lineIntersectsSegment(x1, y1, x2, y2, right, top, right, bottom)) return true;
  if (lineIntersectsSegment(x1, y1, x2, y2, right, bottom, left, bottom)) return true;
  if (lineIntersectsSegment(x1, y1, x2, y2, left, bottom, left, top)) return true;

  return false;
}

function isRectOutOfBounds(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  stageBounds: { width: number; height: number },
  tolerance: number
): boolean {
  return (
    rx < -tolerance ||
    ry < -tolerance ||
    rx + rw > stageBounds.width + tolerance ||
    ry + rh > stageBounds.height + tolerance
  );
}

export function computeDimensionLayout(params: DimensionLayoutParams): DimensionLayoutResult {
  const {
    p1,
    p2,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    fontSize = DEFAULT_FONT_SIZE,
    labelText,
    commentText = "",
    stageBounds,
    preferredSideSign = DEFAULT_DIMENSION_SIDE_SIGN,
    fontFamily = "Arial",
    fontStyle = "bold",
  } = params;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;

  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;

  const labelMeasure = measureText(labelText, fontSize, fontStyle, fontFamily);
  const labelWidth = labelMeasure.width;
  const labelHeight = labelMeasure.height;

  const commentFontSize = fontSize - 2;
  const commentMeasure = commentText
    ? measureText(commentText, commentFontSize, "normal", fontFamily)
    : { width: 0, height: 0 };
  const commentWidth = commentMeasure.width;
  const commentHeight = commentMeasure.height;

  const arrowLength = clamp(strokeWidth * 3, 10, 28);
  const arrowWidth = clamp(strokeWidth * 2, 6, 20);
  const capRadius = clamp(strokeWidth * 1.5, 6, 18);

  const commentGap = Math.max(6, fontSize * 0.35);
  const totalLabelBlockHeight = labelHeight + (commentText ? commentGap + commentHeight : 0);

  const baseOffset =
    Math.max(8, strokeWidth * 2 + fontSize * 0.4) +
    totalLabelBlockHeight / 2 +
    strokeWidth / 2 +
    4;

  const pushIncrement = Math.max(6, strokeWidth);

  function tryPlacement(sideSign: 1 | -1): {
    success: boolean;
    labelX: number;
    labelY: number;
    commentX: number;
    commentY: number;
    finalOffset: number;
  } {
    const nx = -uy * sideSign;
    const ny = ux * sideSign;

    let offset = baseOffset;

    for (let i = 0; i < MAX_PUSH_ITERATIONS; i++) {
      const labelCx = mx + nx * offset;
      const labelCy = my + ny * offset;

      const labelRectX = labelCx - labelWidth / 2 - BBOX_PADDING;
      const labelRectY = labelCy - labelHeight / 2 - BBOX_PADDING;
      const labelRectW = labelWidth + BBOX_PADDING * 2;
      const labelRectH = totalLabelBlockHeight + BBOX_PADDING * 2;

      const intersects = segmentIntersectsRect(
        p1.x,
        p1.y,
        p2.x,
        p2.y,
        labelRectX,
        labelRectY,
        labelRectW,
        labelRectH
      );

      const outOfBounds = isRectOutOfBounds(
        labelRectX,
        labelRectY,
        labelRectW,
        labelRectH,
        stageBounds,
        BOUNDS_TOLERANCE
      );

      if (!intersects && !outOfBounds) {
        const labelX = labelCx - labelWidth / 2;
        const labelY = labelCy - totalLabelBlockHeight / 2;
        const commentX = labelCx - commentWidth / 2;
        const commentY = labelY + labelHeight + commentGap;

        return {
          success: true,
          labelX,
          labelY,
          commentX,
          commentY,
          finalOffset: offset,
        };
      }

      if (outOfBounds && i === 0) {
        return {
          success: false,
          labelX: 0,
          labelY: 0,
          commentX: 0,
          commentY: 0,
          finalOffset: offset,
        };
      }

      offset += pushIncrement;
    }

    const labelCx = mx + nx * offset;
    const labelCy = my + ny * offset;
    const labelX = labelCx - labelWidth / 2;
    const labelY = labelCy - totalLabelBlockHeight / 2;
    const commentX = labelCx - commentWidth / 2;
    const commentY = labelY + labelHeight + commentGap;

    const labelRectX = labelCx - labelWidth / 2 - BBOX_PADDING;
    const labelRectY = labelCy - labelHeight / 2 - BBOX_PADDING;
    const labelRectW = labelWidth + BBOX_PADDING * 2;
    const labelRectH = totalLabelBlockHeight + BBOX_PADDING * 2;

    const stillIntersects = segmentIntersectsRect(
      p1.x,
      p1.y,
      p2.x,
      p2.y,
      labelRectX,
      labelRectY,
      labelRectW,
      labelRectH
    );

    const stillOutOfBounds = isRectOutOfBounds(
      labelRectX,
      labelRectY,
      labelRectW,
      labelRectH,
      stageBounds,
      BOUNDS_TOLERANCE
    );

    return {
      success: !stillIntersects && !stillOutOfBounds,
      labelX,
      labelY,
      commentX,
      commentY,
      finalOffset: offset,
    };
  }

  let result = tryPlacement(preferredSideSign);
  let usedSideSign: 1 | -1 = preferredSideSign;

  if (!result.success) {
    const flippedSign: 1 | -1 = preferredSideSign === 1 ? -1 : 1;
    const flippedResult = tryPlacement(flippedSign);

    if (flippedResult.success || flippedResult.finalOffset < result.finalOffset) {
      result = flippedResult;
      usedSideSign = flippedSign;
    }
  }

  return {
    labelX: result.labelX,
    labelY: result.labelY,
    labelWidth,
    labelHeight,
    commentX: result.commentX,
    commentY: result.commentY,
    commentWidth,
    commentHeight,
    arrowLength,
    arrowWidth,
    capRadius,
    usedSideSign,
  };
}
