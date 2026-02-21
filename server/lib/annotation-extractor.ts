/**
 * Annotation Extractor Utility
 * Parses photo annotationData and extracts dimensions and text notes
 * with stable callout IDs (A, B, C...) for export purposes.
 */

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

export interface TextAnnotation {
  id: string;
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface AnnotationData {
  lines?: unknown[];
  rects?: unknown[];
  arrows?: unknown[];
  texts?: TextAnnotation[];
  dimensions?: DimensionAnnotation[];
}

export interface ExtractedDimension {
  calloutId: string;
  value: string;
  numericValue: number | null;
  unit: string;
  comment: string;
}

export interface ExtractedNote {
  calloutId: string;
  text: string;
}

export interface AnnotationCounts {
  rectangles: number;
  arrows: number;
  lines: number;
  texts: number;
  dimensions: number;
}

export interface ExtractedAnnotations {
  dimensions: ExtractedDimension[];
  notes: ExtractedNote[];
  dimensionCount: number;
  noteCount: number;
  dimensionsSummary: string;
  notesSummary: string;
  toolCounts: AnnotationCounts;
}

const CALLOUT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_SUMMARY_LENGTH = 200;

function generateCalloutId(index: number): string {
  if (index < 26) {
    return CALLOUT_LETTERS[index];
  }
  const firstLetter = Math.floor(index / 26) - 1;
  const secondLetter = index % 26;
  if (firstLetter < 0) {
    return CALLOUT_LETTERS[secondLetter];
  }
  return CALLOUT_LETTERS[firstLetter] + CALLOUT_LETTERS[secondLetter];
}

function parseNumericValue(value: string): number | null {
  if (!value || typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d.\-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function buildDimensionsSummary(dimensions: ExtractedDimension[]): string {
  if (dimensions.length === 0) return "";
  
  const parts: string[] = [];
  for (const dim of dimensions) {
    const valueStr = dim.value ? `${dim.value}${dim.unit ? " " + dim.unit : ""}` : "N/A";
    parts.push(`${dim.calloutId}: ${valueStr}`);
  }
  
  let summary = parts.join("; ");
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = summary.slice(0, MAX_SUMMARY_LENGTH - 3) + "...";
  }
  return summary;
}

function buildNotesSummary(notes: ExtractedNote[]): string {
  if (notes.length === 0) return "";
  
  const parts: string[] = [];
  for (let i = 0; i < notes.length; i++) {
    const noteText = notes[i].text.length > 50 
      ? notes[i].text.slice(0, 47) + "..." 
      : notes[i].text;
    parts.push(`Note ${i + 1}: ${noteText}`);
  }
  
  let summary = parts.join("; ");
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = summary.slice(0, MAX_SUMMARY_LENGTH - 3) + "...";
  }
  return summary;
}

export function extractAnnotationSummary(annotationData: unknown): ExtractedAnnotations {
  const result: ExtractedAnnotations = {
    dimensions: [],
    notes: [],
    dimensionCount: 0,
    noteCount: 0,
    dimensionsSummary: "",
    notesSummary: "",
    toolCounts: {
      rectangles: 0,
      arrows: 0,
      lines: 0,
      texts: 0,
      dimensions: 0,
    },
  };

  if (!annotationData || typeof annotationData !== "object") {
    return result;
  }

  const data = annotationData as AnnotationData;
  
  // Count annotation tools
  result.toolCounts.rectangles = Array.isArray(data.rects) ? data.rects.length : 0;
  result.toolCounts.arrows = Array.isArray(data.arrows) ? data.arrows.length : 0;
  result.toolCounts.lines = Array.isArray(data.lines) ? data.lines.length : 0;
  result.toolCounts.texts = Array.isArray(data.texts) ? data.texts.length : 0;
  result.toolCounts.dimensions = Array.isArray(data.dimensions) ? data.dimensions.length : 0;

  if (Array.isArray(data.dimensions) && data.dimensions.length > 0) {
    const sortedDimensions = [...data.dimensions].sort((a, b) => {
      return (a.id || "").localeCompare(b.id || "");
    });

    for (let i = 0; i < sortedDimensions.length; i++) {
      const dim = sortedDimensions[i];
      result.dimensions.push({
        calloutId: generateCalloutId(i),
        value: dim.value || "",
        numericValue: parseNumericValue(dim.value || ""),
        unit: dim.unit || "",
        comment: dim.comment || "",
      });
    }
    result.dimensionCount = result.dimensions.length;
  }

  if (Array.isArray(data.texts) && data.texts.length > 0) {
    const sortedNotes = [...data.texts].sort((a, b) => {
      return (a.id || "").localeCompare(b.id || "");
    });

    for (let i = 0; i < sortedNotes.length; i++) {
      const note = sortedNotes[i];
      result.notes.push({
        calloutId: generateCalloutId(i),
        text: note.text || "",
      });
    }
    result.noteCount = result.notes.length;
  }

  result.dimensionsSummary = buildDimensionsSummary(result.dimensions);
  result.notesSummary = buildNotesSummary(result.notes);

  return result;
}

export const parseAnnotationData = extractAnnotationSummary;

export interface PhotoAnnotationExport {
  photoId: number;
  filename: string;
  areaName: string;
  photoNotes: string;
  annotations: ExtractedAnnotations;
}

export function extractPhotoAnnotations(
  photo: {
    id: number;
    filename: string;
    areaName?: string | null;
    notes?: string | null;
    annotationData?: unknown;
  }
): PhotoAnnotationExport {
  return {
    photoId: photo.id,
    filename: photo.filename,
    areaName: photo.areaName || "",
    photoNotes: photo.notes || "",
    annotations: extractAnnotationSummary(photo.annotationData),
  };
}
