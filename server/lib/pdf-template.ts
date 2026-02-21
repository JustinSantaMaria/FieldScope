/**
 * PDF Template Engine for FieldScope v2
 * Implements proper buffered page numbering, no extra pages,
 * and correct text measurement for card layouts.
 */

import PDFDocument from "pdfkit";
import path from "path";
import type { ExtractedDimension, ExtractedNote, AnnotationCounts } from "./annotation-extractor";
import { buildPhotoExportName } from "@shared/schema";

// Page Layout Constants (US Letter 8.5 x 11)
export const PAGE = {
  WIDTH: 612,
  HEIGHT: 792,
  MARGIN: 43, // 0.6 inches
  FOOTER_RESERVE: 40, // Space reserved for footer
  HEADER_HEIGHT: 50,
  CONTENT_START_Y: 60,
};

export const CONTENT_WIDTH = PAGE.WIDTH - 2 * PAGE.MARGIN;
export const CONTENT_BOTTOM = PAGE.HEIGHT - PAGE.FOOTER_RESERVE - 10;

// Default FieldScope Colors
export const FIELDSCOPE_COLORS = {
  primary: "#0F172A",
  secondary: "#14B8A6",
  accent1: "#60A5FA",
  accent2: "#F59E0B",
  neutral: "#94A3B8",
};

// Typography
export const FONT_SIZES = {
  title: 24,
  sectionHeader: 14,
  subsectionHeader: 11,
  body: 9,
  small: 8,
  tiny: 7,
};

// Spacing
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

// Theme tokens helper - derives brand-safe colors from branding
export interface ThemeTokens {
  accent: string;
  accentLight: string;  // Very light tint for backgrounds
  border: string;
  headerFill: string;   // Table header fill
  zebraFill: string;    // Alternating row fill
  rowWhite: string;     // White row fill
  cardTitleBg: string;  // Card title background
  cardTitleFg: string;  // Card title text
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const { r, g, b } = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Calculate relative luminance per WCAG 2.1
function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const { r, g, b } = rgb;
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// Calculate contrast ratio between two colors
function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Check if color has sufficient contrast with white (4.5:1 for normal text)
function hasGoodContrastWithWhite(hex: string): boolean {
  return getContrastRatio(hex, "#FFFFFF") >= 4.5;
}

function blendWithWhite(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#F9FAFB";
  const { r, g, b } = rgb;
  const blend = (c: number) => Math.round(c * opacity + 255 * (1 - opacity));
  const result = `#${blend(r).toString(16).padStart(2, "0")}${blend(g).toString(16).padStart(2, "0")}${blend(b).toString(16).padStart(2, "0")}`;
  return result;
}

export function getThemeTokens(branding: EffectiveBranding): ThemeTokens {
  const neutralAccent = "#4B5563"; // Gray-600 - always safe
  const neutralLight = "#F3F4F6";
  const neutralZebra = "#F9FAFB";
  
  // Pick accent: must have WCAG AA contrast (4.5:1) with white for text use
  let accent = neutralAccent;
  if (hasGoodContrastWithWhite(branding.colorPrimary)) {
    accent = branding.colorPrimary;
  } else if (hasGoodContrastWithWhite(branding.colorSecondary)) {
    accent = branding.colorSecondary;
  }
  
  // For backgrounds, blend accent with white at low opacity
  const accentLight = blendWithWhite(accent, 0.06);
  const cardTitleBg = blendWithWhite(accent, 0.08);
  
  // Card title foreground: Use accent if it has enough contrast with the blended bg
  // Otherwise fall back to dark neutral text
  const cardTitleFg = getContrastRatio(accent, cardTitleBg) >= 4.5 ? accent : "#374151";

  return {
    accent,
    accentLight,
    border: "#E5E7EB",
    headerFill: neutralLight,
    zebraFill: neutralZebra,
    rowWhite: "#FFFFFF",
    cardTitleBg,
    cardTitleFg,
  };
}

// Logo Container Sizes
export const LOGO_CONTAINER = {
  cover: { width: 158, height: 72 },
  header: { width: 97, height: 37 },
  padding: 8,
  borderRadius: 4,
  borderColor: "#E5E7EB",
};

// Custom Fonts
const CUSTOM_FONTS = ["Open Sans", "Roboto", "Lato", "Montserrat", "Playfair Display", "Source Serif", "Inter"] as const;
type CustomFont = (typeof CUSTOM_FONTS)[number];

export interface PdfFontFamily {
  regular: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

export interface EffectiveBranding {
  businessName: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoUrl: string | null;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent1: string;
  colorAccent2: string;
  colorNeutral: string;
  reportFont: string;
  isFieldScopeBranding: boolean;
}

export interface ProjectData {
  id: number;
  surveyId: string;
  clientName: string;
  siteName: string;
  address: string | null;
  notes?: string | null;
  createdAt: Date | null;
}

export interface AreaData {
  id: number;
  name: string;
  projectId: number;
}

export interface PhotoData {
  id: number;
  areaId: number;
  areaName: string;
  filename: string;
  originalUrl: string;
  canonicalUrl: string | null;
  annotatedUrl: string | null;
  annotationData: unknown;
  interiorExterior: string | null;
  illuminated: string | null;
  singleDoubleSided: string | null;
  geoLat: number | null;
  geoLng: number | null;
  timestamp: Date | null;
  notes: string | null;
  wallTypeTags: string[] | null;
  customTags: string[] | null;
}

export function getPhotoExportName(photo: PhotoData, project: ProjectData, seq?: number): string {
  return buildPhotoExportName({
    locationType: photo.interiorExterior,
    seq: seq ?? photo.id,
    clientName: project.clientName,
    siteName: project.siteName,
    areaName: photo.areaName,
  });
}

export interface AreaStats {
  total: number;
  int: number;
  ext: number;
  veh: number;
  annotated: number;
}

export interface AppendixItem {
  photoId: number;
  displayName: string;
  areaName: string;
  dimensions: ExtractedDimension[];
  notes: ExtractedNote[];
}

export interface PdfContext {
  doc: PDFKit.PDFDocument;
  fonts: PdfFontFamily;
  branding: EffectiveBranding;
  project: ProjectData;
  generatedDate: string;
  surveyDate: string;
  preparedByName: string | null;
  logoBuffer: Buffer | null;
  sectionLabels: Map<number, string>; // Track section label per page
  currentSectionLabel: string; // Track current section for page breaks
  seqMap: Map<number, number>; // photo.id -> per-location-type sequence number
  totalPages?: number; // Pre-computed total pages for streaming mode
  pageNumber?: number; // Current page number (1-indexed) for streaming mode
  streamingMode?: boolean; // True when using bufferPages: false
  displaySiteName?: string; // For PDF titles/headers only (includes part label), photo names use project.siteName
}

// Font registration and management
function isCustomFont(font: string): font is CustomFont {
  return CUSTOM_FONTS.includes(font as CustomFont);
}

function getCustomFontPaths(fontName: CustomFont): PdfFontFamily {
  const fontDir = path.join(process.cwd(), "server", "fonts");
  const fontMap: Record<CustomFont, { file: string; variants: { regular: string; bold: string; italic: string; boldItalic: string } }> = {
    "Open Sans": { file: "OpenSans", variants: { regular: "Regular", bold: "Bold", italic: "Italic", boldItalic: "BoldItalic" } },
    Roboto: { file: "Roboto", variants: { regular: "Regular", bold: "Bold", italic: "Italic", boldItalic: "BoldItalic" } },
    Lato: { file: "Lato", variants: { regular: "Regular", bold: "Bold", italic: "Italic", boldItalic: "BoldItalic" } },
    Montserrat: { file: "Montserrat", variants: { regular: "Regular", bold: "Bold", italic: "Italic", boldItalic: "BoldItalic" } },
    "Playfair Display": { file: "PlayfairDisplay", variants: { regular: "Regular", bold: "Bold", italic: "Italic", boldItalic: "BoldItalic" } },
    "Source Serif": { file: "SourceSerifPro", variants: { regular: "Regular", bold: "Bold", italic: "Italic", boldItalic: "BoldItalic" } },
    Inter: { file: "Inter", variants: { regular: "Regular", bold: "Bold", italic: "Regular", boldItalic: "Bold" } },
  };

  const font = fontMap[fontName];
  return {
    regular: path.join(fontDir, `${font.file}-${font.variants.regular}.ttf`),
    bold: path.join(fontDir, `${font.file}-${font.variants.bold}.ttf`),
    italic: path.join(fontDir, `${font.file}-${font.variants.italic}.ttf`),
    boldItalic: path.join(fontDir, `${font.file}-${font.variants.boldItalic}.ttf`),
  };
}

function registerCustomFonts(doc: PDFKit.PDFDocument, fontName: CustomFont): PdfFontFamily {
  const paths = getCustomFontPaths(fontName);
  const baseName = fontName.replace(/\s+/g, "");

  doc.registerFont(`${baseName}-Regular`, paths.regular);
  doc.registerFont(`${baseName}-Bold`, paths.bold);
  doc.registerFont(`${baseName}-Italic`, paths.italic);
  doc.registerFont(`${baseName}-BoldItalic`, paths.boldItalic);

  return {
    regular: `${baseName}-Regular`,
    bold: `${baseName}-Bold`,
    italic: `${baseName}-Italic`,
    boldItalic: `${baseName}-BoldItalic`,
  };
}

export function getPdfFontFamily(baseFont: string, doc?: PDFKit.PDFDocument): PdfFontFamily {
  if (isCustomFont(baseFont) && doc) {
    return registerCustomFonts(doc, baseFont);
  }

  switch (baseFont) {
    case "Times-Roman":
      return { regular: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic", boldItalic: "Times-BoldItalic" };
    case "Courier":
      return { regular: "Courier", bold: "Courier-Bold", italic: "Courier-Oblique", boldItalic: "Courier-BoldOblique" };
    case "Helvetica":
    default:
      return { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique", boldItalic: "Helvetica-BoldOblique" };
  }
}

// Helper to check if we need a new page (does NOT add one)
function needsNewPage(ctx: PdfContext, neededHeight: number): boolean {
  return ctx.doc.y + neededHeight > CONTENT_BOTTOM;
}

// Draw header inline (for streaming mode)
function drawInlineHeader(ctx: PdfContext, sectionLabel: string): void {
  const { doc, fonts, branding, project, logoBuffer } = ctx;
  const headerY = 15;
  const lineY = PAGE.HEADER_HEIGHT;
  // Use displaySiteName for headers (may include part label), fallback to project.siteName
  const displaySite = ctx.displaySiteName || project.siteName;

  doc.save();

  // Logo container on left (if logo exists)
  if (logoBuffer) {
    drawLogoContainer(ctx, PAGE.MARGIN, headerY, LOGO_CONTAINER.header.width, LOGO_CONTAINER.header.height);
  }

  // Project title - calculate available width and truncate
  const textX = logoBuffer ? PAGE.MARGIN + LOGO_CONTAINER.header.width + SPACING.md : PAGE.MARGIN;
  const textWidth = PAGE.WIDTH - textX - PAGE.MARGIN - (sectionLabel ? 85 : 0);

  // Main title line
  doc.fontSize(FONT_SIZES.body).font(fonts.bold).fillColor("#1F2937");
  const titleText = truncateToWidth(doc, `${project.clientName} - ${displaySite}`, textWidth);
  doc.text(titleText, textX, headerY + 5, { width: textWidth, lineBreak: false });

  // Subtitle line
  doc.fontSize(FONT_SIZES.small).font(fonts.regular).fillColor("#6B7280");
  const subtitleText = truncateToWidth(doc, `${project.clientName} | ${displaySite}`, textWidth);
  doc.text(subtitleText, textX, headerY + 18, { width: textWidth, lineBreak: false });

  // Section label on right
  if (sectionLabel) {
    doc.fontSize(FONT_SIZES.small).font(fonts.regular).fillColor("#6B7280");
    doc.text(sectionLabel, PAGE.WIDTH - PAGE.MARGIN - 80, headerY + 10, { width: 80, align: "right", lineBreak: false });
  }

  // Accent line under header
  const lineColor = branding.isFieldScopeBranding ? "#E5E7EB" : branding.colorSecondary;
  doc.strokeColor(lineColor).lineWidth(3);
  doc.moveTo(PAGE.MARGIN, lineY).lineTo(PAGE.WIDTH - PAGE.MARGIN, lineY).stroke();

  doc.restore();
}

// Draw footer inline (for streaming mode)
function drawInlineFooter(ctx: PdfContext): void {
  const { doc, fonts, branding } = ctx;
  const pageNumber = ctx.pageNumber || 1;
  const totalPages = ctx.totalPages || 1;

  doc.save();

  // Use per-page margins
  const marginL = doc.page.margins.left;
  const marginR = doc.page.margins.right;
  const marginB = doc.page.margins.bottom;
  const pageW = doc.page.width;
  const pageH = doc.page.height;

  const contentW = pageW - marginL - marginR;

  // Set footer font BEFORE computing line height
  doc.fontSize(FONT_SIZES.small).font(fonts.regular).fillColor("#6B7280");

  // SAFE Y: maxY is the lowest point that will NOT force a new page
  const maxY = pageH - marginB;
  const footerTextH = doc.currentLineHeight(true);
  const footerY = maxY - footerTextH;
  const footerLineY = footerY - 10;

  const pageNumWidth = 75;
  const gap = 10;
  const footerTextMaxWidth = contentW - pageNumWidth - gap;

  // Divider line
  doc.strokeColor("#E5E7EB").lineWidth(0.5);
  doc.moveTo(marginL, footerLineY).lineTo(pageW - marginR, footerLineY).stroke();

  // Left: Company info - truncate to prevent wrap
  const footerParts: string[] = [];
  if (branding.businessName) footerParts.push(branding.businessName);
  if (branding.website) footerParts.push(branding.website);
  if (branding.email) footerParts.push(branding.email);
  if (branding.phone) footerParts.push(branding.phone);

  const rawFooterText = footerParts.join(" \u2022 ");
  const truncatedFooter = truncateToWidth(doc, rawFooterText, footerTextMaxWidth);

  doc.text(truncatedFooter, marginL, footerY, {
    width: footerTextMaxWidth,
    lineBreak: false,
  });

  // Right: Page number
  const pageText = `Page ${pageNumber} of ${totalPages}`;
  doc.text(pageText, pageW - marginR - pageNumWidth, footerY, {
    width: pageNumWidth,
    align: "right",
    lineBreak: false,
  });

  doc.restore();
}

// Add a new page for content
// In streaming mode (bufferPages: false), draws header/footer inline
// In buffered mode, header/footer are added in finalizePages()
export function addContentPage(ctx: PdfContext, sectionLabel?: string): void {
  ctx.doc.addPage();
  
  // Increment page number for streaming mode
  if (ctx.streamingMode) {
    ctx.pageNumber = (ctx.pageNumber || 0) + 1;
  }
  
  // Use provided label, or fall back to current section label for continued pages
  const label = sectionLabel || ctx.currentSectionLabel;
  if (sectionLabel) {
    ctx.currentSectionLabel = sectionLabel;
  }
  
  // For buffered mode, track section labels for finalize pass
  if (!ctx.streamingMode) {
    const pageIndex = ctx.doc.bufferedPageRange().count - 1;
    if (label) {
      ctx.sectionLabels.set(pageIndex, label);
    }
  }
  
  // In streaming mode, draw header/footer inline (except cover page)
  if (ctx.streamingMode && ctx.pageNumber && ctx.pageNumber > 1) {
    drawInlineHeader(ctx, label || "");
  }
  
  // Always draw footer in streaming mode (including cover page)
  if (ctx.streamingMode) {
    drawInlineFooter(ctx);
  }
  
  ctx.doc.y = PAGE.CONTENT_START_Y;
}

// Layout Helpers
export function drawCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    fill?: string;
    stroke?: string;
    radius?: number;
  } = {}
): void {
  const { fill = "#FFFFFF", stroke = "#E5E7EB", radius = 4 } = options;

  doc.save();
  doc.roundedRect(x, y, width, height, radius);
  doc.fillColor(fill).fill();
  doc.roundedRect(x, y, width, height, radius);
  doc.strokeColor(stroke).lineWidth(1).stroke();
  doc.restore();
}

export function drawLogoContainer(
  ctx: PdfContext,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const { doc, logoBuffer } = ctx;
  const padding = LOGO_CONTAINER.padding;

  doc.save();
  doc.roundedRect(x, y, width, height, LOGO_CONTAINER.borderRadius);
  doc.fillColor("#FFFFFF").fill();
  doc.roundedRect(x, y, width, height, LOGO_CONTAINER.borderRadius);
  doc.strokeColor(LOGO_CONTAINER.borderColor).lineWidth(1).stroke();
  doc.restore();

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, x + padding, y + padding, {
        fit: [width - padding * 2, height - padding * 2],
        align: "center",
        valign: "center",
      });
    } catch (err) {
      console.error("[PDF] Failed to embed logo:", err);
    }
  }
}

export function drawKpiCard(
  ctx: PdfContext,
  x: number,
  y: number,
  width: number,
  height: number,
  value: string | number,
  label: string
): void {
  const { doc, fonts, branding } = ctx;

  drawCard(doc, x, y, width, height, { fill: "#F9FAFB", stroke: "#E5E7EB" });

  doc.save();
  doc.fontSize(28).font(fonts.bold).fillColor(branding.colorPrimary);
  doc.text(String(value), x, y + 15, { width, align: "center", lineBreak: false });

  doc.fontSize(FONT_SIZES.small).font(fonts.regular).fillColor("#6B7280");
  doc.text(label, x, y + height - 22, { width, align: "center", lineBreak: false });
  doc.restore();
}

export function drawChip(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  text: string,
  options: { bg?: string; fg?: string; fonts: PdfFontFamily }
): number {
  const { bg = "#E5E7EB", fg = "#374151", fonts } = options;
  const padding = 4;
  const fontSize = 7;

  doc.fontSize(fontSize).font(fonts.regular);
  const textWidth = doc.widthOfString(text);
  const chipWidth = textWidth + padding * 2;
  const chipHeight = 14;

  doc.save();
  doc.roundedRect(x, y, chipWidth, chipHeight, 3);
  doc.fillColor(bg).fill();
  doc.fillColor(fg);
  doc.text(text, x + padding, y + 3, { lineBreak: false });
  doc.restore();

  return chipWidth;
}

// Key-value row helper with proper height measurement
function drawKeyValueRow(
  doc: PDFKit.PDFDocument,
  fonts: PdfFontFamily,
  x: number,
  y: number,
  label: string,
  value: string,
  labelWidth: number,
  valueWidth: number
): number {
  doc.save();
  doc.fontSize(FONT_SIZES.body).font(fonts.bold).fillColor("#6B7280");
  doc.text(label, x, y, { width: labelWidth, lineBreak: false });
  
  doc.font(fonts.regular).fillColor("#374151");
  const valueHeight = doc.heightOfString(value, { width: valueWidth });
  doc.text(value, x + labelWidth, y, { width: valueWidth, lineBreak: false });
  doc.restore();
  
  return Math.max(12, valueHeight + 2);
}

// Cover Page
export function renderCoverPage(ctx: PdfContext): void {
  const { doc, fonts, branding, project, surveyDate, generatedDate, logoBuffer } = ctx;

  addContentPage(ctx);
  ctx.sectionLabels.set(0, "Cover");

  const sectionColor = branding.colorPrimary;
  let yPos = 50;

  // Logo container at top
  if (logoBuffer) {
    const logoX = (PAGE.WIDTH - LOGO_CONTAINER.cover.width) / 2;
    drawLogoContainer(ctx, logoX, yPos, LOGO_CONTAINER.cover.width, LOGO_CONTAINER.cover.height);
    yPos += LOGO_CONTAINER.cover.height + SPACING.xl;
  } else {
    doc.fontSize(16).font(fonts.bold).fillColor(branding.colorPrimary);
    doc.text(branding.businessName, PAGE.MARGIN, yPos, { width: CONTENT_WIDTH, align: "center", lineBreak: false });
    yPos += 30;
  }

  // Main title
  doc.fontSize(FONT_SIZES.title).font(fonts.bold).fillColor(sectionColor);
  doc.text("Client Survey Report", PAGE.MARGIN, yPos, { width: CONTENT_WIDTH, align: "center", lineBreak: false });
  yPos += 35;

  // Project name subtitle - use displaySiteName for cover (may include part label)
  const displaySite = ctx.displaySiteName || project.siteName;
  doc.fontSize(16).font(fonts.regular).fillColor("#4B5563");
  doc.text(`${project.clientName} - ${displaySite}`, PAGE.MARGIN, yPos, { width: CONTENT_WIDTH, align: "center", lineBreak: false });
  yPos += 50;

  // Two-column layout for Project details and Dates
  const colWidth = (CONTENT_WIDTH - SPACING.lg) / 2;
  const cardPadding = SPACING.md;
  const labelWidth = 70;
  const leftValueWidth = colWidth - labelWidth - cardPadding * 2;
  const rightValueWidth = colWidth - 90 - cardPadding * 2;

  // Calculate left card height based on content
  doc.fontSize(FONT_SIZES.body).font(fonts.regular);
  const addressText = project.address || "Not specified";
  const addressHeight = doc.heightOfString(addressText, { width: leftValueWidth });
  const leftCardContentHeight = 20 + 14 * 3 + Math.max(14, addressHeight + 2) + 14 + cardPadding;
  const leftCardHeight = Math.max(120, leftCardContentHeight);

  // Right card height
  const rightCardHeight = 100;
  const cardHeight = Math.max(leftCardHeight, rightCardHeight);

  // Left card: Project details
  drawCard(doc, PAGE.MARGIN, yPos, colWidth, cardHeight);

  let leftY = yPos + cardPadding;
  doc.fontSize(FONT_SIZES.subsectionHeader).font(fonts.bold).fillColor(sectionColor);
  doc.text("Project details", PAGE.MARGIN + cardPadding, leftY, { lineBreak: false });
  leftY += 20;

  // Client
  leftY += drawKeyValueRow(doc, fonts, PAGE.MARGIN + cardPadding, leftY, "Client:", project.clientName, labelWidth, leftValueWidth);
  // Site
  leftY += drawKeyValueRow(doc, fonts, PAGE.MARGIN + cardPadding, leftY, "Site:", project.siteName, labelWidth, leftValueWidth);
  // Address (may wrap)
  leftY += drawKeyValueRow(doc, fonts, PAGE.MARGIN + cardPadding, leftY, "Address:", addressText, labelWidth, leftValueWidth);
  // Project ID
  leftY += drawKeyValueRow(doc, fonts, PAGE.MARGIN + cardPadding, leftY, "Project ID:", project.surveyId, labelWidth, leftValueWidth);

  // Right card: Dates
  const rightX = PAGE.MARGIN + colWidth + SPACING.lg;
  drawCard(doc, rightX, yPos, colWidth, cardHeight);

  let rightY = yPos + cardPadding;
  doc.fontSize(FONT_SIZES.subsectionHeader).font(fonts.bold).fillColor(sectionColor);
  doc.text("Dates", rightX + cardPadding, rightY, { lineBreak: false });
  rightY += 20;

  rightY += drawKeyValueRow(doc, fonts, rightX + cardPadding, rightY, "Survey date:", surveyDate, 90, rightValueWidth);
  rightY += drawKeyValueRow(doc, fonts, rightX + cardPadding, rightY, "Generated:", generatedDate, 90, rightValueWidth);

  yPos += cardHeight + SPACING.xl;

  // Notes/Scope section (if project has notes)
  if (project.notes) {
    const notesWidth = CONTENT_WIDTH - SPACING.md * 2;
    const notesHeight = Math.max(80, doc.heightOfString(project.notes, { width: notesWidth }) + 40);
    drawCard(doc, PAGE.MARGIN, yPos, CONTENT_WIDTH, notesHeight);

    doc.fontSize(FONT_SIZES.subsectionHeader).font(fonts.bold).fillColor(sectionColor);
    doc.text("Notes / Scope", PAGE.MARGIN + SPACING.md, yPos + SPACING.md, { lineBreak: false });

    doc.fontSize(FONT_SIZES.body).font(fonts.regular).fillColor("#374151");
    // Notes content uses height constraint to prevent overflow - intentionally may wrap within card
    const truncatedNotes = project.notes.length > 400 ? project.notes.slice(0, 397) + "..." : project.notes;
    doc.text(truncatedNotes, PAGE.MARGIN + SPACING.md, yPos + 28, { width: notesWidth, height: 60, ellipsis: true });
  }

  ctx.doc.y = yPos;
}

// Project Summary Page
export function renderSummaryPage(
  ctx: PdfContext,
  areas: AreaData[],
  areaStatsMap: Map<number, AreaStats>,
  totals: { photos: number; int: number; ext: number; veh: number; annotated: number; missingDetails: number }
): void {
  addContentPage(ctx, "Project Summary");

  const { doc, fonts, branding } = ctx;
  const sectionColor = branding.colorPrimary;

  // Section title
  doc.fontSize(FONT_SIZES.sectionHeader).font(fonts.bold).fillColor(sectionColor);
  doc.text("Counts", PAGE.MARGIN, ctx.doc.y, { lineBreak: false });
  ctx.doc.y += 25;

  // KPI Cards Grid (4 per row, 2 rows)
  const cardWidth = (CONTENT_WIDTH - SPACING.md * 3) / 4;
  const cardHeight = 70;
  const kpiData = [
    { value: areas.length, label: "Total Areas" },
    { value: totals.photos, label: "Total Photos" },
    { value: totals.int, label: "Interior (INT)" },
    { value: totals.ext, label: "Exterior (EXT)" },
    { value: totals.veh, label: "Vehicle (VEH)" },
    { value: totals.annotated, label: "Annotated Photos" },
    { value: totals.missingDetails, label: "Missing Details" },
  ];

  let cardX = PAGE.MARGIN;
  let cardY = ctx.doc.y;

  kpiData.forEach((kpi, idx) => {
    drawKpiCard(ctx, cardX, cardY, cardWidth, cardHeight, kpi.value, kpi.label);
    cardX += cardWidth + SPACING.md;

    if ((idx + 1) % 4 === 0) {
      cardX = PAGE.MARGIN;
      cardY += cardHeight + SPACING.md;
    }
  });

  ctx.doc.y = cardY + cardHeight + SPACING.xl;

  // Area Index section with accent underline
  const theme = getThemeTokens(branding);
  doc.fontSize(FONT_SIZES.sectionHeader).font(fonts.bold).fillColor(sectionColor);
  doc.text("Area Index", PAGE.MARGIN, ctx.doc.y, { lineBreak: false });
  const titleWidth = doc.widthOfString("Area Index");
  doc.strokeColor(theme.accent).lineWidth(2);
  doc.moveTo(PAGE.MARGIN, ctx.doc.y + 16).lineTo(PAGE.MARGIN + titleWidth + 8, ctx.doc.y + 16).stroke();
  ctx.doc.y += 22;

  // Table header
  const tableX = PAGE.MARGIN;
  const colWidths = [CONTENT_WIDTH * 0.40, CONTENT_WIDTH * 0.12, CONTENT_WIDTH * 0.12, CONTENT_WIDTH * 0.12, CONTENT_WIDTH * 0.12, CONTENT_WIDTH * 0.12];
  const rowHeight = 22;

  const drawTableHeader = () => {
    const headerY = ctx.doc.y;
    doc.fillColor(theme.headerFill).rect(tableX, headerY, CONTENT_WIDTH, rowHeight).fill();
    doc.strokeColor(theme.border).lineWidth(0.5).rect(tableX, headerY, CONTENT_WIDTH, rowHeight).stroke();

    doc.fontSize(FONT_SIZES.small).font(fonts.bold).fillColor("#374151");
    const headers = ["Area", "Photos", "INT", "EXT", "VEH", "Annotated"];
    let hx = tableX + 6;
    headers.forEach((header, i) => {
      const align = i === 0 ? "left" : "center";
      doc.text(header, hx, headerY + 6, { width: colWidths[i] - 12, align, lineBreak: false });
      hx += colWidths[i];
    });
    ctx.doc.y = headerY + rowHeight;
  };

  drawTableHeader();

  // Table rows
  doc.fontSize(FONT_SIZES.body).font(fonts.regular);

  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];
    const stats = areaStatsMap.get(area.id) || { total: 0, int: 0, ext: 0, veh: 0, annotated: 0 };

    // Check for page break
    if (needsNewPage(ctx, rowHeight + 30)) {
      addContentPage(ctx, "Project Summary");
      drawTableHeader();
      doc.fontSize(FONT_SIZES.body).font(fonts.regular);
    }

    const rowY = ctx.doc.y;

    // Zebra striping
    const rowBg = i % 2 === 0 ? theme.rowWhite : theme.zebraFill;
    doc.fillColor(rowBg).rect(tableX, rowY, CONTENT_WIDTH, rowHeight).fill();
    doc.strokeColor(theme.border).lineWidth(0.5).rect(tableX, rowY, CONTENT_WIDTH, rowHeight).stroke();

    doc.fillColor("#374151");
    let rx = tableX + 6;
    const rowData = [area.name, String(stats.total), String(stats.int), String(stats.ext), String(stats.veh), String(stats.annotated)];
    rowData.forEach((val, vi) => {
      const align = vi === 0 ? "left" : "center";
      doc.text(val, rx, rowY + 6, { width: colWidths[vi] - 12, align, lineBreak: false });
      rx += colWidths[vi];
    });

    ctx.doc.y += rowHeight;
  }

  // Legend
  ctx.doc.y += SPACING.md;
  doc.fontSize(FONT_SIZES.tiny).font(fonts.italic).fillColor("#9CA3AF");
  doc.text("Legend: INT=Interior \u2022 EXT=Exterior \u2022 VEH=Vehicle \u2022 Annotated = photo contains shapes/notes/dimensions", PAGE.MARGIN, ctx.doc.y, { width: CONTENT_WIDTH, lineBreak: false });
}

// Area Overview Page - uses BASE photos only (no annotations)
export function renderAreaOverviewPage(
  ctx: PdfContext,
  area: AreaData,
  photos: PhotoData[],
  thumbnailBuffers: Map<number, Buffer>,
  pageIndex: number
): void {
  addContentPage(ctx, "Area Overview");

  const { doc, fonts, branding } = ctx;
  const sectionColor = branding.colorPrimary;

  // Area header
  doc.fontSize(FONT_SIZES.sectionHeader).font(fonts.bold).fillColor(sectionColor);
  doc.text(`Area: ${area.name}`, PAGE.MARGIN, ctx.doc.y, { width: CONTENT_WIDTH, lineBreak: false });

  doc.fontSize(FONT_SIZES.body).font(fonts.regular).fillColor("#6B7280");
  doc.text(`Photos: ${photos.length}`, PAGE.MARGIN, ctx.doc.y + 16, { lineBreak: false });
  ctx.doc.y += 35;

  // 6-photo grid (2 columns x 3 rows)
  const thumbsPerPage = 6;
  const cols = 2;
  const thumbWidth = (CONTENT_WIDTH - SPACING.lg) / cols;
  const thumbHeight = 200;
  const startIdx = pageIndex * thumbsPerPage;
  const endIdx = Math.min(startIdx + thumbsPerPage, photos.length);
  const gridStartY = ctx.doc.y;

  for (let i = startIdx; i < endIdx; i++) {
    const photo = photos[i];
    const localIdx = i - startIdx;
    const col = localIdx % cols;
    const row = Math.floor(localIdx / cols);

    const cellX = PAGE.MARGIN + col * (thumbWidth + SPACING.lg);
    const cellY = gridStartY + row * thumbHeight;

    // Card background
    drawCard(doc, cellX, cellY, thumbWidth, thumbHeight - 10);

    // Thumbnail image (BASE photo only - no annotations)
    const thumbBuffer = thumbnailBuffers.get(photo.id);
    const imgMaxHeight = 110;

    if (thumbBuffer) {
      try {
        doc.image(thumbBuffer, cellX + 6, cellY + 6, {
          fit: [thumbWidth - 12, imgMaxHeight],
          align: "center",
        });
      } catch (err) {
        doc.fontSize(FONT_SIZES.small).font(fonts.italic).fillColor("#DC2626");
        doc.text("Image failed", cellX + 6, cellY + 50, { width: thumbWidth - 12, align: "center", lineBreak: false });
      }
    } else {
      doc.fontSize(FONT_SIZES.small).font(fonts.italic).fillColor("#DC2626");
      doc.text("Image unavailable", cellX + 6, cellY + 50, { width: thumbWidth - 12, align: "center", lineBreak: false });
    }

    // Metadata below thumbnail
    let metaY = cellY + imgMaxHeight + 12;

    // Photo export name
    doc.fontSize(FONT_SIZES.tiny).font(fonts.bold).fillColor("#1F2937");
    const seq = ctx.seqMap.get(photo.id);
    const photoExportName = getPhotoExportName(photo, ctx.project, seq);
    const truncatedDisplayName = photoExportName.length > 30 ? photoExportName.slice(0, 27) + "..." : photoExportName;
    doc.text(truncatedDisplayName, cellX + 6, metaY, { width: thumbWidth - 12, lineBreak: false });
    metaY += 12;

    // Location type line
    doc.fontSize(FONT_SIZES.tiny).font(fonts.regular).fillColor("#6B7280");
    doc.text(`Location type: ${photo.interiorExterior || "-"}`, cellX + 6, metaY, { width: thumbWidth - 12, lineBreak: false });
    metaY += 12;

    // Chips row
    let chipX = cellX + 6;
    const locType = (photo.interiorExterior || "").toUpperCase().slice(0, 3) || "-";
    const hasAnnotations = photo.annotationData ? "Annotated" : "Not Annotated";
    const annotatedBg = photo.annotationData ? "#D1FAE5" : "#FEE2E2";
    const annotatedFg = photo.annotationData ? "#065F46" : "#991B1B";

    chipX += drawChip(doc, chipX, metaY, locType, { bg: "#E5E7EB", fg: "#374151", fonts }) + 4;
    chipX += drawChip(doc, chipX, metaY, hasAnnotations, { bg: annotatedBg, fg: annotatedFg, fonts }) + 4;

    // Tags (first 2)
    const allTags = [...(photo.wallTypeTags || []), ...(photo.customTags || [])];
    for (let t = 0; t < Math.min(2, allTags.length); t++) {
      if (chipX + 50 < cellX + thumbWidth - 6) {
        chipX += drawChip(doc, chipX, metaY, allTags[t], { bg: "#DBEAFE", fg: "#1E40AF", fonts }) + 4;
      }
    }
  }
}

// Photo Detail Page - uses ANNOTATED image (flattened)
export function renderPhotoDetailPage(
  ctx: PdfContext,
  photo: PhotoData,
  annotatedImageSource: Buffer | string | null, // Buffer or file path
  annotations: {
    dimensions: ExtractedDimension[];
    notes: ExtractedNote[];
    toolCounts: AnnotationCounts;
  },
  appendixOverflow: AppendixItem[]
): void {
  addContentPage(ctx, "Photo Detail");

  const { doc, fonts, branding } = ctx;
  const sectionColor = branding.colorPrimary;

  // Area and photo name header
  doc.fontSize(FONT_SIZES.body).font(fonts.regular).fillColor("#6B7280");
  doc.text(`Area: ${photo.areaName || "Unassigned"}`, PAGE.MARGIN, ctx.doc.y, { width: CONTENT_WIDTH, lineBreak: false });

  doc.fontSize(FONT_SIZES.subsectionHeader).font(fonts.bold).fillColor("#1F2937");
  const detailSeq = ctx.seqMap.get(photo.id);
  doc.text(getPhotoExportName(photo, ctx.project, detailSeq), PAGE.MARGIN, ctx.doc.y + 14, { width: CONTENT_WIDTH, lineBreak: false });
  ctx.doc.y += 30;

  // Layout: Image left (60%), Properties right (40%)
  const imageColWidth = CONTENT_WIDTH * 0.58;
  const propsColWidth = CONTENT_WIDTH * 0.40;
  const propsX = PAGE.MARGIN + imageColWidth + SPACING.md;
  const layoutStartY = ctx.doc.y;
  const maxImageHeight = 260;

  // Left: Photo (with annotations if they exist, otherwise base)
  if (annotatedImageSource) {
    try {
      doc.image(annotatedImageSource, PAGE.MARGIN, layoutStartY, {
        fit: [imageColWidth, maxImageHeight],
        align: "center",
      });
    } catch (err) {
      doc.fontSize(FONT_SIZES.body).font(fonts.italic).fillColor("#DC2626");
      doc.text("Image failed to load", PAGE.MARGIN, layoutStartY + 100, { width: imageColWidth, align: "center", lineBreak: false });
    }
  } else {
    doc.fontSize(FONT_SIZES.body).font(fonts.italic).fillColor("#DC2626");
    doc.text("Image unavailable", PAGE.MARGIN, layoutStartY + 100, { width: imageColWidth, align: "center", lineBreak: false });
  }

  // Right: Properties panel
  const propsPanelHeight = maxImageHeight;
  drawCard(doc, propsX, layoutStartY, propsColWidth, propsPanelHeight, { fill: "#F9FAFB" });

  let propY = layoutStartY + SPACING.md;
  const propsLabelWidth = 75;
  const propsValueWidth = propsColWidth - propsLabelWidth - SPACING.md * 2;

  // Photo Properties section
  doc.fontSize(FONT_SIZES.body).font(fonts.bold).fillColor(sectionColor);
  doc.text("Photo Properties", propsX + SPACING.md, propY, { lineBreak: false });
  propY += 16;

  // Format sided value (null/empty/NA -> "N/A")
  const sidedValue = photo.singleDoubleSided;
  const formattedSided = (!sidedValue || sidedValue === "NA") ? "N/A" : sidedValue;
  
  const props = [
    { label: "Location:", value: photo.interiorExterior || "-" },
    { label: "Illumination:", value: photo.illuminated || "-" },
    { label: "Sided:", value: formattedSided },
    { label: "GPS:", value: photo.geoLat && photo.geoLng ? `${photo.geoLat.toFixed(4)}, ${photo.geoLng.toFixed(4)}` : "-" },
    { label: "Captured:", value: photo.timestamp ? new Date(photo.timestamp).toLocaleDateString() : "-" },
  ];

  doc.fontSize(FONT_SIZES.small);
  for (const prop of props) {
    propY += drawKeyValueRow(doc, fonts, propsX + SPACING.md, propY, prop.label, prop.value, propsLabelWidth, propsValueWidth);
  }

  propY += SPACING.sm;
  doc.strokeColor("#E5E7EB").lineWidth(0.5);
  doc.moveTo(propsX + SPACING.md, propY).lineTo(propsX + propsColWidth - SPACING.md, propY).stroke();
  propY += SPACING.sm;

  // Annotation Counts section
  doc.fontSize(FONT_SIZES.body).font(fonts.bold).fillColor(sectionColor);
  doc.text("Annotation Counts", propsX + SPACING.md, propY, { lineBreak: false });
  propY += 16;

  const counts = annotations.toolCounts;
  const total = counts.rectangles + counts.arrows + counts.lines + counts.texts + counts.dimensions;

  const countItems = [
    { label: "Rectangles:", value: String(counts.rectangles) },
    { label: "Arrows:", value: String(counts.arrows) },
    { label: "Lines:", value: String(counts.lines) },
    { label: "Text Notes:", value: String(counts.texts) },
    { label: "Dimensions:", value: String(counts.dimensions) },
    { label: "Total:", value: String(total) },
  ];

  doc.fontSize(FONT_SIZES.small);
  for (const item of countItems) {
    const isBold = item.label === "Total:";
    doc.font(isBold ? fonts.bold : fonts.regular).fillColor("#374151");
    doc.text(item.label, propsX + SPACING.md + 6, propY, { lineBreak: false });
    doc.text(item.value, propsX + SPACING.md + 76, propY, { lineBreak: false });
    propY += 12;
  }

  // Below layout: Photo notes
  ctx.doc.y = layoutStartY + maxImageHeight + SPACING.md;

  const theme = getThemeTokens(branding);
  
  // Photo notes card (or "None captured" placeholder)
  const notesWidth = CONTENT_WIDTH - SPACING.md * 2;
  const notesContent = photo.notes || "";
  const notesTextHeight = notesContent ? doc.heightOfString(notesContent, { width: notesWidth }) : 0;
  const notesCardHeight = Math.max(50, notesTextHeight + 38);
  
  // Draw card with brand-safe accent styling
  drawCard(doc, PAGE.MARGIN, ctx.doc.y, CONTENT_WIDTH, notesCardHeight, { 
    fill: "#FFFFFF", 
    stroke: theme.border 
  });
  
  // Title row with accent background
  const titleRowHeight = 20;
  doc.save();
  doc.roundedRect(PAGE.MARGIN + 1, ctx.doc.y + 1, CONTENT_WIDTH - 2, titleRowHeight, 3);
  doc.clip();
  doc.rect(PAGE.MARGIN, ctx.doc.y, CONTENT_WIDTH, titleRowHeight + 5).fillColor(theme.cardTitleBg).fill();
  doc.restore();
  
  doc.fontSize(FONT_SIZES.small).font(fonts.bold).fillColor(theme.cardTitleFg);
  doc.text("Photo Notes", PAGE.MARGIN + SPACING.md, ctx.doc.y + 5, { lineBreak: false });
  
  // Notes content or placeholder
  const bodyY = ctx.doc.y + titleRowHeight + SPACING.sm;
  if (notesContent) {
    doc.font(fonts.regular).fillColor("#374151");
    // Truncate notes to fit within card height
    const truncatedNotes = notesContent.length > 250 ? notesContent.slice(0, 247) + "..." : notesContent;
    doc.text(truncatedNotes, PAGE.MARGIN + SPACING.md, bodyY, { width: notesWidth, height: notesCardHeight - titleRowHeight - SPACING.sm * 2, ellipsis: true });
  } else {
    doc.font(fonts.italic).fillColor("#9CA3AF");
    doc.text("None captured", PAGE.MARGIN + SPACING.md, bodyY, { lineBreak: false });
  }
  ctx.doc.y += notesCardHeight + SPACING.sm;

  // Key Dimensions and Key Notes tables side by side
  const maxDimsPerPage = 8;
  const maxNotesPerPage = 5;
  const tableColWidth = (CONTENT_WIDTH - SPACING.lg) / 2;

  ctx.doc.y += SPACING.sm;

  // Check for appendix overflow
  const hasOverflow = annotations.dimensions.length > maxDimsPerPage || annotations.notes.length > maxNotesPerPage;
  if (hasOverflow) {
    doc.fontSize(FONT_SIZES.small).font(fonts.italic).fillColor("#6B7280");
    doc.text("Additional dimensions/notes are available in the Appendix.", PAGE.MARGIN, ctx.doc.y, { width: CONTENT_WIDTH, lineBreak: false });
    ctx.doc.y += 14;

    const appendixSeq = ctx.seqMap.get(photo.id);
    appendixOverflow.push({
      photoId: photo.id,
      displayName: getPhotoExportName(photo, ctx.project, appendixSeq),
      areaName: photo.areaName,
      dimensions: annotations.dimensions,
      notes: annotations.notes,
    });
  }

  const tableY = ctx.doc.y;
  const rowHeight = 14;

  // Left: Key Dimensions
  doc.fontSize(FONT_SIZES.body).font(fonts.bold).fillColor(sectionColor);
  doc.text("Key Dimensions", PAGE.MARGIN, tableY, { lineBreak: false });

  const dimTableY = tableY + 16;
  const dimColWidths = [35, 70, tableColWidth - 105];

  // Dimensions header
  doc.fillColor(theme.headerFill).rect(PAGE.MARGIN, dimTableY, tableColWidth, 18).fill();
  doc.strokeColor(theme.border).lineWidth(0.5).rect(PAGE.MARGIN, dimTableY, tableColWidth, 18).stroke();

  doc.fontSize(FONT_SIZES.tiny).font(fonts.bold).fillColor("#374151");
  doc.text("Label", PAGE.MARGIN + 4, dimTableY + 4, { width: dimColWidths[0], lineBreak: false });
  doc.text("Measurement", PAGE.MARGIN + dimColWidths[0] + 4, dimTableY + 4, { width: dimColWidths[1], lineBreak: false });
  doc.text("Notes", PAGE.MARGIN + dimColWidths[0] + dimColWidths[1] + 4, dimTableY + 4, { width: dimColWidths[2], lineBreak: false });

  let dimRowY = dimTableY + 18;
  const dimsToShow = annotations.dimensions.slice(0, maxDimsPerPage);

  if (dimsToShow.length === 0) {
    doc.fillColor(theme.rowWhite).rect(PAGE.MARGIN, dimRowY, tableColWidth, 18).fill();
    doc.fontSize(FONT_SIZES.small).font(fonts.italic).fillColor("#9CA3AF");
    doc.text("None captured", PAGE.MARGIN + 4, dimRowY + 4, { lineBreak: false });
    dimRowY += 18;
  } else {
    doc.fontSize(FONT_SIZES.tiny).font(fonts.regular).fillColor("#374151");
    dimsToShow.forEach((dim, idx) => {
      // Zebra striping
      const rowBg = idx % 2 === 0 ? theme.rowWhite : theme.zebraFill;
      doc.fillColor(rowBg).rect(PAGE.MARGIN, dimRowY, tableColWidth, rowHeight).fill();
      
      doc.fillColor("#374151");
      doc.text(dim.calloutId, PAGE.MARGIN + 4, dimRowY + 3, { width: dimColWidths[0], lineBreak: false });
      doc.text(`${dim.value} ${dim.unit}`, PAGE.MARGIN + dimColWidths[0] + 4, dimRowY + 3, { width: dimColWidths[1], lineBreak: false });
      doc.text(dim.comment || "", PAGE.MARGIN + dimColWidths[0] + dimColWidths[1] + 4, dimRowY + 3, { width: dimColWidths[2] - 8, lineBreak: false });
      dimRowY += rowHeight;
    });
  }

  doc.strokeColor(theme.border).lineWidth(0.5).rect(PAGE.MARGIN, dimTableY, tableColWidth, dimRowY - dimTableY).stroke();

  // Right: Key Notes
  const rightTableX = PAGE.MARGIN + tableColWidth + SPACING.lg;
  doc.fontSize(FONT_SIZES.body).font(fonts.bold).fillColor(sectionColor);
  doc.text("Key Notes", rightTableX, tableY, { lineBreak: false });

  const noteTableY = tableY + 16;

  // Notes header
  doc.fillColor(theme.headerFill).rect(rightTableX, noteTableY, tableColWidth, 18).fill();
  doc.strokeColor(theme.border).lineWidth(0.5).rect(rightTableX, noteTableY, tableColWidth, 18).stroke();

  doc.fontSize(FONT_SIZES.tiny).font(fonts.bold).fillColor("#374151");
  doc.text("Note", rightTableX + 4, noteTableY + 4, { width: tableColWidth - 8, lineBreak: false });

  let noteRowY = noteTableY + 18;
  const notesToShow = annotations.notes.slice(0, maxNotesPerPage);

  if (notesToShow.length === 0) {
    doc.fillColor(theme.rowWhite).rect(rightTableX, noteRowY, tableColWidth, 18).fill();
    doc.fontSize(FONT_SIZES.small).font(fonts.italic).fillColor("#9CA3AF");
    doc.text("None captured", rightTableX + 4, noteRowY + 4, { lineBreak: false });
    noteRowY += 18;
  } else {
    doc.fontSize(FONT_SIZES.tiny).font(fonts.regular).fillColor("#374151");
    notesToShow.forEach((note, idx) => {
      // Zebra striping
      const rowBg = idx % 2 === 0 ? theme.rowWhite : theme.zebraFill;
      doc.fillColor(rowBg).rect(rightTableX, noteRowY, tableColWidth, rowHeight).fill();
      
      const noteText = note.text.length > 80 ? note.text.slice(0, 77) + "..." : note.text;
      doc.fillColor("#374151");
      doc.text(noteText, rightTableX + 4, noteRowY + 3, { width: tableColWidth - 8, lineBreak: false });
      noteRowY += rowHeight;
    });
  }

  doc.strokeColor(theme.border).lineWidth(0.5).rect(rightTableX, noteTableY, tableColWidth, noteRowY - noteTableY).stroke();
}

// Appendix Pages
export function renderAppendixPages(ctx: PdfContext, overflowItems: AppendixItem[]): void {
  if (overflowItems.length === 0) return;

  addContentPage(ctx, "Appendix");

  const { doc, fonts, branding } = ctx;
  const sectionColor = branding.colorPrimary;

  doc.fontSize(FONT_SIZES.sectionHeader).font(fonts.bold).fillColor(sectionColor);
  doc.text("Appendix: Overflow details", PAGE.MARGIN, ctx.doc.y, { width: CONTENT_WIDTH, lineBreak: false });
  ctx.doc.y += 25;

  for (const item of overflowItems) {
    // Calculate needed height
    const neededHeight = 100 + item.dimensions.length * 14 + item.notes.length * 14;
    if (needsNewPage(ctx, neededHeight)) {
      addContentPage(ctx, "Appendix");
    }

    // Photo display name
    doc.fontSize(FONT_SIZES.body).font(fonts.bold).fillColor("#1F2937");
    doc.text(item.displayName, PAGE.MARGIN, ctx.doc.y, { width: CONTENT_WIDTH, lineBreak: false });
    ctx.doc.y += 18;

    // Full dimensions table
    if (item.dimensions.length > 0) {
      const colWidths = [40, 80, CONTENT_WIDTH - 120];

      // Table header
      const dimTableY = ctx.doc.y;
      doc.fillColor("#F3F4F6").rect(PAGE.MARGIN, dimTableY, CONTENT_WIDTH, 18).fill();
      doc.strokeColor("#E5E7EB").rect(PAGE.MARGIN, dimTableY, CONTENT_WIDTH, 18).stroke();

      doc.fontSize(FONT_SIZES.tiny).font(fonts.bold).fillColor("#374151");
      doc.text("Label", PAGE.MARGIN + 4, dimTableY + 4, { width: colWidths[0], lineBreak: false });
      doc.text("Measurement", PAGE.MARGIN + colWidths[0] + 4, dimTableY + 4, { width: colWidths[1], lineBreak: false });
      doc.text("Notes", PAGE.MARGIN + colWidths[0] + colWidths[1] + 4, dimTableY + 4, { width: colWidths[2], lineBreak: false });

      let rowY = dimTableY + 18;
      doc.fontSize(FONT_SIZES.tiny).font(fonts.regular).fillColor("#374151");

      for (const dim of item.dimensions) {
        // Check for page break
        if (rowY + 14 > CONTENT_BOTTOM) {
          doc.strokeColor("#E5E7EB").rect(PAGE.MARGIN, dimTableY, CONTENT_WIDTH, rowY - dimTableY).stroke();
          addContentPage(ctx, "Appendix");
          rowY = ctx.doc.y;
          
          // Re-draw header
          doc.fillColor("#F3F4F6").rect(PAGE.MARGIN, rowY, CONTENT_WIDTH, 18).fill();
          doc.strokeColor("#E5E7EB").rect(PAGE.MARGIN, rowY, CONTENT_WIDTH, 18).stroke();
          doc.fontSize(FONT_SIZES.tiny).font(fonts.bold).fillColor("#374151");
          doc.text("Label", PAGE.MARGIN + 4, rowY + 4, { width: colWidths[0], lineBreak: false });
          doc.text("Measurement", PAGE.MARGIN + colWidths[0] + 4, rowY + 4, { width: colWidths[1], lineBreak: false });
          doc.text("Notes", PAGE.MARGIN + colWidths[0] + colWidths[1] + 4, rowY + 4, { width: colWidths[2], lineBreak: false });
          rowY += 18;
          doc.fontSize(FONT_SIZES.tiny).font(fonts.regular).fillColor("#374151");
        }

        doc.text(dim.calloutId, PAGE.MARGIN + 4, rowY + 3, { width: colWidths[0], lineBreak: false });
        doc.text(`${dim.value} ${dim.unit}`, PAGE.MARGIN + colWidths[0] + 4, rowY + 3, { width: colWidths[1], lineBreak: false });
        doc.text(dim.comment || "", PAGE.MARGIN + colWidths[0] + colWidths[1] + 4, rowY + 3, { width: colWidths[2] - 8, lineBreak: false });
        rowY += 14;
      }

      doc.strokeColor("#E5E7EB").rect(PAGE.MARGIN, dimTableY, CONTENT_WIDTH, rowY - dimTableY).stroke();
      ctx.doc.y = rowY + SPACING.md;
    }

    // Full notes table
    if (item.notes.length > 0) {
      const noteTableY = ctx.doc.y;

      doc.fillColor("#F3F4F6").rect(PAGE.MARGIN, noteTableY, CONTENT_WIDTH, 18).fill();
      doc.strokeColor("#E5E7EB").rect(PAGE.MARGIN, noteTableY, CONTENT_WIDTH, 18).stroke();

      doc.fontSize(FONT_SIZES.tiny).font(fonts.bold).fillColor("#374151");
      doc.text("Note", PAGE.MARGIN + 4, noteTableY + 4, { width: CONTENT_WIDTH - 8, lineBreak: false });

      let rowY = noteTableY + 18;
      doc.fontSize(FONT_SIZES.tiny).font(fonts.regular).fillColor("#374151");

      for (const note of item.notes) {
        // Truncate long notes to fit on one line
        const noteText = note.text.length > 120 ? note.text.slice(0, 117) + "..." : note.text;
        doc.text(noteText, PAGE.MARGIN + 4, rowY + 3, { width: CONTENT_WIDTH - 8, lineBreak: false });
        rowY += 14;
      }

      doc.strokeColor("#E5E7EB").rect(PAGE.MARGIN, noteTableY, CONTENT_WIDTH, rowY - noteTableY).stroke();
      ctx.doc.y = rowY + SPACING.lg;
    }
  }
}

// Truncate text to fit within maxWidth, adding ellipsis if needed
function truncateToWidth(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) {
    return text;
  }
  
  const ellipsis = "...";
  const ellipsisWidth = doc.widthOfString(ellipsis);
  const availableWidth = maxWidth - ellipsisWidth;
  
  if (availableWidth <= 0) {
    return ellipsis;
  }
  
  let truncated = text;
  while (truncated.length > 0 && doc.widthOfString(truncated) > availableWidth) {
    truncated = truncated.slice(0, -1);
  }
  
  return truncated + ellipsis;
}

// Final pass: Add headers and footers to ALL buffered pages
// CRITICAL: All text must use lineBreak: false to prevent auto-pagination
export function finalizePages(ctx: PdfContext): void {
  const { doc, fonts, branding, project } = ctx;
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  const beforeCount = totalPages;

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);

    // Save current position - MUST restore to prevent layout issues
    const savedX = doc.x;
    const savedY = doc.y;

    // Skip header on cover page (page 0)
    if (i > 0) {
      const headerY = 15;
      const lineY = PAGE.HEADER_HEIGHT;
      const sectionLabel = ctx.sectionLabels.get(i) || "";
      // Use displaySiteName for headers (may include part label), fallback to project.siteName
      const displaySite = ctx.displaySiteName || project.siteName;

      doc.save();

      // Logo container on left (if logo exists)
      if (ctx.logoBuffer) {
        drawLogoContainer(ctx, PAGE.MARGIN, headerY, LOGO_CONTAINER.header.width, LOGO_CONTAINER.header.height);
      }

      // Project title - calculate available width and truncate
      const textX = ctx.logoBuffer ? PAGE.MARGIN + LOGO_CONTAINER.header.width + SPACING.md : PAGE.MARGIN;
      const textWidth = PAGE.WIDTH - textX - PAGE.MARGIN - (sectionLabel ? 85 : 0);

      // Main title line
      doc.fontSize(FONT_SIZES.body).font(fonts.bold).fillColor("#1F2937");
      const titleText = truncateToWidth(doc, `${project.clientName} - ${displaySite}`, textWidth);
      doc.text(titleText, textX, headerY + 5, { width: textWidth, lineBreak: false });

      // Subtitle line
      doc.fontSize(FONT_SIZES.small).font(fonts.regular).fillColor("#6B7280");
      const subtitleText = truncateToWidth(doc, `${project.clientName} | ${displaySite}`, textWidth);
      doc.text(subtitleText, textX, headerY + 18, { width: textWidth, lineBreak: false });

      // Section label on right
      if (sectionLabel) {
        doc.fontSize(FONT_SIZES.small).font(fonts.regular).fillColor("#6B7280");
        doc.text(sectionLabel, PAGE.WIDTH - PAGE.MARGIN - 80, headerY + 10, { width: 80, align: "right", lineBreak: false });
      }

      // Accent line under header
      const lineColor = branding.isFieldScopeBranding ? "#E5E7EB" : branding.colorSecondary;
      doc.strokeColor(lineColor).lineWidth(3);
      doc.moveTo(PAGE.MARGIN, lineY).lineTo(PAGE.WIDTH - PAGE.MARGIN, lineY).stroke();

      doc.restore();
    }

    // Draw footer on ALL pages (SAFE: never below maxY)
    doc.save();

    // Use per-page margins instead of PAGE constants
    const marginL = doc.page.margins.left;
    const marginR = doc.page.margins.right;
    const marginB = doc.page.margins.bottom;
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    const contentW = pageW - marginL - marginR;

    // Set footer font BEFORE computing line height
    doc.fontSize(FONT_SIZES.small).font(fonts.regular).fillColor("#6B7280");

    // SAFE Y: maxY is the lowest point that will NOT force a new page
    const maxY = pageH - marginB;
    const footerTextH = doc.currentLineHeight(true);
    const footerY = maxY - footerTextH;
    const footerLineY = footerY - 10;

    const pageNumWidth = 75;
    const gap = 10;
    const footerTextMaxWidth = contentW - pageNumWidth - gap;

    // Divider line (also safe)
    doc.strokeColor("#E5E7EB").lineWidth(0.5);
    doc.moveTo(marginL, footerLineY).lineTo(pageW - marginR, footerLineY).stroke();

    // Left: Company info - truncate to prevent wrap
    const footerParts: string[] = [];
    if (branding.businessName) footerParts.push(branding.businessName);
    if (branding.website) footerParts.push(branding.website);
    if (branding.email) footerParts.push(branding.email);
    if (branding.phone) footerParts.push(branding.phone);

    const rawFooterText = footerParts.join(" \u2022 ");
    const truncatedFooter = truncateToWidth(doc, rawFooterText, footerTextMaxWidth);

    doc.text(truncatedFooter, marginL, footerY, {
      width: footerTextMaxWidth,
      lineBreak: false,
    });

    // Right: Page number
    const pageText = `Page ${i + 1} of ${totalPages}`;
    doc.text(pageText, pageW - marginR - pageNumWidth, footerY, {
      width: pageNumWidth,
      align: "right",
      lineBreak: false,
    });

    doc.restore();

    // Restore position exactly
    doc.x = savedX;
    doc.y = savedY;
  }

  // Guard: page count must not change during finalization
  const afterCount = doc.bufferedPageRange().count;
  if (afterCount !== beforeCount) {
    throw new Error(`[PDF] finalizePages changed page count: before=${beforeCount}, after=${afterCount}`);
  }
}

// Create a new PDF document with proper options
export function createPdfDocument(): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "LETTER",
    margins: { top: PAGE.MARGIN, bottom: PAGE.MARGIN, left: PAGE.MARGIN, right: PAGE.MARGIN },
    autoFirstPage: false,
    bufferPages: true,
  });
}

// Utility: Calculate estimated total pages (for progress reporting)
export function estimateTotalPages(
  areas: AreaData[],
  photos: PhotoData[],
  areaPhotoCountMap: Map<number, number>
): number {
  let total = 2; // Cover + Summary

  // Area overview pages (6 photos per page per area)
  for (const area of areas) {
    const photoCount = areaPhotoCountMap.get(area.id) || 0;
    if (photoCount > 0) {
      total += Math.ceil(photoCount / 6);
    }
  }

  // Photo detail pages (1 per photo)
  total += photos.length;

  // Add 1 for potential appendix
  total += 1;

  return total;
}
