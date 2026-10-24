export interface WriteAuthority {
  run<T>(projectId: string, operation: () => Promise<T>): Promise<T>;
}

export class WriteAccessError extends Error {
  constructor(message = 'Project write access is unavailable') {
    super(message);
    this.name = 'WriteAccessError';
  }
}

export class ProjectLease {
  private active = true;
  private operations = 0;
  private resolveHold!: () => void;
  readonly hold = new Promise<void>((resolve) => { this.resolveHold = resolve; });
  done: Promise<unknown> = Promise.resolve();

  constructor(readonly projectId: string) {}

  get isActive(): boolean { return this.active; }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.active) throw new WriteAccessError();
    this.operations += 1;
    try {
      if (!this.active) throw new WriteAccessError();
      return await operation();
    } finally {
      this.operations -= 1;
      if (!this.active && this.operations === 0) this.resolveHold();
    }
  }

  async release(): Promise<void> {
    this.invalidate();
    await this.done;
  }

  invalidate(): void {
    this.active = false;
    if (this.operations === 0) this.resolveHold();
  }
}

export class ProjectOwnership implements WriteAuthority {
  private readonly leases = new Map<string, ProjectLease>();

  constructor(private readonly locks: LockManager | undefined = navigator.locks) {}

  async acquire(projectId: string): Promise<ProjectLease | null> {
    if (!this.locks) throw new WriteAccessError('Web Locks are unavailable');
    if (this.leases.has(projectId)) throw new WriteAccessError('Already acquired in this tab');
    let resolve!: (lease: ProjectLease | null) => void;
    let reject!: (reason: unknown) => void;
    let granted: ProjectLease | null = null;
    const acquired = new Promise<ProjectLease | null>((yes, no) => { resolve = yes; reject = no; });
    const done = this.locks.request(`exam-project:${projectId}`, { ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(null); return; }
      const lease = new ProjectLease(projectId);
      granted = lease;
      this.leases.set(projectId, lease);
      resolve(lease);
      try { await lease.hold; } finally {
        lease.invalidate();
        if (this.leases.get(projectId) === lease) this.leases.delete(projectId);
      }
    }).catch((error: unknown) => {
      granted?.invalidate();
      if (this.leases.get(projectId) === granted) this.leases.delete(projectId);
      reject(error);
    });
    const lease = await acquired;
    if (lease) lease.done = done;
    return lease;
  }

  async run<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    const lease = this.leases.get(projectId);
    if (!lease) throw new WriteAccessError();
    return lease.run(operation);
  }

  async acquireLatest<T>(
    projectId: string, read: () => Promise<T>,
  ): Promise<{ lease: ProjectLease; value: T } | null> {
    const lease = await this.acquire(projectId);
    if (!lease) return null;
    try { return { lease, value: await read() }; } catch (error) {
      await lease.release();
      throw error;
    }
  }

  async releaseAll(): Promise<void> {
    await Promise.all([...this.leases.values()].map((lease) => lease.release()));
  }
}
