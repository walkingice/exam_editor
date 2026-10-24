import { describe, expect, it, vi } from 'vitest';
import { notifyProjectDeleted } from './projectEvents';

describe('project deletion notifications', () => {
  it('does not turn a completed deletion into a failure when broadcast fails', () => {
    const original = globalThis.BroadcastChannel;
    vi.stubGlobal('BroadcastChannel', class {
      constructor() { throw new Error('Broadcast unavailable'); }
    });
    try { expect(() => notifyProjectDeleted('project-1')).not.toThrow(); }
    finally { vi.stubGlobal('BroadcastChannel', original); }
  });
});
