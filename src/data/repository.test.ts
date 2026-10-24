import Dexie from 'dexie';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS } from '../domain/types';
import type { Asset, Project } from '../domain/types';
import { ExamDatabase } from './database';
import { ProjectRepository, type ProjectBundle } from './repository';

const dependencies = { indexedDB, IDBKeyRange };
const databases: ExamDatabase[] = [];

function createRepository(): ProjectRepository {
  const database = new ExamDatabase(`exam-test-${crypto.randomUUID()}`, dependencies);
  databases.push(database);
  return new ProjectRepository(database, { run: async (_projectId, operation) => operation() });
}

function bundle(id = 'project-1'): ProjectBundle {
  const project: Project = {
    id, name: 'Exam', createdAt: 100, updatedAt: 100,
    schemaVersion: 1, pageSettings: structuredClone(DEFAULT_PAGE_SETTINGS),
  };
  const asset: Asset = {
    id: `asset-${id}`, projectId: id, mimeType: 'image/png',
    blob: new NodeBlob(['image'], { type: 'image/png' }) as Blob,
  };
  return { project, document: createEmptyDocument(id), assets: [asset] };
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close();
    await database.delete();
  }
});

describe('project repository', () => {
  it('creates, reads, updates, lists, and deletes a complete project', async () => {
    const repository = createRepository();
    const first = bundle();
    await repository.create(first);
    expect((await repository.get(first.project.id))?.assets).toHaveLength(1);
    expect((await repository.getAsset(first.project.id, `asset-${first.project.id}`))?.id)
      .toBe(`asset-${first.project.id}`);
    expect(await repository.getAsset('another', `asset-${first.project.id}`)).toBeNull();
    await repository.create(bundle('project-2'));
    first.project.name = 'Updated';
    first.project.updatedAt = 200;
    await repository.save(first);
    expect((await repository.list()).map((project) => project.id))
      .toEqual(['project-1', 'project-2']);
    expect((await repository.get('project-1'))?.project.name).toBe('Updated');
    await repository.delete('project-1');
    expect(await repository.get('project-1')).toBeNull();
    expect(await databases.at(-1)!.assets.where('projectId').equals('project-1').count()).toBe(0);
    expect(await repository.get('project-2')).not.toBeNull();
  });

  it('rolls back metadata and document when an asset insert fails', async () => {
    const repository = createRepository();
    const first = bundle();
    first.assets.push({ ...first.assets[0] });
    await expect(repository.create(first)).rejects.toThrow();
    expect(await databases.at(-1)!.projects.count()).toBe(0);
    expect(await databases.at(-1)!.documents.count()).toBe(0);
    expect(await databases.at(-1)!.assets.count()).toBe(0);
  });

  it('rolls back an update when document writing fails', async () => {
    const repository = createRepository();
    const current = bundle();
    await repository.create(current);
    current.project.name = 'Uncommitted';
    const database = databases.at(-1)!;
    const write = vi.spyOn(database.documents, 'put')
      .mockRejectedValueOnce(new Error('Storage failed'));
    await expect(repository.save(current)).rejects.toThrow('Storage failed');
    write.mockRestore();
    expect((await repository.get(current.project.id))?.project.name).toBe('Exam');
  });

  it('adds an image asset independently without changing the saved document', async () => {
    const repository = createRepository();
    const current = bundle();
    await repository.create(current);
    const added: Asset = { id: 'new-image', projectId: current.project.id,
      mimeType: 'image/png', blob: new NodeBlob(['image'], { type: 'image/png' }) as Blob };
    await repository.addAsset(added);
    expect((await repository.getAsset(current.project.id, added.id))?.blob.size).toBe(5);
    expect((await repository.get(current.project.id))?.document).toEqual(current.document);
    await expect(repository.addAsset(added)).rejects.toThrow();
    await expect(repository.addAsset({ ...added, id: 'other', projectId: 'missing' }))
      .rejects.toThrow('Project does not exist');
  });

  it('rejects assets when the project exceeds its total image limit', async () => {
    const repository = createRepository();
    const current = bundle();
    await repository.create(current);
    const oversized: Asset = { id: 'too-much', projectId: current.project.id,
      mimeType: 'image/png', blob: new NodeBlob([new Uint8Array(30 * 1024 * 1024)],
        { type: 'image/png' }) as Blob };
    await expect(repository.addAsset(oversized)).rejects.toThrow('圖片總量');
    expect(await repository.getAsset(current.project.id, oversized.id)).toBeNull();
  });

  it('upgrades a version-one fixture without changing content on later reads', async () => {
    const repository = createRepository();
    const legacy = new Dexie(databases.at(-1)!.name, dependencies);
    legacy.version(1).stores({ projects: 'id, updatedAt', documents: 'projectId', assets: 'id, projectId' });
    await legacy.open();
    await legacy.table('projects').add({ id: 'old', name: 'Old', createdAt: 1, updatedAt: 1 });
    await legacy.table('documents').add({ projectId: 'old', content: {
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy' }] }],
    } });
    legacy.close();
    const migrated = await repository.get('old');
    expect(migrated?.project.pageSettings).toEqual(DEFAULT_PAGE_SETTINGS);
    expect(migrated?.document.schemaVersion).toBe(1);
    expect(migrated?.document.content.content?.[0].attrs?.id).toBeTruthy();
    expect(await repository.get('old')).toEqual(migrated);
  });

  it('refuses future schema versions without overwriting stored data', async () => {
    const repository = createRepository();
    const original = bundle();
    await repository.create(original);
    await databases.at(-1)!.projects.update(original.project.id, { schemaVersion: 99 });
    await expect(repository.get(original.project.id)).rejects.toThrow();
    original.project.name = 'Forbidden';
    await expect(repository.save(original)).rejects.toThrow();
    expect((await databases.at(-1)!.projects.get(original.project.id))?.name).toBe('Exam');
  });

  it('does not delete a document from an unsupported future version', async () => {
    const repository = createRepository();
    const original = bundle();
    await repository.create(original);
    await databases.at(-1)!.documents.update(original.project.id, { schemaVersion: 99 });
    await expect(repository.delete(original.project.id)).rejects.toThrow();
    expect(await databases.at(-1)!.projects.get(original.project.id)).toBeTruthy();
    expect(await databases.at(-1)!.assets.count()).toBe(1);
  });
});
