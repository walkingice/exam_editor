import type { JSONContent } from '@tiptap/core';
import { normalizeDocument } from '../../domain/document';
import type { ProjectBundle } from '../../data/repository';
import type { ProjectRepository } from '../../data/repository';
import { validatePageSettings, type PageSettings } from '../../domain/types';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export class EditingSession {
  private bundle: ProjectBundle;
  private revision = 0;
  private savedRevision = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<void> | null = null;
  private closed = false;
  private state: SaveState = 'saved';

  constructor(bundle: ProjectBundle, private readonly repository: ProjectRepository,
    private readonly notify: (state: SaveState, error?: string) => void) {
    this.bundle = bundle;
  }

  get projectId(): string { return this.bundle.project.id; }
  get currentRevision(): number { return this.revision; }
  get snapshot(): ProjectBundle { return this.bundle; }
  get saveState(): SaveState { return this.state; }

  updateContent(content: JSONContent): void {
    if (this.closed) return;
    this.bundle = { ...this.bundle, document: {
      ...this.bundle.document, content: normalizeDocument(content),
    } };
    this.changed();
  }

  rename(name: string): void {
    if (this.closed) return;
    if (!name.trim()) throw new Error('試卷名稱不能為空');
    this.bundle = { ...this.bundle, project: { ...this.bundle.project, name: name.trim() } };
    this.changed();
  }

  updatePageSettings(settings: PageSettings): void {
    if (this.closed) return;
    validatePageSettings(settings);
    this.bundle = { ...this.bundle, project: { ...this.bundle.project,
      pageSettings: structuredClone(settings) } };
    this.changed();
  }

  private changed(): void {
    this.revision += 1;
    this.report('dirty');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.save().catch(() => {}); }, 800);
  }

  private report(state: SaveState, error?: string): void {
    this.state = state;
    this.notify(state, error);
  }

  async save(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.pending) { await this.pending; return this.save(); }
    if (this.savedRevision === this.revision) return;
    const revision = this.revision;
    const snapshot = { ...this.bundle, project: {
      ...this.bundle.project, updatedAt: Math.max(Date.now(), this.bundle.project.createdAt),
    } };
    this.report('saving');
    const operation = this.repository.save(snapshot);
    this.pending = operation;
    try {
      await operation;
      this.savedRevision = revision;
      if (this.revision === revision) {
        this.bundle = snapshot;
        this.report('saved');
      } else this.report('dirty');
    } catch (cause) {
      this.report('error', cause && typeof cause === 'object' && 'message' in cause
        && typeof cause.message === 'string' ? cause.message : '儲存失敗');
      throw cause;
    } finally {
      if (this.pending === operation) this.pending = null;
    }
  }

  async flush(): Promise<void> {
    while (this.savedRevision !== this.revision) await this.save();
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
