import type { JSONContent } from '@tiptap/core';
import { normalizeDocument, validateDocument } from './document';
import { PAGE_INPUT_LIMITS, PAPER_DIMENSIONS_MM, pageDimensions } from './pageSettings';

export const DOCUMENT_SCHEMA_VERSION = 1;

export type PaperSize = 'TW_B4' | 'A4';
export type Orientation = 'portrait' | 'landscape';
export type OutputListStyle = 'ordered' | 'unordered';

export type PageSettings = {
  paperSize: PaperSize;
  orientation: Orientation;
  marginsMm: { top: number; right: number; bottom: number; left: number };
  defaultFontSizePt: number;
  lineHeight: number;
  outputListStyle: OutputListStyle;
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageSettings: PageSettings;
  schemaVersion: number;
};

export type ExamDocument = {
  projectId: string;
  content: JSONContent;
  schemaVersion: number;
};

export type Asset = {
  id: string;
  projectId: string;
  mimeType: string;
  blob: Blob;
  originalName?: string;
};

export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  paperSize: 'TW_B4',
  orientation: 'portrait',
  marginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
  defaultFontSizePt: 12,
  lineHeight: 1.5,
  outputListStyle: 'ordered',
};

export function validatePageSettings(settings: PageSettings): void {
  if (!settings || !PAPER_DIMENSIONS_MM[settings.paperSize]
    || !['portrait', 'landscape'].includes(settings.orientation)
    || !['ordered', 'unordered'].includes(settings.outputListStyle)) {
    throw new Error('Unsupported page setting');
  }
  const margins = settings.marginsMm;
  if (!margins || [margins.top, margins.right, margins.bottom, margins.left]
    .some((value) => !Number.isFinite(value) || value < 0 || value > PAGE_INPUT_LIMITS.marginMm)
    || !Number.isFinite(settings.defaultFontSizePt)
    || settings.defaultFontSizePt < PAGE_INPUT_LIMITS.fontSizePt[0]
    || settings.defaultFontSizePt > PAGE_INPUT_LIMITS.fontSizePt[1]
    || !Number.isFinite(settings.lineHeight)
    || settings.lineHeight < PAGE_INPUT_LIMITS.lineHeight[0]
    || settings.lineHeight > PAGE_INPUT_LIMITS.lineHeight[1]) {
    throw new Error('Invalid page dimensions or typography');
  }
  const { contentWidthMm, contentHeightMm } = pageDimensions(settings);
  if (contentWidthMm <= 0 || contentHeightMm <= 0) throw new Error('Invalid page dimensions');
}

export function validateProject(project: Project): void {
  if (!project.id || !project.name.trim()
    || !Number.isFinite(project.createdAt) || !Number.isFinite(project.updatedAt)
    || project.updatedAt < project.createdAt
    || project.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    throw new Error('Invalid or unsupported project');
  }
  validatePageSettings(project.pageSettings);
}

export function validateExamDocument(document: ExamDocument): void {
  if (!document.projectId || document.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    throw new Error('Invalid or unsupported exam document');
  }
  validateDocument(document.content);
}

export function validateAsset(asset: Asset): void {
  const blob = asset.blob;
  if (!asset.id || !asset.projectId || !['image/png', 'image/jpeg'].includes(asset.mimeType)
    || typeof blob?.arrayBuffer !== 'function' || !Number.isFinite(blob.size)
    || blob.type !== asset.mimeType) {
    throw new Error('Invalid asset');
  }
}

export function createEmptyDocument(projectId: string): ExamDocument {
  return {
    projectId,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    content: normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] }),
  };
}
