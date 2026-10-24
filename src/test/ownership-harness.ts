import { ExamDatabase } from '../data/database';
import { ProjectOwnership } from '../data/ownership';
import { ProjectRepository } from '../data/repository';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS } from '../domain/types';

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
