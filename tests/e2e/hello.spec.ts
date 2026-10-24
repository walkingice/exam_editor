import { expect, test } from '@playwright/test';

test('shows the Hello World heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hello World' })).toBeVisible();
});
