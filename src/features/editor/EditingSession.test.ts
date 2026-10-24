import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS, DOCUMENT_SCHEMA_VERSION } from '../../domain/types';
import type { ProjectBundle, ProjectRepository } from '../../data/repository';
import { EditingSession } from './EditingSession';

const projectId = 'project';
function bundle(): ProjectBundle {
  return { project: { id: projectId, name: 'Original', createdAt: 1, updatedAt: 1,
    pageSettings: DEFAULT_PAGE_SETTINGS, schemaVersion: DOCUMENT_SCHEMA_VERSION },
  document: createEmptyDocument(projectId), assets: [] };
}

afterEach(() => { vi.useRealTimers(); });

describe('editing autosave', () => {
  it('debounces changes and stores a normalized snapshot', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_snapshot: ProjectBundle) => {});
    const notify = vi.fn();
    const session = new EditingSession(bundle(), { save } as unknown as ProjectRepository, notify);
    session.updateContent({ type: 'doc', content: [{ type: 'paragraph',
      content: [{ type: 'text', text: 'Changed' }] }] });
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].document.content.content?.[0].attrs?.id).toBeTruthy();
    expect(session.saveState).toBe('saved');
  });

  it('serializes revisions and flushes the latest content', async () => {
    let finish!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    const session = new EditingSession(bundle(), { save } as unknown as ProjectRepository, vi.fn());
    session.rename('First');
    const first = session.save();
    session.rename('Second');
    const flush = session.flush();
    expect(save).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await flush;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].project.name).toBe('Second');
  });

  it('keeps one save in flight with three concurrent flush callers', async () => {
    let finish!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    const session = new EditingSession(bundle(), { save } as unknown as ProjectRepository, vi.fn());
    session.rename('First');
    const first = session.flush();
    session.rename('Second');
    const others = [session.flush(), session.flush(), session.flush()];
    finish();
    await Promise.all([first, ...others]);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('keeps an error visible and retries after quota failure', async () => {
    const save = vi.fn().mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'))
      .mockResolvedValue(undefined);
    const notify = vi.fn();
    const session = new EditingSession(bundle(), { save } as unknown as ProjectRepository, notify);
    session.rename('New name');
    await expect(session.flush()).rejects.toThrow('Quota exceeded');
    expect(session.saveState).toBe('error');
    expect(notify).toHaveBeenLastCalledWith('error', 'Quota exceeded');
    await session.flush();
    expect(session.saveState).toBe('saved');
  });

  it('rejects an empty name without changing the project', () => {
    const session = new EditingSession(bundle(), { save: vi.fn() } as unknown as ProjectRepository, vi.fn());
    expect(() => session.rename('   ')).toThrow();
    expect(session.snapshot.project.name).toBe('Original');
  });

  it('persists valid page settings and rejects invalid ones', async () => {
    const save = vi.fn(async (_snapshot: ProjectBundle) => {});
    const session = new EditingSession(bundle(), { save } as unknown as ProjectRepository, vi.fn());
    const settings = { ...DEFAULT_PAGE_SETTINGS, paperSize: 'A4' as const,
      marginsMm: { top: 20, right: 10, bottom: 20, left: 10 } };
    session.updatePageSettings(settings);
    await session.flush();
    expect(save.mock.calls[0][0].project.pageSettings).toEqual(settings);
    expect(() => session.updatePageSettings({ ...settings,
      defaultFontSizePt: Number.NaN })).toThrow();
    expect(session.snapshot.project.pageSettings).toEqual(settings);
  });
});
