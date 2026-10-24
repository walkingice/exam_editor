import type { JSONContent } from '@tiptap/core';
import { normalizeDocument, validateDocument } from './document';

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
  const dimensions = settings.paperSize === 'TW_B4' ? [265, 379]
    : settings.paperSize === 'A4' ? [210, 297] : null;
  if (!dimensions || !['portrait', 'landscape'].includes(settings.orientation)
    || !['ordered', 'unordered'].includes(settings.outputListStyle)) {
    throw new Error('Unsupported page setting');
  }
  const [width, height] = settings.orientation === 'portrait'
    ? dimensions : [dimensions[1], dimensions[0]];
  const { top, right, bottom, left } = settings.marginsMm;
  if ([top, right, bottom, left].some((value) => !Number.isFinite(value) || value < 0)
    || left + right >= width || top + bottom >= height
    || !Number.isFinite(settings.defaultFontSizePt) || settings.defaultFontSizePt <= 0
    || !Number.isFinite(settings.lineHeight) || settings.lineHeight <= 0) {
    throw new Error('Invalid page dimensions or typography');
  }
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
  if (!asset.id || !asset.projectId || !['image/png', 'image/jpeg'].includes(asset.mimeType)
    || !(asset.blob instanceof Blob) || asset.blob.type !== asset.mimeType) {
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
