import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Rect, Text, Arrow, Group, Circle } from "react-konva";
import useImage from "use-image";
import { KonvaEventObject } from "konva/lib/Node";
import Konva from "konva";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeContainTransform } from "@/lib/image-transform";
import { 
  normalizeAnnotationsForStorage, 
  denormalizeAnnotationsForDisplay, 
  migrateLegacyAnnotations,
  buildNormalizationContext,
  NORMALIZED_COORD_VERSION,
  type NormalizationContext 
} from "@/lib/annotation-normalize";
import { computeDimensionLayout, DEFAULT_DIMENSION_SIDE_SIGN } from "@/lib/dimension-layout";

export type ToolType = "select" | "rect" | "arrow" | "text" | "line" | "dimension";

export interface LineAnnotation {
  id: string;
  type: "line";
  points: number[];
  color: string;
  strokeWidth?: number;
}

export interface RectAnnotation {
  id: string;
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
}

export interface ArrowAnnotation {
  id: string;
  type: "arrow";
  points: number[];
  color: string;
  strokeWidth?: number;
}

export const DEFAULT_STROKE_WIDTH = 4;
export const DEFAULT_FONT_SIZE = 20;
export const DEFAULT_STROKE_COLOR = "#FFD400";

export interface TextAnnotation {
  id: string;
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface DimensionAnnotation {
  id: string;
  type: "dimension";
  points: number[];
  value: string;
  unit: string;
  color: string;
  strokeWidth?: number;
  fontSize?: number;
  comment?: string;
}

export type Annotation = LineAnnotation | RectAnnotation | ArrowAnnotation | TextAnnotation | DimensionAnnotation;

export interface ImageRenderTransform {
  imageScale: number;
  imageX: number;
  imageY: number;
  imageRotation: number;
}

export interface AnnotationData {
  lines: LineAnnotation[];
  rects: RectAnnotation[];
  arrows: ArrowAnnotation[];
  texts: TextAnnotation[];
  dimensions: DimensionAnnotation[];
  stageWidth?: number;
  stageHeight?: number;
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
  imageRenderTransform?: ImageRenderTransform;
  normalizedVersion?: number;
  imageNormalizedVersion?: number;
}

export interface AnnotationCanvasExportHandle {
  exportToBlob: (format?: "png" | "jpeg", quality?: number) => Promise<Blob | null>;
  getStageSize: () => { width: number; height: number };
  getImageNaturalSize: () => { width: number; height: number } | null;
}

export type AnnotationElementType = "line" | "arrow" | "rect" | "text" | "dimension" | null;

interface AnnotationCanvasProps {
  imageUrl: string;
  annotations: AnnotationData | null;
  annotationsVersion?: number;
  onSave: (data: AnnotationData) => void;
  tool: ToolType;
  color: string;
  strokeWidth?: number;
  fontSize?: number;
  scale?: number;
  onZoomChange?: (newScale: number) => void;
  stagePosition?: { x: number; y: number };
  onPositionChange?: (pos: { x: number; y: number }) => void;
  onRequestDimension?: (startPoint: { x: number; y: number }, endPoint: { x: number; y: number }) => void;
  pendingDimension?: { value: string; unit: string; comment: string } | null;
  onClearPendingDimension?: () => void;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onSelectType?: (type: AnnotationElementType) => void;
  deleteSelectedRef?: React.MutableRefObject<(() => void) | null>;
  clearAllRef?: React.MutableRefObject<(() => void) | null>;
  applyStyleToSelectedRef?: React.MutableRefObject<((style: { color?: string; strokeWidth?: number; fontSize?: number }) => void) | null>;
  onEditDimension?: (dimensionId: string, currentValue: string, currentUnit: string, currentComment: string) => void;
  editedDimension?: { id: string; value: string; unit: string; comment: string } | null;
  onClearEditedDimension?: () => void;
  exportRef?: React.MutableRefObject<AnnotationCanvasExportHandle | null>;
  orientationDegrees?: 0 | 90 | 180 | 270;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

function migrateAnnotations(annotations: any): AnnotationData {
  if (!annotations) {
    return { lines: [], rects: [], arrows: [], texts: [], dimensions: [] };
  }

  const migrateLines = (items: any[]): LineAnnotation[] =>
    (items || []).map((item, idx) => ({
      id: item.id || generateId(),
      type: "line" as const,
      points: item.points || [],
      color: item.color || DEFAULT_STROKE_COLOR,
      strokeWidth: item.strokeWidth || DEFAULT_STROKE_WIDTH,
    }));

  const migrateRects = (items: any[]): RectAnnotation[] =>
    (items || []).map((item, idx) => ({
      id: item.id || generateId(),
      type: "rect" as const,
      x: item.x || 0,
      y: item.y || 0,
      width: item.width || 0,
      height: item.height || 0,
      color: item.color || DEFAULT_STROKE_COLOR,
      strokeWidth: item.strokeWidth || DEFAULT_STROKE_WIDTH,
    }));

  const migrateArrows = (items: any[]): ArrowAnnotation[] =>
    (items || []).map((item, idx) => ({
      id: item.id || generateId(),
      type: "arrow" as const,
      points: item.points || [],
      color: item.color || DEFAULT_STROKE_COLOR,
      strokeWidth: item.strokeWidth || DEFAULT_STROKE_WIDTH,
    }));

  // Validate fontSize: must be a positive number >= 8, otherwise use default
  // This fixes old data that was stored with fontSize: 0 or tiny normalized values
  const validateFontSize = (fontSize: any): number => {
    const size = typeof fontSize === 'number' ? fontSize : DEFAULT_FONT_SIZE;
    return size >= 8 ? size : DEFAULT_FONT_SIZE;
  };

  const migrateTexts = (items: any[]): TextAnnotation[] =>
    (items || []).map((item, idx) => ({
      id: item.id || generateId(),
      type: "text" as const,
      x: item.x || 0,
      y: item.y || 0,
      text: item.text || "Text",
      color: item.color || DEFAULT_STROKE_COLOR,
      fontSize: validateFontSize(item.fontSize),
    }));

  const migrateDimensions = (items: any[]): DimensionAnnotation[] =>
    (items || []).map((item, idx) => ({
      id: item.id || generateId(),
      type: "dimension" as const,
      points: item.points || [],
      value: item.value || "",
      unit: item.unit || "",
      color: item.color || "#ef4444",
      strokeWidth: item.strokeWidth || DEFAULT_STROKE_WIDTH,
      fontSize: validateFontSize(item.fontSize),
      comment: item.comment,
    }));

  return {
    lines: migrateLines(annotations.lines),
    rects: migrateRects(annotations.rects),
    arrows: migrateArrows(annotations.arrows),
    texts: migrateTexts(annotations.texts),
    dimensions: migrateDimensions(annotations.dimensions),
    stageWidth: annotations.stageWidth,
    stageHeight: annotations.stageHeight,
    imageNaturalWidth: annotations.imageNaturalWidth,
    imageNaturalHeight: annotations.imageNaturalHeight,
    imageRenderTransform: annotations.imageRenderTransform,
    normalizedVersion: annotations.normalizedVersion,
    imageNormalizedVersion: annotations.imageNormalizedVersion,
  };
}

export function normalizeAnnotationData(annotations: AnnotationData): AnnotationData {
  const cleanedTexts = annotations.texts.map((txt: any) => {
    const { backgroundColor, padding, ...rest } = txt;
    return rest as TextAnnotation;
  });
  
  const cleanedDimensions = annotations.dimensions.map((dim: any) => {
    const { labelBackground, labelPadding, ...rest } = dim;
    return rest as DimensionAnnotation;
  });

  return {
    ...annotations,
    texts: cleanedTexts,
    dimensions: cleanedDimensions,
    normalizedVersion: NORMALIZED_COORD_VERSION,
  };
}

export function AnnotationCanvas({
  imageUrl,
  annotations,
  annotationsVersion = 0,
  onSave,
  tool,
  color,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  fontSize = DEFAULT_FONT_SIZE,
  scale = 1,
  onZoomChange,
  stagePosition = { x: 0, y: 0 },
  onPositionChange,
  onRequestDimension,
  pendingDimension,
  onClearPendingDimension,
  selectedId,
  onSelectId,
  onSelectType,
  deleteSelectedRef,
  clearAllRef,
  applyStyleToSelectedRef,
  onEditDimension,
  editedDimension,
  onClearEditedDimension,
  exportRef,
  orientationDegrees = 0,
}: AnnotationCanvasProps) {
  const [image, imageLoadStatus] = useImage(imageUrl, "anonymous");
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  
  // Debug logging for image load
  useEffect(() => {
    console.log(`[AnnotationCanvas] Image load: url=${imageUrl}, status=${imageLoadStatus}`);
    if (imageLoadStatus === "failed") {
      setImageLoadError("Image failed to load");
      console.error(`[AnnotationCanvas] Image load FAILED for url: ${imageUrl}`);
    } else if (imageLoadStatus === "loaded" && image) {
      setImageLoadError(null);
      console.log(`[AnnotationCanvas] Image loaded successfully: ${image.width}x${image.height}`);
    }
  }, [imageUrl, imageLoadStatus, image]);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const contentGroupRef = useRef<Konva.Group>(null);

  const [lines, setLines] = useState<LineAnnotation[]>([]);
  const [rects, setRects] = useState<RectAnnotation[]>([]);
  const [arrows, setArrows] = useState<ArrowAnnotation[]>([]);
  const [texts, setTexts] = useState<TextAnnotation[]>([]);
  const [dimensions, setDimensions] = useState<DimensionAnnotation[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [draftDimension, setDraftDimension] = useState<number[] | null>(null);

  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textInputValue, setTextInputValue] = useState("");
  const [pendingTextPosition, setPendingTextPosition] = useState<{ x: number; y: number } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const isDrawing = useRef(false);
  const pendingDimensionPoints = useRef<number[] | null>(null);
  const lastTouchDistance = useRef<number | null>(null);
  const lastCreatedTextId = useRef<string | null>(null);
  const pinchCenter = useRef<{ x: number; y: number } | null>(null);
  
  // Pan state for drag-to-pan when zoomed
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);

  // Interaction guards for external style sync
  const isInteracting = useRef(false);
  const pendingStyleSync = useRef(false);
  const lastSyncedVersion = useRef(0);
  
  // Stability tracking for dimension label side - prevents jitter during drag
  const dimensionSideSignsRef = useRef<Map<string, 1 | -1>>(new Map());

  // Sync ONLY style fields from props when annotationsVersion changes (external style edits)
  const syncStylesFromProps = useCallback(() => {
    if (!annotations || !initialized) return;
    
    // Merge style fields only (color, strokeWidth, fontSize) - preserve geometry
    setLines(prev => prev.map(line => {
      const propLine = annotations.lines.find(l => l.id === line.id);
      if (propLine) {
        return { ...line, color: propLine.color, strokeWidth: propLine.strokeWidth };
      }
      return line;
    }));
    
    setArrows(prev => prev.map(arrow => {
      const propArrow = annotations.arrows.find(a => a.id === arrow.id);
      if (propArrow) {
        return { ...arrow, color: propArrow.color, strokeWidth: propArrow.strokeWidth };
      }
      return arrow;
    }));
    
    setRects(prev => prev.map(rect => {
      const propRect = annotations.rects.find(r => r.id === rect.id);
      if (propRect) {
        return { ...rect, color: propRect.color, strokeWidth: propRect.strokeWidth };
      }
      return rect;
    }));
    
    setTexts(prev => prev.map(text => {
      const propText = annotations.texts.find(t => t.id === text.id);
      if (propText) {
        return { ...text, color: propText.color, fontSize: propText.fontSize };
      }
      return text;
    }));
    
    setDimensions(prev => prev.map(dim => {
      const propDim = annotations.dimensions.find(d => d.id === dim.id);
      if (propDim) {
        return { 
          ...dim, 
          color: propDim.color, 
          strokeWidth: propDim.strokeWidth,
          fontSize: propDim.fontSize 
        };
      }
      return dim;
    }));
    
    lastSyncedVersion.current = annotationsVersion;
  }, [annotations, annotationsVersion, initialized]);

  // Apply pending style sync when interaction ends
  const applyPendingSync = useCallback(() => {
    if (pendingStyleSync.current) {
      pendingStyleSync.current = false;
      syncStylesFromProps();
    }
  }, [syncStylesFromProps]);

  // Watch for external style changes via annotationsVersion
  useEffect(() => {
    if (!initialized || annotationsVersion === lastSyncedVersion.current) return;
    
    if (isInteracting.current) {
      // Queue sync for when interaction ends
      pendingStyleSync.current = true;
    } else {
      // Sync immediately
      syncStylesFromProps();
    }
  }, [annotationsVersion, initialized, syncStylesFromProps]);

  // Track stored normalized annotations for save comparison
  const storedNormalizedRef = useRef<AnnotationData | null>(null);
  
  // Initialize annotations from props (either saved data or empty arrays)
  // Migrate legacy coords to normalized, then denormalize for display
  useEffect(() => {
    if (!initialized && image && stageSize.width > 0 && stageSize.height > 0) {
      const migrated = migrateAnnotations(annotations);
      
      // Build normalization context for current display
      const isRotated90or270 = orientationDegrees === 90 || orientationDegrees === 270;
      const effectiveImageW = isRotated90or270 ? image.height : image.width;
      const effectiveImageH = isRotated90or270 ? image.width : image.height;
      const ctx = buildNormalizationContext(effectiveImageW, effectiveImageH, stageSize.width, stageSize.height);
      
      // Migrate legacy data to normalized if needed
      const normalized = migrateLegacyAnnotations(migrated, null);
      storedNormalizedRef.current = normalized;
      
      if (normalized && normalized.normalizedVersion === NORMALIZED_COORD_VERSION) {
        // Denormalize for display
        const display = denormalizeAnnotationsForDisplay(normalized, ctx);
        setLines(display.lines);
        setRects(display.rects);
        setArrows(display.arrows);
        setTexts(display.texts);
        setDimensions(display.dimensions);
      } else {
        // No data or couldn't migrate - use empty
        setLines(migrated.lines);
        setRects(migrated.rects);
        setArrows(migrated.arrows);
        setTexts(migrated.texts);
        setDimensions(migrated.dimensions);
      }
      
      setInitialized(true);
      lastSyncedVersion.current = annotationsVersion;
    }
  }, [annotations, initialized, annotationsVersion, image, stageSize, orientationDegrees]);

  useEffect(() => {
    if (containerRef.current && image) {
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      
      const isRotated90or270 = orientationDegrees === 90 || orientationDegrees === 270;
      const effectiveImageW = isRotated90or270 ? image.height : image.width;
      const effectiveImageH = isRotated90or270 ? image.width : image.height;
      const imageRatio = effectiveImageW / effectiveImageH;
      const containerRatio = containerW / containerH;

      let finalW, finalH;
      if (containerRatio > imageRatio) {
        finalH = containerH;
        finalW = finalH * imageRatio;
      } else {
        finalW = containerW;
        finalH = finalW / imageRatio;
      }
      setStageSize({ width: finalW, height: finalH });
    }
  }, [image, orientationDegrees]);

  useEffect(() => {
    if (pendingDimension && pendingDimensionPoints.current) {
      const newDimension: DimensionAnnotation = {
        id: generateId(),
        type: "dimension",
        points: pendingDimensionPoints.current,
        value: pendingDimension.value,
        unit: pendingDimension.unit,
        color,
        strokeWidth,
        fontSize,
        comment: pendingDimension.comment || undefined,
      };
      setDimensions((prev) => [...prev, newDimension]);
      pendingDimensionPoints.current = null;
      onClearPendingDimension?.();
    }
  }, [pendingDimension, color, strokeWidth, fontSize, onClearPendingDimension]);

  useEffect(() => {
    if (editedDimension) {
      setDimensions((prev) =>
        prev.map((dim) =>
          dim.id === editedDimension.id
            ? { ...dim, value: editedDimension.value, unit: editedDimension.unit, comment: editedDimension.comment }
            : dim
        )
      );
      onClearEditedDimension?.();
    }
  }, [editedDimension, onClearEditedDimension]);

  // Reset pan offset when zoom returns to 100%
  useEffect(() => {
    if (scale <= 1) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [scale]);

  // Export directly from live stage (WYSIWYG)
  useEffect(() => {
    if (exportRef) {
      exportRef.current = {
        exportToBlob: async (format = "png", quality = 0.92) => {
          if (!stageRef.current || !contentGroupRef.current || !image) {
            return null;
          }

          const contentGroup = contentGroupRef.current;
          
          // Save current transforms
          const originalScaleX = contentGroup.scaleX();
          const originalScaleY = contentGroup.scaleY();
          const originalX = contentGroup.x();
          const originalY = contentGroup.y();
          
          // Reset to 1:1 scale at origin for clean capture
          contentGroup.scaleX(1);
          contentGroup.scaleY(1);
          contentGroup.x(0);
          contentGroup.y(0);
          
          // Calculate pixel ratio using effective (post-rotation) image dimensions
          // For 90° and 270° rotations, width and height are swapped
          const isRotated90or270 = orientationDegrees === 90 || orientationDegrees === 270;
          const effectiveImageWidth = isRotated90or270 ? image.height : image.width;
          const pixelRatio = effectiveImageWidth / stageSize.width;
          
          // Export the content group only (not the full stage viewport)
          const canvas = contentGroup.toCanvas({
            pixelRatio,
            x: 0,
            y: 0,
            width: stageSize.width,
            height: stageSize.height,
          });
          
          // Restore original transforms
          contentGroup.scaleX(originalScaleX);
          contentGroup.scaleY(originalScaleY);
          contentGroup.x(originalX);
          contentGroup.y(originalY);
          
          return new Promise<Blob | null>((resolve) => {
            canvas.toBlob(
              (blob) => resolve(blob),
              format === "jpeg" ? "image/jpeg" : "image/png",
              quality
            );
          });
        },
        getStageSize: () => stageSize,
        getImageNaturalSize: () => image ? { width: image.width, height: image.height } : null,
      };
    }
  }, [exportRef, stageSize, image, orientationDegrees]);

  const handleTextInputConfirm = useCallback(() => {
    const inputValue = textInputRef.current?.value || textInputValue;
    const trimmedValue = inputValue.trim();
    console.log('handleTextInputConfirm:', { editingTextId, textInputValue, inputValue, trimmedValue, pendingTextPosition });
    
    if (pendingTextPosition && trimmedValue) {
      const newText: TextAnnotation = {
        id: generateId(),
        type: "text",
        x: pendingTextPosition.x,
        y: pendingTextPosition.y,
        text: trimmedValue,
        color,
        fontSize,
      };
      console.log('Creating new text:', newText);
      setTexts((prev) => [...prev, newText]);
    } else if (editingTextId && trimmedValue) {
      console.log('Updating text:', editingTextId, 'to:', trimmedValue);
      setTexts((prev) =>
        prev.map((t) =>
          t.id === editingTextId ? { ...t, text: trimmedValue } : t
        )
      );
    } else if (editingTextId && !trimmedValue) {
      console.log('Deleting text:', editingTextId);
      setTexts((prev) => prev.filter((t) => t.id !== editingTextId));
    }
    
    setEditingTextId(null);
    setTextInputValue("");
    setPendingTextPosition(null);
  }, [editingTextId, textInputValue, pendingTextPosition, color, fontSize]);

  const handleCancelTextEdit = useCallback(() => {
    setEditingTextId(null);
    setTextInputValue("");
    setPendingTextPosition(null);
  }, []);

  useEffect(() => {
    if (editingTextId && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [editingTextId]);

  // Compute contain-fit transform using shared utility
  const imageRenderTransform = useMemo(() => {
    if (!image || stageSize.width === 0 || stageSize.height === 0) return null;
    const isRotated90or270 = orientationDegrees === 90 || orientationDegrees === 270;
    const effectiveImageW = isRotated90or270 ? image.height : image.width;
    const effectiveImageH = isRotated90or270 ? image.width : image.height;
    const { scale, x, y } = computeContainTransform(
      effectiveImageW,
      effectiveImageH,
      stageSize.width,
      stageSize.height
    );
    return {
      imageScale: scale,
      imageX: x,
      imageY: y,
      imageRotation: orientationDegrees,
    };
  }, [image, stageSize.width, stageSize.height, orientationDegrees]);

  useEffect(() => {
    if (initialized && stageSize.width > 0 && stageSize.height > 0 && image && imageRenderTransform) {
      // Build normalization context
      const isRotated90or270 = orientationDegrees === 90 || orientationDegrees === 270;
      const effectiveImageW = isRotated90or270 ? image.height : image.width;
      const effectiveImageH = isRotated90or270 ? image.width : image.height;
      const ctx = buildNormalizationContext(effectiveImageW, effectiveImageH, stageSize.width, stageSize.height);
      
      // Create display data structure
      const displayData: AnnotationData = {
        lines,
        rects,
        arrows,
        texts,
        dimensions,
        stageWidth: stageSize.width,
        stageHeight: stageSize.height,
        imageNaturalWidth: image.width,
        imageNaturalHeight: image.height,
        imageRenderTransform,
      };
      
      // Normalize for storage
      const normalized = normalizeAnnotationsForStorage(displayData, ctx);
      
      onSave(normalized);
    }
  }, [lines, rects, arrows, texts, dimensions, initialized, onSave, stageSize, image, imageRenderTransform, orientationDegrees]);

  const getStageOffset = () => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    const scaledW = stageSize.width * scale;
    const scaledH = stageSize.height * scale;
    const centerOffsetX = Math.max(0, (containerW - scaledW) / 2);
    const centerOffsetY = Math.max(0, (containerH - scaledH) / 2);
    return {
      x: centerOffsetX,
      y: centerOffsetY,
    };
  };

  // Convert stage pointer position to image coordinates
  // This accounts for the Group's position (center offset + pan) and scale
  const stageToImageCoords = (stageX: number, stageY: number) => {
    const viewportWidth = containerRef.current?.clientWidth || stageSize.width;
    const viewportHeight = containerRef.current?.clientHeight || stageSize.height;
    // Center offset based on whether scaled content fits in viewport
    const scaledW = stageSize.width * scale;
    const scaledH = stageSize.height * scale;
    const centerOffsetX = Math.max(0, (viewportWidth - scaledW) / 2);
    const centerOffsetY = Math.max(0, (viewportHeight - scaledH) / 2);
    
    // Subtract the group's position, then divide by scale
    const imageX = (stageX - centerOffsetX - panOffset.x) / scale;
    const imageY = (stageY - centerOffsetY - panOffset.y) / scale;
    return { x: imageX, y: imageY };
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const nativeEvent = e.evt as TouchEvent;
    if (nativeEvent.touches && nativeEvent.touches.length > 1) {
      return;
    }
    
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.getClassName() === "Image";

    if (tool === "select") {
      if (clickedOnEmpty) {
        clearSelection();
        // Start panning if zoomed in
        if (scale > 1) {
          isPanning.current = true;
          const pos = e.evt instanceof TouchEvent 
            ? { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY }
            : { x: (e.evt as MouseEvent).clientX, y: (e.evt as MouseEvent).clientY };
          lastPanPoint.current = pos;
        }
      }
      return;
    }

    if (tool === "text") {
      if (!clickedOnEmpty) {
        return;
      }
      const pos = e.target.getStage()?.getPointerPosition();
      if (!pos) return;
      const imageCoords = stageToImageCoords(pos.x, pos.y);
      setPendingTextPosition({ x: imageCoords.x, y: imageCoords.y });
      setTextInputValue("");
      return;
    }

    isDrawing.current = true;
    isInteracting.current = true;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const imageCoords = stageToImageCoords(pos.x, pos.y);
    const canvasX = imageCoords.x;
    const canvasY = imageCoords.y;

    if (tool === "line") {
      const newLine: LineAnnotation = {
        id: generateId(),
        type: "line",
        points: [canvasX, canvasY, canvasX, canvasY],
        color,
        strokeWidth,
      };
      setLines((prev) => [...prev, newLine]);
    } else if (tool === "rect") {
      const newRect: RectAnnotation = {
        id: generateId(),
        type: "rect",
        x: canvasX,
        y: canvasY,
        width: 0,
        height: 0,
        color,
        strokeWidth,
      };
      setRects((prev) => [...prev, newRect]);
    } else if (tool === "arrow") {
      const newArrow: ArrowAnnotation = {
        id: generateId(),
        type: "arrow",
        points: [canvasX, canvasY, canvasX, canvasY],
        color,
        strokeWidth,
      };
      setArrows((prev) => [...prev, newArrow]);
    } else if (tool === "dimension") {
      pendingDimensionPoints.current = [canvasX, canvasY, canvasX, canvasY];
      setDraftDimension([canvasX, canvasY, canvasX, canvasY]);
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const nativeEvent = e.evt as TouchEvent;
    if (nativeEvent.touches && nativeEvent.touches.length > 1) {
      return;
    }
    
    // Handle panning when zoomed
    if (isPanning.current && lastPanPoint.current && scale > 1) {
      const pos = e.evt instanceof TouchEvent 
        ? { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY }
        : { x: (e.evt as MouseEvent).clientX, y: (e.evt as MouseEvent).clientY };
      
      const dx = pos.x - lastPanPoint.current.x;
      const dy = pos.y - lastPanPoint.current.y;
      
      // Calculate bounds for clamping
      const containerW = containerRef.current?.clientWidth || 0;
      const containerH = containerRef.current?.clientHeight || 0;
      const scaledW = stageSize.width * scale;
      const scaledH = stageSize.height * scale;
      const maxPanX = Math.max(0, scaledW - containerW);
      const maxPanY = Math.max(0, scaledH - containerH);
      
      setPanOffset(prev => ({
        x: Math.max(-maxPanX, Math.min(0, prev.x + dx)),
        y: Math.max(-maxPanY, Math.min(0, prev.y + dy)),
      }));
      
      lastPanPoint.current = pos;
      return;
    }
    
    if (!isDrawing.current || tool === "select" || tool === "text") return;
    const stage = e.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;
    const imageCoords = stageToImageCoords(point.x, point.y);
    const canvasX = imageCoords.x;
    const canvasY = imageCoords.y;

    if (tool === "line") {
      setLines((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          last.points = [last.points[0], last.points[1], canvasX, canvasY];
        }
        return updated;
      });
    } else if (tool === "rect") {
      setRects((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          last.width = canvasX - last.x;
          last.height = canvasY - last.y;
        }
        return updated;
      });
    } else if (tool === "arrow") {
      setArrows((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          last.points = [last.points[0], last.points[1], canvasX, canvasY];
        }
        return updated;
      });
    } else if (tool === "dimension" && pendingDimensionPoints.current) {
      pendingDimensionPoints.current = [
        pendingDimensionPoints.current[0],
        pendingDimensionPoints.current[1],
        canvasX,
        canvasY,
      ];
      setDraftDimension([...pendingDimensionPoints.current]);
    }
  };

  const handleMouseUp = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    // End panning
    if (isPanning.current) {
      isPanning.current = false;
      lastPanPoint.current = null;
    }
    
    if (!isDrawing.current) return;
    isDrawing.current = false;
    isInteracting.current = false;
    applyPendingSync();

    if (tool === "dimension" && pendingDimensionPoints.current) {
      const [x1, y1, x2, y2] = pendingDimensionPoints.current;
      if (Math.abs(x2 - x1) > 10 || Math.abs(y2 - y1) > 10) {
        onRequestDimension?.({ x: x1, y: y1 }, { x: x2, y: y2 });
      } else {
        pendingDimensionPoints.current = null;
      }
      setDraftDimension(null);
    }
  };

  const getDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStartZoom = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      if (isDrawing.current) {
        isDrawing.current = false;
        isInteracting.current = false;
        applyPendingSync();
        if (tool === "line") {
          setLines((prev) => prev.slice(0, -1));
        } else if (tool === "rect") {
          setRects((prev) => prev.slice(0, -1));
        } else if (tool === "arrow") {
          setArrows((prev) => prev.slice(0, -1));
        } else if (tool === "dimension") {
          pendingDimensionPoints.current = null;
          setDraftDimension(null);
        }
      }
      if (lastCreatedTextId.current) {
        const textIdToRemove = lastCreatedTextId.current;
        setTexts((prev) => prev.filter((t) => t.id !== textIdToRemove));
        clearSelection();
        handleCancelTextEdit();
        lastCreatedTextId.current = null;
      }
      lastTouchDistance.current = getDistance(e.touches[0], e.touches[1]);
      pinchCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  };

  const handleTouchMoveZoom = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance.current !== null && onZoomChange) {
      e.preventDefault();
      const newDistance = getDistance(e.touches[0], e.touches[1]);
      const scaleChange = newDistance / lastTouchDistance.current;
      const newScale = Math.min(3, Math.max(0.5, scale * scaleChange));
      
      // Update pinch center to current midpoint (focal point follows fingers)
      const currentPinchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const currentPinchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      zoomToPoint(currentPinchX, currentPinchY, newScale);
      lastTouchDistance.current = newDistance;
    }
  };

  const handleTouchEndZoom = (e: React.TouchEvent) => {
    lastTouchDistance.current = null;
    pinchCenter.current = null;
    if (e.touches.length === 0) {
      lastCreatedTextId.current = null;
    }
  };

  const zoomToPoint = (pointerX: number, pointerY: number, newScale: number) => {
    if (!onZoomChange || !containerRef.current) return;
    
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const viewportWidth = containerRect.width;
    const viewportHeight = containerRect.height;
    
    // Pointer position relative to container
    const pointerRelX = pointerX - containerRect.left;
    const pointerRelY = pointerY - containerRect.top;
    
    // Current center offset based on whether scaled content fits in viewport
    const currentScaledW = stageSize.width * scale;
    const currentScaledH = stageSize.height * scale;
    const currentCenterOffsetX = Math.max(0, (viewportWidth - currentScaledW) / 2);
    const currentCenterOffsetY = Math.max(0, (viewportHeight - currentScaledH) / 2);
    
    // Calculate image coordinate under pointer (before zoom)
    // screenPos = centerOffset + panOffset + imagePos * scale
    // imagePos = (screenPos - centerOffset - panOffset) / scale
    const imageX = (pointerRelX - currentCenterOffsetX - panOffset.x) / scale;
    const imageY = (pointerRelY - currentCenterOffsetY - panOffset.y) / scale;
    
    // Calculate new center offset after scale change
    const newScaledW = stageSize.width * newScale;
    const newScaledH = stageSize.height * newScale;
    const newCenterOffsetX = Math.max(0, (viewportWidth - newScaledW) / 2);
    const newCenterOffsetY = Math.max(0, (viewportHeight - newScaledH) / 2);
    
    // Calculate new pan offset to keep same image point under pointer
    // pointerRelX = newCenterOffset + newPanOffset + imageX * newScale
    // newPanOffset = pointerRelX - newCenterOffset - imageX * newScale
    let newPanX = pointerRelX - newCenterOffsetX - imageX * newScale;
    let newPanY = pointerRelY - newCenterOffsetY - imageY * newScale;
    
    // Clamp pan offset within bounds (only needed when scaled content exceeds viewport)
    if (newScaledW > viewportWidth) {
      const maxPanX = newScaledW - viewportWidth;
      newPanX = Math.max(-maxPanX, Math.min(0, newPanX));
    } else {
      newPanX = 0; // Content fits, no pan needed
    }
    
    if (newScaledH > viewportHeight) {
      const maxPanY = newScaledH - viewportHeight;
      newPanY = Math.max(-maxPanY, Math.min(0, newPanY));
    } else {
      newPanY = 0; // Content fits, no pan needed
    }
    
    setPanOffset({ x: newPanX, y: newPanY });
    onZoomChange(newScale);
  };

  const handleDoubleClickZoom = (e: KonvaEventObject<MouseEvent>) => {
    if (tool !== "select" || !onZoomChange) return;
    if (e.target !== e.target.getStage() && e.target.getClassName() !== "Image") return;
    
    const newScale = scale >= 2 ? 1 : Math.min(3, scale + 0.5);
    const evt = e.evt;
    zoomToPoint(evt.clientX, evt.clientY, newScale);
  };

  const handleDoubleTapZoom = (e: KonvaEventObject<TouchEvent>) => {
    if (tool !== "select" || !onZoomChange) return;
    if (e.target !== e.target.getStage() && e.target.getClassName() !== "Image") return;
    
    const newScale = scale >= 2 ? 1 : Math.min(3, scale + 0.5);
    const touch = e.evt.changedTouches?.[0];
    if (touch) {
      zoomToPoint(touch.clientX, touch.clientY, newScale);
    } else {
      onZoomChange(newScale);
    }
  };


  const handleWheelZoom = (e: React.WheelEvent) => {
    if (!onZoomChange) return;
    
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      const newScale = Math.min(3, Math.max(0.5, scale + delta));
      zoomToPoint(e.clientX, e.clientY, newScale);
    }
  };


  const handleDimensionEndpointDrag = (dimId: string, endpointIndex: 0 | 1, newX: number, newY: number) => {
    setDimensions((prev) =>
      prev.map((dim) => {
        if (dim.id !== dimId) return dim;
        const newPoints = [...dim.points];
        if (endpointIndex === 0) {
          newPoints[0] = newX;
          newPoints[1] = newY;
        } else {
          newPoints[2] = newX;
          newPoints[3] = newY;
        }
        return { ...dim, points: newPoints };
      })
    );
  };

  const handleDragEnd = (id: string, type: string, newAttrs: any) => {
    if (type === "line" || type === "arrow" || type === "dimension") {
      const setter = type === "line" ? setLines : type === "arrow" ? setArrows : setDimensions;
      setter((prev: any[]) =>
        prev.map((item) =>
          item.id === id ? { ...item, points: newAttrs.points || item.points } : item
        )
      );
    } else if (type === "rect") {
      setRects((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, x: newAttrs.x, y: newAttrs.y } : item
        )
      );
    } else if (type === "text") {
      setTexts((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, x: newAttrs.x, y: newAttrs.y } : item
        )
      );
    }
  };

  const getElementType = useCallback((id: string): AnnotationElementType => {
    if (lines.some(l => l.id === id)) return "line";
    if (arrows.some(a => a.id === id)) return "arrow";
    if (rects.some(r => r.id === id)) return "rect";
    if (texts.some(t => t.id === id)) return "text";
    if (dimensions.some(d => d.id === id)) return "dimension";
    return null;
  }, [lines, arrows, rects, texts, dimensions]);

  const handleSelect = (id: string, type?: AnnotationElementType) => {
    onSelectId(id);
    const elementType = type || getElementType(id);
    onSelectType?.(elementType);
  };

  const clearSelection = useCallback(() => {
    onSelectId(null);
    onSelectType?.(null);
  }, [onSelectId, onSelectType]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setLines((prev) => prev.filter((item) => item.id !== selectedId));
    setRects((prev) => prev.filter((item) => item.id !== selectedId));
    setArrows((prev) => prev.filter((item) => item.id !== selectedId));
    setTexts((prev) => prev.filter((item) => item.id !== selectedId));
    setDimensions((prev) => prev.filter((item) => item.id !== selectedId));
    clearSelection();
  }, [selectedId, clearSelection]);

  const clearAll = useCallback(() => {
    setLines([]);
    setRects([]);
    setArrows([]);
    setTexts([]);
    setDimensions([]);
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    if (deleteSelectedRef) {
      deleteSelectedRef.current = deleteSelected;
    }
  }, [deleteSelected, deleteSelectedRef]);

  useEffect(() => {
    if (clearAllRef) {
      clearAllRef.current = clearAll;
    }
  }, [clearAll, clearAllRef]);

  // Apply style updates to the selected element in canvas local state
  const applyStyleToSelected = useCallback((styleUpdate: { color?: string; strokeWidth?: number; fontSize?: number }) => {
    if (!selectedId) return;
    
    // Update lines
    setLines(prev => prev.map(line => 
      line.id === selectedId ? { ...line, ...styleUpdate } : line
    ));
    
    // Update arrows
    setArrows(prev => prev.map(arrow => 
      arrow.id === selectedId ? { ...arrow, ...styleUpdate } : arrow
    ));
    
    // Update rects
    setRects(prev => prev.map(rect => 
      rect.id === selectedId ? { ...rect, ...styleUpdate } : rect
    ));
    
    // Update texts
    setTexts(prev => prev.map(text => 
      text.id === selectedId ? { ...text, ...styleUpdate } : text
    ));
    
    // Update dimensions
    setDimensions(prev => prev.map(dim => 
      dim.id === selectedId ? { ...dim, ...styleUpdate } : dim
    ));
  }, [selectedId]);

  useEffect(() => {
    if (applyStyleToSelectedRef) {
      applyStyleToSelectedRef.current = applyStyleToSelected;
    }
  }, [applyStyleToSelected, applyStyleToSelectedRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, deleteSelected]);

  const updateTextContent = (id: string, newText: string) => {
    setTexts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text: newText } : item))
    );
  };

  const scaledWidth = stageSize.width * scale;
  const scaledHeight = stageSize.height * scale;
  
  // Calculate viewport size for centering when not zoomed
  const viewportWidth = containerRef.current?.clientWidth || stageSize.width;
  const viewportHeight = containerRef.current?.clientHeight || stageSize.height;
  
  // Center the content when it fits in viewport (based on scaled size)
  const scaledContentW = stageSize.width * scale;
  const scaledContentH = stageSize.height * scale;
  const centerOffsetX = Math.max(0, (viewportWidth - scaledContentW) / 2);
  const centerOffsetY = Math.max(0, (viewportHeight - scaledContentH) / 2);

  // Show error placeholder if image failed to load
  if (imageLoadError || imageLoadStatus === "failed") {
    return (
      <div
        ref={containerRef}
        className="w-full h-full bg-neutral-900 rounded-lg overflow-hidden relative shadow-inner flex flex-col items-center justify-center text-white"
      >
        <div className="text-center p-4">
          <div className="text-4xl mb-4">⚠️</div>
          <div className="text-lg font-medium mb-2">Image Failed to Load</div>
          <div className="text-sm text-neutral-400 max-w-xs">
            The image could not be displayed. This may be due to a network error or invalid image URL.
          </div>
          <div className="text-xs text-neutral-500 mt-4 font-mono break-all">
            URL: {imageUrl}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-neutral-900 rounded-lg overflow-hidden relative shadow-inner"
      onTouchStart={handleTouchStartZoom}
      onTouchMove={handleTouchMoveZoom}
      onTouchEnd={handleTouchEndZoom}
      onWheel={handleWheelZoom}
    >
        <Stage
          ref={stageRef}
          width={viewportWidth}
          height={viewportHeight}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          onDblClick={handleDoubleClickZoom}
          onDblTap={handleDoubleTapZoom}
        >
        <Layer>
          <Group 
            ref={contentGroupRef}
            x={centerOffsetX + panOffset.x} 
            y={centerOffsetY + panOffset.y}
            scaleX={scale} 
            scaleY={scale}
          >
          {image && (() => {
            const isRotated90or270 = orientationDegrees === 90 || orientationDegrees === 270;
            const imgWidth = isRotated90or270 ? stageSize.height : stageSize.width;
            const imgHeight = isRotated90or270 ? stageSize.width : stageSize.height;
            
            let imgX = 0, imgY = 0;
            if (orientationDegrees === 90) {
              imgX = stageSize.width;
              imgY = 0;
            } else if (orientationDegrees === 180) {
              imgX = stageSize.width;
              imgY = stageSize.height;
            } else if (orientationDegrees === 270) {
              imgX = 0;
              imgY = stageSize.height;
            }
            
            return (
              <KonvaImage 
                image={image} 
                width={imgWidth} 
                height={imgHeight}
                rotation={orientationDegrees}
                x={imgX}
                y={imgY}
              />
            );
          })()}

          {lines.map((line) => (
            <Line
              key={line.id}
              id={line.id}
              points={line.points}
              stroke={line.color}
              strokeWidth={selectedId === line.id ? (line.strokeWidth || DEFAULT_STROKE_WIDTH) + 2 : (line.strokeWidth || DEFAULT_STROKE_WIDTH)}
              hitStrokeWidth={20}
              tension={0}
              lineCap="round"
              lineJoin="round"
              draggable={tool === "select"}
              onClick={() => handleSelect(line.id, "line")}
              onTap={() => handleSelect(line.id, "line")}
              onDragEnd={(e) => {
                const node = e.target as Konva.Line;
                handleDragEnd(line.id, "line", {
                  points: node.points().map((p: number, i: number) =>
                    i % 2 === 0 ? p + node.x() : p + node.y()
                  ),
                });
                node.position({ x: 0, y: 0 });
              }}
            />
          ))}

          {rects.map((rect) => (
            <Rect
              key={rect.id}
              id={rect.id}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              stroke={rect.color}
              strokeWidth={selectedId === rect.id ? (rect.strokeWidth || DEFAULT_STROKE_WIDTH) + 2 : (rect.strokeWidth || DEFAULT_STROKE_WIDTH)}
              hitStrokeWidth={20}
              draggable={tool === "select"}
              onClick={() => handleSelect(rect.id, "rect")}
              onTap={() => handleSelect(rect.id, "rect")}
              onDragEnd={(e) => {
                handleDragEnd(rect.id, "rect", {
                  x: e.target.x(),
                  y: e.target.y(),
                });
              }}
            />
          ))}

          {arrows.map((arrow) => (
            <Arrow
              key={arrow.id}
              id={arrow.id}
              points={arrow.points}
              stroke={arrow.color}
              strokeWidth={selectedId === arrow.id ? (arrow.strokeWidth || DEFAULT_STROKE_WIDTH) + 2 : (arrow.strokeWidth || DEFAULT_STROKE_WIDTH)}
              hitStrokeWidth={20}
              fill={arrow.color}
              pointerLength={10}
              pointerWidth={10}
              draggable={tool === "select"}
              onClick={() => handleSelect(arrow.id, "arrow")}
              onTap={() => handleSelect(arrow.id, "arrow")}
              onDragEnd={(e) => {
                const node = e.target as Konva.Arrow;
                handleDragEnd(arrow.id, "arrow", {
                  points: node.points().map((p: number, i: number) =>
                    i % 2 === 0 ? p + node.x() : p + node.y()
                  ),
                });
                node.position({ x: 0, y: 0 });
              }}
            />
          ))}

          {texts.map((t) => (
            <Group
              key={t.id}
              x={t.x}
              y={t.y}
              draggable={tool === "select"}
              onClick={() => handleSelect(t.id, "text")}
              onTap={() => handleSelect(t.id, "text")}
              onDblClick={() => {
                setEditingTextId(t.id);
                setTextInputValue(t.text);
              }}
              onDblTap={() => {
                setEditingTextId(t.id);
                setTextInputValue(t.text);
              }}
              onDragEnd={(e) => {
                handleDragEnd(t.id, "text", {
                  x: e.target.x(),
                  y: e.target.y(),
                });
              }}
            >
              <Rect
                width={Math.max(60, (t.text?.length || 1) * t.fontSize * 0.6)}
                height={t.fontSize + 8}
                y={-4}
                fill={selectedId === t.id ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.001)"}
                cornerRadius={4}
              />
              <Text
                id={t.id}
                text={t.text || "(empty)"}
                fontSize={t.fontSize}
                fill={t.color}
                fontStyle={selectedId === t.id ? "bold" : "normal"}
                opacity={t.text ? 1 : 0.5}
              />
            </Group>
          ))}

          {draftDimension && (
            (() => {
              const [x1, y1, x2, y2] = draftDimension;
              const angle = Math.atan2(y2 - y1, x2 - x1);
              return (
                <Group>
                  <Line
                    points={draftDimension}
                    stroke={color}
                    strokeWidth={3}
                    lineCap="round"
                    dash={[8, 4]}
                  />
                  <Circle x={x1} y={y1} radius={6} fill={color} opacity={0.7} />
                  <Circle x={x2} y={y2} radius={6} fill={color} opacity={0.7} />
                  <Arrow
                    points={[x1, y1, x1 + 15 * Math.cos(angle), y1 + 15 * Math.sin(angle)]}
                    stroke={color}
                    fill={color}
                    pointerLength={8}
                    pointerWidth={8}
                    opacity={0.7}
                  />
                  <Arrow
                    points={[x2, y2, x2 - 15 * Math.cos(angle), y2 - 15 * Math.sin(angle)]}
                    stroke={color}
                    fill={color}
                    pointerLength={8}
                    pointerWidth={8}
                    opacity={0.7}
                  />
                </Group>
              );
            })()
          )}

          {dimensions.map((dim) => {
            const [x1, y1, x2, y2] = dim.points;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const isSelected = selectedId === dim.id;

            const handleDimensionDblClick = () => {
              onEditDimension?.(dim.id, dim.value, dim.unit, dim.comment || "");
            };
            
            const dimensionText = `${dim.value} ${dim.unit}`;
            const commentText = dim.comment || "";
            
            const dimStrokeWidth = dim.strokeWidth || DEFAULT_STROKE_WIDTH;
            const dimFontSize = dim.fontSize || DEFAULT_FONT_SIZE;
            
            // Get cached side sign or use default
            const cachedSideSign = dimensionSideSignsRef.current.get(dim.id);
            const preferredSideSign = cachedSideSign ?? DEFAULT_DIMENSION_SIDE_SIGN;
            
            // Compute collision-aware layout
            const layout = computeDimensionLayout({
              p1: { x: x1, y: y1 },
              p2: { x: x2, y: y2 },
              strokeWidth: dimStrokeWidth,
              fontSize: dimFontSize,
              labelText: dimensionText,
              commentText: commentText,
              stageBounds: { width: stageSize.width, height: stageSize.height },
              preferredSideSign: preferredSideSign,
            });
            
            // Cache the used side sign for stability during drag
            if (layout.usedSideSign !== cachedSideSign) {
              dimensionSideSignsRef.current.set(dim.id, layout.usedSideSign);
            }

            return (
              <Group
                key={dim.id}
                onClick={() => handleSelect(dim.id, "dimension")}
                onTap={() => handleSelect(dim.id, "dimension")}
                onDblClick={handleDimensionDblClick}
                onDblTap={handleDimensionDblClick}
              >
                <Group
                  draggable={tool === "select" && !isSelected}
                  onDragEnd={(e) => {
                    const dx = e.target.x();
                    const dy = e.target.y();
                    handleDragEnd(dim.id, "dimension", {
                      points: [x1 + dx, y1 + dy, x2 + dx, y2 + dy],
                    });
                    e.target.position({ x: 0, y: 0 });
                  }}
                >
                  <Line
                    points={dim.points}
                    stroke={dim.color}
                    strokeWidth={isSelected ? dimStrokeWidth + 1 : dimStrokeWidth}
                    hitStrokeWidth={20}
                    lineCap="round"
                  />
                  <Arrow
                    points={[x1, y1, x1 + layout.arrowLength * Math.cos(angle), y1 + layout.arrowLength * Math.sin(angle)]}
                    stroke={dim.color}
                    fill={dim.color}
                    strokeWidth={dimStrokeWidth}
                    pointerLength={layout.arrowLength}
                    pointerWidth={layout.arrowWidth}
                  />
                  <Arrow
                    points={[x2, y2, x2 - layout.arrowLength * Math.cos(angle), y2 - layout.arrowLength * Math.sin(angle)]}
                    stroke={dim.color}
                    fill={dim.color}
                    strokeWidth={dimStrokeWidth}
                    pointerLength={layout.arrowLength}
                    pointerWidth={layout.arrowWidth}
                  />
                  <Text
                    x={layout.labelX}
                    y={layout.labelY}
                    text={dimensionText}
                    fontSize={dimFontSize}
                    fill={dim.color}
                    fontStyle="bold"
                  />
                  {commentText && (
                    <Text
                      x={layout.commentX}
                      y={layout.commentY}
                      text={commentText}
                      fontSize={dimFontSize - 2}
                      fill={dim.color}
                    />
                  )}
                </Group>
                {isSelected && tool === "select" && (
                  <>
                    <Circle
                      x={x1}
                      y={y1}
                      radius={layout.capRadius + 4}
                      fill="white"
                      stroke={dim.color}
                      strokeWidth={dimStrokeWidth}
                      draggable
                      onDragMove={(e) => {
                        handleDimensionEndpointDrag(dim.id, 0, e.target.x(), e.target.y());
                      }}
                    />
                    <Circle
                      x={x2}
                      y={y2}
                      radius={layout.capRadius + 4}
                      fill="white"
                      stroke={dim.color}
                      strokeWidth={dimStrokeWidth}
                      draggable
                      onDragMove={(e) => {
                        handleDimensionEndpointDrag(dim.id, 1, e.target.x(), e.target.y());
                      }}
                    />
                  </>
                )}
                {!isSelected && (
                  <>
                    <Circle x={x1} y={y1} radius={layout.capRadius} fill={dim.color} />
                    <Circle x={x2} y={y2} radius={layout.capRadius} fill={dim.color} />
                  </>
                )}
              </Group>
            );
          })}
          </Group>
        </Layer>
      </Stage>
      <Dialog open={!!editingTextId || !!pendingTextPosition} onOpenChange={(open) => {
        if (!open) handleCancelTextEdit();
      }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-text-input">
          <DialogHeader>
            <DialogTitle>{editingTextId ? 'Edit Text' : 'Add Text'}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              ref={textInputRef}
              value={textInputValue}
              onChange={(e) => setTextInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTextInputConfirm();
                }
              }}
              placeholder="Enter text annotation..."
              autoFocus
              data-testid="input-text-annotation"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancelTextEdit} data-testid="button-cancel-text">
              Cancel
            </Button>
            <Button onClick={handleTextInputConfirm} data-testid="button-confirm-text">
              {editingTextId ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
