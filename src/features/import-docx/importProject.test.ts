import { describe, expect, it, vi } from 'vitest';
import { Document, Packer, Paragraph } from 'docx';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { ProjectLease, type ProjectOwnership } from '../../data/ownership';
import { ExamDatabase } from '../../data/database';
import { ProjectRepository, type ProjectBundle } from '../../data/repository';
import { importProject } from './importProject';

async function fixture(): Promise<File> {
  const blob = await Packer.toBlob(new Document({ sections: [{ children: [
    new Paragraph('中文試題'),
  ] }] }));
  return new File([blob], '測驗.docx', { type:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

const create = vi.fn<(bundle: ProjectBundle) => Promise<void>>(async () => undefined);
const repository = { create } as unknown as ProjectRepository;
const ownership = { acquire: vi.fn(async (id: string) => new ProjectLease(id)) } as unknown as ProjectOwnership;

describe('importProject', () => {
  it('saves the complete normalized document in one repository call', async () => {
    create.mockClear();
    const stages: string[] = [];
    const result = await importProject(await fixture(), repository, ownership,
      new AbortController().signal, (stage) => stages.push(stage));
    expect(stages).toEqual(['converting', 'saving']);
    expect(create).toHaveBeenCalledOnce();
    const bundle = create.mock.calls[0][0];
    expect(bundle.project.id).toBe(result.projectId);
    expect(bundle.document.projectId).toBe(result.projectId);
    expect(bundle.project.name).toBe('測驗');
    expect(JSON.stringify(bundle.document.content)).toContain('中文試題');
  });

  it('never writes for damaged input or cancellation', async () => {
    create.mockClear();
    await expect(importProject(new File(['broken'], 'bad.docx'), repository, ownership,
      new AbortController().signal, () => undefined)).rejects.toBeInstanceOf(Error);
    const controller = new AbortController();
    controller.abort();
    await expect(importProject(await fixture(), repository, ownership, controller.signal,
      () => undefined)).rejects.toMatchObject({ code: 'cancelled' });
    expect(create).not.toHaveBeenCalled();
  });

  it('reports save failure without returning a successful project', async () => {
    create.mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
    await expect(importProject(await fixture(), repository, ownership,
      new AbortController().signal, () => undefined)).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });

  it('leaves no project or document after a transactional save failure', async () => {
    const database = new ExamDatabase(`import-test-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
    const storage = new ProjectRepository(database, { run: async (_id, operation) => operation() });
    vi.spyOn(database.documents, 'add').mockRejectedValueOnce(new Error('Storage failed'));
    try {
      await expect(importProject(await fixture(), storage, ownership,
        new AbortController().signal, () => undefined)).rejects.toThrow('Storage failed');
      expect(await database.projects.count()).toBe(0);
      expect(await database.documents.count()).toBe(0);
      expect(await database.assets.count()).toBe(0);
    } finally {
      database.close();
      await database.delete();
    }
  });
});
