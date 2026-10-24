import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '../../domain/types';
import { AssetResolver } from './AssetResolver';

function asset(projectId: string, id: string): Asset {
  return { id, projectId, mimeType: 'image/png', blob: new Blob(['image'], { type: 'image/png' }) };
}

describe('asset resolver', () => {
  it('looks up a blob and revokes its URL after release or disposal', async () => {
    const lookup = vi.fn(async (projectId: string, id: string) => asset(projectId, id));
    const urls = { createObjectURL: vi.fn(() => 'blob:one'), revokeObjectURL: vi.fn() };
    const resolver = new AssetResolver('first', lookup, urls);
    const handle = await resolver.acquire('image-1');
    expect(lookup).toHaveBeenCalledWith('first', 'image-1');
    expect(urls.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    handle?.release();
    handle?.release();
    expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1);
    await resolver.acquire('image-2');
    resolver.dispose();
    expect(urls.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(await resolver.acquire('image-3')).toBeNull();
  });

  it('does not create a URL for missing or late assets from another project', async () => {
    let finish!: (value: Asset | null) => void;
    const lookup = vi.fn((_projectId: string, _id: string) => new Promise<Asset | null>((resolve) => {
      finish = resolve;
    }));
    const urls = { createObjectURL: vi.fn(() => 'blob:late'), revokeObjectURL: vi.fn() };
    const first = new AssetResolver('first', lookup, urls);
    const pending = first.acquire('image-1');
    first.dispose();
    finish(asset('first', 'image-1'));
    expect(await pending).toBeNull();
    expect(urls.createObjectURL).not.toHaveBeenCalled();
    const second = new AssetResolver('second', async () => null, urls);
    expect(await second.acquire('image-1')).toBeNull();
    expect(lookup).toHaveBeenCalledWith('first', 'image-1');
  });
});
