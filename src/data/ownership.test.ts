import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS } from '../domain/types';
import { ExamDatabase } from './database';
import { ProjectOwnership, WriteAccessError } from './ownership';
import { ProjectRepository } from './repository';

class FakeLocks {
  private held = new Set<string>();

  async request<T>(
    name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<T>,
  ): Promise<T> {
    if (this.held.has(name)) return callback(null);
    this.held.add(name);
    try { return await callback({ name, mode: 'exclusive' } as Lock); } finally {
      this.held.delete(name);
    }
  }
}

class LostLocks {
  private rejectRequest!: (reason: Error) => void;

  request<T>(
    name: string, _options: LockOptions, callback: (lock: Lock) => Promise<T>,
  ): Promise<T> {
    void callback({ name, mode: 'exclusive' } as Lock);
    return new Promise<T>((_resolve, reject) => { this.rejectRequest = reject; });
  }

  lose(): void { this.rejectRequest(new Error('Lock lost')); }
}

describe('project write ownership', () => {
  it('rejects writes when Web Locks are unavailable', async () => {
    const ownership = new ProjectOwnership(undefined);
    await expect(ownership.acquire('project-1')).rejects.toBeInstanceOf(WriteAccessError);
    await expect(ownership.run('project-1', async () => undefined))
      .rejects.toBeInstanceOf(WriteAccessError);
  });

  it('permits one writer and refreshes data after handoff', async () => {
    const locks = new FakeLocks() as unknown as LockManager;
    const first = new ProjectOwnership(locks);
    const second = new ProjectOwnership(locks);
    const database = new ExamDatabase(`ownership-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
    const firstRepository = new ProjectRepository(database, first);
    const secondRepository = new ProjectRepository(database, second);
    try {
      const lease = await first.acquire('project-1');
      expect(lease).not.toBeNull();
      await firstRepository.create({
        project: {
          id: 'project-1', name: 'Latest', createdAt: 1, updatedAt: 1,
          pageSettings: structuredClone(DEFAULT_PAGE_SETTINGS), schemaVersion: 1,
        },
        document: createEmptyDocument('project-1'), assets: [],
      });
      expect(await second.acquire('project-1')).toBeNull();
      await expect(secondRepository.delete('project-1')).rejects.toBeInstanceOf(WriteAccessError);
      await lease!.release();
      const handoff = await second.acquireLatest('project-1', () => secondRepository.get('project-1'));
      expect(handoff?.value?.project.name).toBe('Latest');
      await handoff?.lease.release();
    } finally {
      await first.releaseAll();
      await second.releaseAll();
      database.close();
      await database.delete();
    }
  });

  it('waits for an active mutation before releasing its lock', async () => {
    const ownership = new ProjectOwnership(new FakeLocks() as unknown as LockManager);
    const lease = await ownership.acquire('project-1');
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const mutation = ownership.run('project-1', () => pending);
    const release = lease!.release();
    await expect(ownership.run('project-1', async () => undefined))
      .rejects.toBeInstanceOf(WriteAccessError);
    finish();
    await mutation;
    await release;
    expect(lease?.isActive).toBe(false);
  });

  it('refuses later mutations after the browser revokes a granted lock', async () => {
    const locks = new LostLocks();
    const ownership = new ProjectOwnership(locks as unknown as LockManager);
    const lease = await ownership.acquire('project-1');
    locks.lose();
    await lease?.done;
    expect(lease?.isActive).toBe(false);
    await expect(ownership.run('project-1', async () => undefined))
      .rejects.toBeInstanceOf(WriteAccessError);
  });
});
