import type { Asset } from '../../domain/types';

export type AssetHandle = { url: string; release: () => void };

export class AssetResolver {
  private readonly urls = new Set<string>();
  private disposed = false;
  private generation = 0;

  constructor(
    private readonly projectId: string,
    private readonly lookup: (projectId: string, assetId: string) => Promise<Asset | null>,
    private readonly urlApi: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
  ) {}

  async acquire(assetId: string): Promise<AssetHandle | null> {
    if (this.disposed) return null;
    const generation = this.generation;
    const asset = await this.lookup(this.projectId, assetId);
    if (this.disposed || generation !== this.generation || !asset) return null;
    const url = this.urlApi.createObjectURL(asset.blob);
    this.urls.add(url);
    return { url, release: () => this.release(url) };
  }

  activate(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    for (const url of [...this.urls]) this.release(url);
  }

  private release(url: string): void {
    if (!this.urls.delete(url)) return;
    this.urlApi.revokeObjectURL(url);
  }
}
