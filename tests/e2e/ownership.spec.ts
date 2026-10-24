import { expect, test } from '@playwright/test';
import type {} from '../../src/test/ownership-harness';

test('only one tab writes and a new owner reads current data', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  const projectId = `ownership-${crypto.randomUUID()}`;
  try {
    await Promise.all([first.goto('/tests/harness/'), second.goto('/tests/harness/')]);
    await Promise.all([
      first.waitForFunction(() => !!window.ownershipHarness),
      second.waitForFunction(() => !!window.ownershipHarness),
    ]);
    expect((await first.evaluate((id) => window.ownershipHarness.acquire(id), projectId)).owned).toBe(true);
    await first.evaluate((id) => window.ownershipHarness.create(id), projectId);
    expect((await second.evaluate((id) => window.ownershipHarness.acquire(id), projectId)).owned).toBe(false);
    await expect(second.evaluate((id) => window.ownershipHarness.remove(id), projectId)).rejects.toThrow();
    await first.evaluate((id) => window.ownershipHarness.rename(id, 'Latest'), projectId);
    await first.close();
    const handoff = await second.evaluate((id) => window.ownershipHarness.acquire(id), projectId);
    expect(handoff.owned).toBe(true);
    expect(handoff.project?.name).toBe('Latest');
    await second.evaluate((id) => window.ownershipHarness.remove(id), projectId);
    expect(await second.evaluate((id) => window.ownershipHarness.read(id), projectId)).toBeNull();
  } finally {
    await context.close();
  }
});
