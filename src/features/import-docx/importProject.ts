import type { JSONContent } from '@tiptap/core';
import { ProjectOwnership, WriteAccessError } from '../../data/ownership';
import { ProjectRepository } from '../../data/repository';
import { DEFAULT_PAGE_SETTINGS, DOCUMENT_SCHEMA_VERSION } from '../../domain/types';
import { checkCancelled } from './limits';
import { normalizeImport } from './normalizeImport';
import { parseDocx } from './parseDocx';

export type ImportStage = 'converting' | 'saving';
export type ImportedProject = { projectId: string; warnings: string[] };

function referencedImages(node: JSONContent, ids = new Set<string>()): Set<string> {
  if (node.type === 'image' && typeof node.attrs?.assetId === 'string') ids.add(node.attrs.assetId);
  node.content?.forEach((child) => referencedImages(child, ids));
  return ids;
}

export async function importProject(
  file: File, repository: ProjectRepository, ownership: ProjectOwnership,
  signal: AbortSignal, onStage: (stage: ImportStage) => void,
): Promise<ImportedProject> {
  onStage('converting');
  const parsed = await parseDocx(file, signal);
  checkCancelled(signal);
  const normalized = normalizeImport(parsed);
  checkCancelled(signal);
  const projectId = crypto.randomUUID();
  const now = Date.now();
  const referenced = referencedImages(normalized.content);
  const assets = parsed.images.filter((image) => referenced.has(image.id)).map((image) => ({
    id: image.id, projectId, mimeType: image.mimeType, blob: image.blob,
  }));
  const lease = await ownership.acquire(projectId);
  if (!lease) throw new WriteAccessError();
  try {
    checkCancelled(signal);
    onStage('saving');
    await repository.create({
      project: { id: projectId, name: file.name.replace(/\.docx$/i, '') || '匯入試卷',
        createdAt: now, updatedAt: now, pageSettings: structuredClone(DEFAULT_PAGE_SETTINGS),
        schemaVersion: DOCUMENT_SCHEMA_VERSION },
      document: { projectId, content: normalized.content, schemaVersion: DOCUMENT_SCHEMA_VERSION },
      assets,
    });
  } finally { await lease.release(); }
  return { projectId, warnings: normalized.warnings };
}
