import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectOwnership } from '../../data/ownership';
import type { ProjectRepository } from '../../data/repository';
import type { ImportedProject, ImportStage } from '../import-docx/importProject';
import { readImportWarnings } from '../import-docx/importNotices';
import { DocxImportError } from '../import-docx/limits';
import { ProjectHome } from './ProjectHome';

const repository = { list: vi.fn(async () => []) } as unknown as ProjectRepository;
const ownership = {} as ProjectOwnership;
const file = new File(['docx'], 'sample.docx');

function chooseFile() {
  fireEvent.change(screen.getByLabelText('匯入 DOCX'), { target: { files: [file] } });
}

afterEach(() => { cleanup(); sessionStorage.clear(); window.location.hash = '#/'; });

describe('DOCX import UI', () => {
  it('opens the project and displays its warnings after success', async () => {
    const importer = vi.fn(async (_file: File, _repository: ProjectRepository,
      _ownership: ProjectOwnership, _signal: AbortSignal,
      onStage: (stage: ImportStage) => void): Promise<ImportedProject> => {
      onStage('converting');
      onStage('saving');
      return { projectId: 'imported', warnings: ['公式需校對'] };
    });
    render(<ProjectHome repository={repository} ownership={ownership} importer={importer} />);
    chooseFile();
    await waitFor(() => expect(window.location.hash).toBe('#/projects/imported'));
    expect(readImportWarnings('imported')).toContain('公式需校對');
    expect(importer).toHaveBeenCalledOnce();
  });

  it('cancels conversion without opening a project', async () => {
    const importer = vi.fn((_file: File, _repository: ProjectRepository,
      _ownership: ProjectOwnership, signal: AbortSignal,
      onStage: (stage: ImportStage) => void): Promise<ImportedProject> => {
      onStage('converting');
      return new Promise((_resolve, reject) => signal.addEventListener('abort',
        () => reject(new DocxImportError('cancelled', '匯入已取消'))));
    });
    render(<ProjectHome repository={repository} ownership={ownership} importer={importer} />);
    chooseFile();
    expect(screen.getByLabelText('匯入 DOCX')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '取消匯入' }));
    expect(await screen.findByText('匯入已取消')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
    expect(importer).toHaveBeenCalledOnce();
  });

  it('shows a quota failure and stays on the home page', async () => {
    const importer = vi.fn(async (): Promise<ImportedProject> => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    render(<ProjectHome repository={repository} ownership={ownership} importer={importer} />);
    chooseFile();
    expect(await screen.findByRole('alert')).toHaveTextContent('Quota exceeded');
    expect(window.location.hash).toBe('#/');
  });

  it('prevents repeated import while conversion is pending', async () => {
    let finish!: (value: ImportedProject) => void;
    const importer = vi.fn((_file: File, _repository: ProjectRepository,
      _ownership: ProjectOwnership, _signal: AbortSignal,
      onStage: (stage: ImportStage) => void) => {
      onStage('converting');
      return new Promise<ImportedProject>((resolve) => { finish = resolve; });
    });
    render(<ProjectHome repository={repository} ownership={ownership} importer={importer} />);
    chooseFile();
    chooseFile();
    expect(importer).toHaveBeenCalledOnce();
    finish({ projectId: 'once', warnings: [] });
    await waitFor(() => expect(window.location.hash).toBe('#/projects/once'));
  });

  it('aborts conversion and does not redirect after leaving the home page', async () => {
    let finish!: (value: ImportedProject) => void;
    let signal!: AbortSignal;
    const importer = vi.fn((_file: File, _repository: ProjectRepository,
      _ownership: ProjectOwnership, currentSignal: AbortSignal,
      onStage: (stage: ImportStage) => void) => {
      signal = currentSignal;
      onStage('converting');
      return new Promise<ImportedProject>((resolve) => { finish = resolve; });
    });
    const view = render(<ProjectHome repository={repository} ownership={ownership} importer={importer} />);
    chooseFile();
    view.unmount();
    expect(signal.aborted).toBe(true);
    finish({ projectId: 'orphan', warnings: [] });
    await Promise.resolve();
    expect(window.location.hash).toBe('#/');
  });
});
