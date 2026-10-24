import { expect, test } from '@playwright/test';

test('shows the project home heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '試卷專案' })).toBeVisible();
});
