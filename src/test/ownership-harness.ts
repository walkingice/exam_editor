import { ExamDatabase } from '../data/database';
import { ProjectOwnership } from '../data/ownership';
import { ProjectRepository } from '../data/repository';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS } from '../domain/types';
import { normalizeDocument } from '../domain/document';

const ownership = new ProjectOwnership();
const repository = new ProjectRepository(new ExamDatabase(), ownership);
const leases = new Map<string, Awaited<ReturnType<ProjectOwnership['acquire']>>>();

const harness = {
  async acquire(projectId: string) {
    const result = await ownership.acquireLatest(projectId, () => repository.get(projectId));
    if (!result) return { owned: false, project: null };
    leases.set(projectId, result.lease);
    return { owned: true, project: result.value?.project ?? null };
  },
  async create(projectId: string) {
    await repository.create({
      project: {
        id: projectId, name: 'Original', createdAt: Date.now(), updatedAt: Date.now(),
        pageSettings: structuredClone(DEFAULT_PAGE_SETTINGS), schemaVersion: 1,
      },
      document: createEmptyDocument(projectId), assets: [],
    });
  },
  async createWithImage(projectId: string) {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
    const now = Date.now();
    await repository.create({
      project: { id: projectId, name: 'Image fixture', createdAt: now, updatedAt: now,
        pageSettings: structuredClone(DEFAULT_PAGE_SETTINGS), schemaVersion: 1 },
      document: { projectId, schemaVersion: 1, content: normalizeDocument({
        type: 'doc', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Stored image' }] },
          { type: 'image', attrs: { assetId: `image-${projectId}`, alt: 'Fixture image' } },
        ],
      }) },
      assets: [{ id: `image-${projectId}`, projectId, mimeType: 'image/png',
        blob: new Blob([bytes], { type: 'image/png' }) }],
    });
  },
  async addUnusedImage(projectId: string) {
    await repository.addAsset({ id: `unused-${projectId}`, projectId, mimeType: 'image/png',
      blob: new Blob(['unused'], { type: 'image/png' }) });
  },
  async assetIds(projectId: string) {
    return (await repository.get(projectId))?.assets.map((asset) => asset.id).sort() ?? [];
  },
  async leaveCleanupPending(projectId: string) {
    await repository.beginSession(projectId);
  },
  async createQuestionSections(projectId: string) {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
    const now = Date.now();
    await repository.create({
      project: { id: projectId, name: 'Question sections', createdAt: now, updatedAt: now,
        pageSettings: structuredClone(DEFAULT_PAGE_SETTINGS), schemaVersion: 1 },
      document: { projectId, schemaVersion: 1, content: normalizeDocument({
        type: 'doc', content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section one' }] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Move me' }] },
            { type: 'bulletList', content: [{ type: 'listItem', content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Option' }] },
            ] }] },
            { type: 'image', attrs: { assetId: `image-${projectId}`, alt: 'Question image' } },
          ] }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section two' }] },
        ],
      }) },
      assets: [{ id: `image-${projectId}`, projectId, mimeType: 'image/png',
        blob: new Blob([bytes], { type: 'image/png' }) }],
    });
  },
  async createMilestone2Fixture(projectId: string) {
    await harness.createQuestionSections(projectId);
    const bundle = await repository.get(projectId);
    if (!bundle) throw new Error('Fixture project is missing');
    const content = structuredClone(bundle.document.content);
    content.content![1].content![0].content!.push({ type: 'table', content: [
      { type: 'tableRow', content: [{ type: 'tableCell', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Table answer' }] },
      ] }] },
    ] });
    content.content!.push({ type: 'bulletList', content: [{ type: 'listItem',
      attrs: { selected: false }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Unselected question' }] },
        { type: 'image', attrs: { assetId: `image-${projectId}`, alt: 'Shared image' } },
      ] }] });
    bundle.document.content = normalizeDocument(content);
    bundle.project.name = 'Milestone two fixture';
    await repository.save(bundle);
  },
  async rename(projectId: string, name: string) {
    const bundle = await repository.get(projectId);
    if (!bundle) throw new Error('Project not found');
    bundle.project.name = name;
    bundle.project.updatedAt = Date.now();
    await repository.save(bundle);
  },
  async remove(projectId: string) { await repository.delete(projectId); },
  async read(projectId: string) { return (await repository.get(projectId))?.project ?? null; },
  async release(projectId: string) {
    await leases.get(projectId)?.release();
    leases.delete(projectId);
  },
};

declare global {
  interface Window { ownershipHarness: typeof harness }
}

window.ownershipHarness = harness;
