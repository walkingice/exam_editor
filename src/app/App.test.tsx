import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectLease, type ProjectOwnership } from '../data/ownership';
import type { ProjectRepository, ProjectBundle } from '../data/repository';
import { notifyProjectDeleted } from '../data/projectEvents';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS } from '../domain/types';
import { GEMINI_API_KEY_STORAGE_KEY, GEMINI_MODEL_STORAGE_KEY } from '../shared/storageKeys';
import { App } from './App';

const records = new Map<string, ProjectBundle>();
let locked = false;
let listError = false;

const repository = {
  list: vi.fn(async () => {
    if (listError) throw new Error('Storage failed');
    return [...records.values()].map(({ project }) => project);
  }),
  get: vi.fn(async (id: string) => records.get(id) ?? null),
  beginSession: vi.fn(async (id: string) => repository.get(id)),
  finishSession: vi.fn(async () => {}),
  create: vi.fn(async (bundle: ProjectBundle) => { records.set(bundle.project.id, bundle); }),
  save: vi.fn(async (bundle: ProjectBundle) => { records.set(bundle.project.id, bundle); }),
  delete: vi.fn(async (id: string) => { records.delete(id); }),
} as unknown as ProjectRepository;

const ownership = {
  acquire: vi.fn(async (id: string) => locked ? null : new ProjectLease(id)),
  acquireLatest: vi.fn(async (id: string, read: () => Promise<ProjectBundle | null>) => {
    const lease = await ownership.acquire(id);
    return lease ? { lease, value: await read() } : null;
  }),
} as unknown as ProjectOwnership;

beforeEach(() => {
  window.location.hash = '#/';
  window.localStorage.clear();
  records.clear();
  locked = false;
  listError = false;
  vi.clearAllMocks();
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('project navigation', () => {
  it('saves the Gemini API key in browser settings and links to setup help', async () => {
    render(<App projects={repository} writes={ownership} />);
    await screen.findByRole('button', { name: /建立空白試卷/ });
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    expect(screen.getByRole('dialog', { name: 'AI 設定' })).toBeInTheDocument();
    const applyLink = screen.getByRole('link', { name: '申請金鑰' });
    const helpLink = screen.getByRole('link', { name: '如何申請' });
    expect(applyLink).toHaveAttribute('href', 'https://aistudio.google.com/');
    expect(applyLink).toHaveAttribute('target', '_blank');
    expect(helpLink).toHaveAttribute('href', 'https://www.google.com/search?q=%E5%A6%82%E4%BD%95%E7%94%B3%E8%AB%8B+Gemini+API+Key');
    expect(helpLink).toHaveAttribute('target', '_blank');
    fireEvent.change(screen.getByLabelText('Gemini API key'), { target: { value: 'test-key' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)).toBe('test-key');
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    expect(screen.getByLabelText('Gemini API key')).toHaveValue('test-key');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('loads Gemini models that support content generation and saves the selection', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ models: [
        { name: 'models/gemini-custom', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] },
      ] }),
    } as Response);
    render(<App projects={repository} writes={ownership} />);
    await screen.findByRole('button', { name: /建立空白試卷/ });
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('gemini-3.5-flash-lite');
    fireEvent.change(screen.getByLabelText('Gemini API key'), { target: { value: 'test-key' } });
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByRole('option', { name: 'gemini-custom' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'gemini-embedding' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': 'test-key' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: 'gemini-custom' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(window.localStorage.getItem(GEMINI_MODEL_STORAGE_KEY)).toBe('gemini-custom');
  });

  it('creates a complete project, reopens it, and deletes it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App projects={repository} writes={ownership} />);
    expect(await screen.findByText('你的工作區還很清爽')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /建立空白試卷/ }));
    await screen.findByRole('heading', { name: '試卷內容' });
    const saved = [...records.values()][0];
    expect(saved.document.content.type).toBe('doc');
    expect(saved.project.pageSettings.paperSize).toBe('TW_B4');
    fireEvent.click(screen.getByRole('link', { name: '返回首頁' }));
    expect(await screen.findByRole('link', { name: /未命名試卷/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /未命名試卷/ }));
    expect(await screen.findByRole('heading', { name: '試卷內容' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '返回首頁' }));
    await screen.findByRole('button', { name: '刪除 未命名試卷' });
    fireEvent.click(screen.getByRole('button', { name: '刪除 未命名試卷' }));
    await waitFor(() => expect(records.size).toBe(0));
    expect(await screen.findByText('你的工作區還很清爽')).toBeInTheDocument();
  });

  it('shows missing, storage error, and unavailable write access', async () => {
    window.location.hash = '#/projects/missing';
    const view = render(<App projects={repository} writes={ownership} />);
    expect(await screen.findByText('找不到這份試卷。')).toBeInTheDocument();
    view.unmount();
    window.location.hash = '#/';
    listError = true;
    const home = render(<App projects={repository} writes={ownership} />);
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Storage failed');
    home.unmount();
    listError = false;
    locked = true;
    render(<App projects={repository} writes={ownership} />);
    await screen.findByRole('button', { name: /建立空白試卷/ });
    fireEvent.click(screen.getByRole('button', { name: /建立空白試卷/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Project write access is unavailable');
    expect(records.size).toBe(0);
  });

  it('closes a workspace when its project is deleted elsewhere', async () => {
    const id = 'deleted-project';
    window.location.hash = '#/';
    const home = render(<App projects={repository} writes={ownership} />);
    await screen.findByRole('button', { name: /建立空白試卷/ });
    fireEvent.click(screen.getByRole('button', { name: /建立空白試卷/ }));
    await screen.findByRole('heading', { name: '試卷內容' });
    const actualId = [...records.keys()][0];
    expect(actualId).not.toBe(id);
    records.delete(actualId);
    notifyProjectDeleted(actualId);
    expect(await screen.findByText('找不到這份試卷。')).toBeInTheDocument();
    home.unmount();
  });

  it('does not restore a deleted project after an earlier read finishes', async () => {
    const id = 'slow-project';
    const bundle: ProjectBundle = {
      project: { id, name: 'Slow', createdAt: 1, updatedAt: 1, schemaVersion: 1,
        pageSettings: structuredClone(DEFAULT_PAGE_SETTINGS) },
      document: createEmptyDocument(id), assets: [],
    };
    let finishRead!: (value: ProjectBundle | null) => void;
    vi.spyOn(repository, 'get').mockImplementationOnce(() => new Promise((resolve) => {
      finishRead = resolve;
    }));
    window.location.hash = `#/projects/${id}`;
    render(<App projects={repository} writes={ownership} />);
    await waitFor(() => expect(finishRead).toBeTypeOf('function'));
    notifyProjectDeleted(id);
    finishRead(bundle);
    expect(await screen.findByText('找不到這份試卷。')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Slow' })).toBeNull());
  });

  it('stays in the workspace when a route change cannot save', async () => {
    vi.spyOn(repository, 'save').mockRejectedValue(new DOMException('Quota exceeded', 'QuotaExceededError'));
    render(<App projects={repository} writes={ownership} />);
    await screen.findByRole('button', { name: /建立空白試卷/ });
    fireEvent.click(screen.getByRole('button', { name: /建立空白試卷/ }));
    await screen.findByRole('heading', { name: '試卷內容' });
    const projectUrl = window.location.hash;
    fireEvent.change(screen.getByLabelText('試卷名稱'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: '更名' }));
    window.location.hash = '#/';
    await waitFor(() => expect(window.location.hash).toBe(projectUrl));
    expect(screen.getByRole('heading', { name: 'Changed' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Quota exceeded');
    expect(screen.getByRole('button', { name: '重試儲存' })).toBeInTheDocument();
  });
});
