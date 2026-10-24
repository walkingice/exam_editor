import { expect, test } from '@playwright/test';
import type {} from '../../src/test/ownership-harness';

test('creates, reloads, reopens, and deletes a project', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  await expect(page.getByRole('heading', { name: '試卷內容' })).toBeVisible();
  const projectUrl = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: '試卷內容' })).toBeVisible();
  await page.getByRole('link', { name: '返回首頁' }).click();
  await page.getByRole('link', { name: '未命名試卷' }).click();
  await expect(page).toHaveURL(projectUrl);
  await page.goto(projectUrl);
  await expect(page.getByRole('heading', { name: '試卷內容' })).toBeVisible();
  await page.getByRole('link', { name: '返回首頁' }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '刪除 未命名試卷' }).click();
  await expect(page.getByText('還沒有試卷。建立一份空白試卷開始。')).toBeVisible();
  await page.goto(projectUrl);
  await expect(page.getByText('找不到這份試卷。')).toBeVisible();
});

test('prevents another tab from deleting until ownership changes', async ({ context, page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  await expect(page.getByRole('heading', { name: '試卷內容' })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/');
  second.on('dialog', (dialog) => dialog.accept());
  await second.getByRole('button', { name: '刪除 未命名試卷' }).click();
  await expect(second.getByRole('alert')).toContainText('另一個分頁正在使用此 Project');
  await page.close();
  await second.getByRole('button', { name: '刪除 未命名試卷' }).click();
  await expect(second.getByText('還沒有試卷。建立一份空白試卷開始。')).toBeVisible();
});

test('opens the latest project after a writer hands off', async ({ context, page }) => {
  const owner = await context.newPage();
  const id = `handoff-${crypto.randomUUID()}`;
  await owner.goto('/tests/harness/');
  await owner.waitForFunction(() => !!window.ownershipHarness);
  await owner.evaluate((projectId) => window.ownershipHarness.acquire(projectId), id);
  await owner.evaluate((projectId) => window.ownershipHarness.create(projectId), id);
  await page.goto(`/#/projects/${id}`);
  await expect(page.getByText(/目前為唯讀/)).toBeVisible();
  await owner.evaluate((projectId) => window.ownershipHarness.rename(projectId, 'Latest'), id);
  await owner.close();
  await page.getByRole('button', { name: '重新取得寫入權' }).click();
  await expect(page.getByRole('heading', { name: 'Latest' })).toBeVisible();
});

test('renders a stored image after reloading the workspace', async ({ context, page }) => {
  const setup = await context.newPage();
  const id = `image-${crypto.randomUUID()}`;
  await setup.goto('/tests/harness/');
  await setup.waitForFunction(() => !!window.ownershipHarness);
  await setup.evaluate((projectId) => window.ownershipHarness.acquire(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.createWithImage(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.release(projectId), id);
  await setup.close();
  await page.goto(`/#/projects/${id}`);
  await expect(page.getByText('Stored image')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Fixture image' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Fixture image' })).toHaveJSProperty('naturalWidth', 1);
  await page.reload();
  await expect(page.getByRole('img', { name: 'Fixture image' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Fixture image' })).toHaveJSProperty('naturalWidth', 1);
});

test('cleans an unused image after leaving the workspace', async ({ context, page }) => {
  const setup = await context.newPage();
  const id = `cleanup-${crypto.randomUUID()}`;
  await setup.goto('/tests/harness/');
  await setup.waitForFunction(() => !!window.ownershipHarness);
  await setup.evaluate((projectId) => window.ownershipHarness.acquire(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.createWithImage(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.addUnusedImage(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.release(projectId), id);
  await page.goto(`/#/projects/${id}`);
  await expect(page.getByRole('img', { name: 'Fixture image' })).toBeVisible();
  await page.getByRole('link', { name: '返回首頁' }).click();
  await expect(page.getByRole('link', { name: 'Image fixture' })).toBeVisible();
  await expect.poll(() => setup.evaluate((projectId) =>
    window.ownershipHarness.assetIds(projectId), id)).toEqual([`image-${id}`]);
});

test('completes interrupted cleanup before reopening a writer', async ({ context, page }) => {
  const setup = await context.newPage();
  const id = `pending-${crypto.randomUUID()}`;
  await setup.goto('/tests/harness/');
  await setup.waitForFunction(() => !!window.ownershipHarness);
  await setup.evaluate((projectId) => window.ownershipHarness.acquire(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.createWithImage(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.addUnusedImage(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.leaveCleanupPending(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.release(projectId), id);
  await page.goto(`/#/projects/${id}`);
  await expect(page.getByRole('img', { name: 'Fixture image' })).toBeVisible();
  expect(await setup.evaluate((projectId) => window.ownershipHarness.assetIds(projectId), id))
    .toEqual([`image-${id}`]);
});

test('cleans unused assets after closing and reopening a tab', async ({ context, page }) => {
  const setup = await context.newPage();
  const id = `tab-close-${crypto.randomUUID()}`;
  await setup.goto('/tests/harness/');
  await setup.waitForFunction(() => !!window.ownershipHarness);
  await setup.evaluate((projectId) => window.ownershipHarness.acquire(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.createWithImage(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.addUnusedImage(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.release(projectId), id);
  await page.goto(`/#/projects/${id}`);
  await expect(page.getByRole('img', { name: 'Fixture image' })).toBeVisible();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`/#/projects/${id}`);
  await expect(reopened.getByRole('img', { name: 'Fixture image' })).toBeVisible();
  expect(await setup.evaluate((projectId) => window.ownershipHarness.assetIds(projectId), id))
    .toEqual([`image-${id}`]);
});

test('keeps the second tab editor read-only', async ({ context, page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  await second.locator('.ProseMirror').focus();
  await second.keyboard.press('ControlOrMeta+A');
  await second.keyboard.type('Blocked');
  await expect(second.locator('.ProseMirror')).not.toContainText('Blocked');
});

test('saves edits and the project name before reopening', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  await page.locator('.ProseMirror').fill('Saved text');
  await page.getByLabel('試卷名稱').fill('Renamed exam');
  await page.getByRole('button', { name: '更名' }).click();
  await expect(page.getByRole('status')).toContainText('已儲存');
  await page.getByRole('link', { name: '返回首頁' }).click();
  await page.getByRole('link', { name: 'Renamed exam' }).click();
  await expect(page.locator('.ProseMirror')).toContainText('Saved text');
});

test('keeps rich text marks after reloading', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  const editor = page.locator('.ProseMirror');
  await editor.fill('Marked question');
  await editor.press('ControlOrMeta+A');
  await page.getByRole('button', { name: '粗體' }).click();
  await expect(editor.locator('strong')).toHaveText('Marked question');
  await page.getByRole('link', { name: '返回首頁' }).click();
  await page.getByRole('link', { name: '未命名試卷' }).click();
  await page.reload();
  await expect(editor.locator('strong')).toHaveText('Marked question');
});

test('keeps question selection and IDs after reopening', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  await page.locator('.ProseMirror').fill('Selected question');
  await page.getByRole('button', { name: '項目清單' }).click();
  const item = page.locator('.ProseMirror > ul > li');
  await expect(item.getByRole('checkbox')).toBeChecked();
  const id = await item.getAttribute('data-node-id');
  await item.getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: '復原' }).click();
  await expect(item.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: '重做' }).click();
  await expect(item.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('link', { name: '返回首頁' }).click();
  await page.getByRole('link', { name: '未命名試卷' }).click();
  await expect(item.getByRole('checkbox')).not.toBeChecked();
  await expect(item).toHaveAttribute('data-node-id', id!);
});

test('drags a full question across sections and reopens it', async ({ context, page }) => {
  const setup = await context.newPage();
  const id = `move-${crypto.randomUUID()}`;
  await setup.goto('/tests/harness/');
  await setup.waitForFunction(() => !!window.ownershipHarness);
  await setup.evaluate((projectId) => window.ownershipHarness.acquire(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.createQuestionSections(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.release(projectId), id);
  await setup.close();
  await page.goto(`/#/projects/${id}`);
  const item = page.locator('.ProseMirror > ul > li');
  const itemId = await item.getAttribute('data-node-id');
  await item.getByRole('button', { name: /移動題目/ })
    .dragTo(page.getByRole('heading', { name: 'Section two' }));
  await expect(page.locator('.ProseMirror > h2').nth(1)
    .locator('xpath=following-sibling::*[1][self::ul]')).toHaveCount(1);
  await expect(item).toHaveAttribute('data-node-id', itemId!);
  await expect(item).toContainText('Option');
  await expect(item.getByRole('img', { name: 'Question image' })).toBeVisible();
  await page.getByRole('button', { name: '復原' }).click();
  await expect(page.locator('.ProseMirror > h2').first()
    .locator('xpath=following-sibling::*[1][self::ul]')).toHaveCount(1);
  await page.getByRole('button', { name: '重做' }).click();
  await page.getByRole('link', { name: '返回首頁' }).click();
  await page.getByRole('link', { name: 'Question sections' }).click();
  await expect(item).toHaveAttribute('data-node-id', itemId!);
  await expect(item.getByRole('img', { name: 'Question image' })).toBeVisible();
});

test('persists a complete multi-section editing session', async ({ context, page }) => {
  const setup = await context.newPage();
  const id = `session-${crypto.randomUUID()}`;
  await setup.goto('/tests/harness/');
  await setup.waitForFunction(() => !!window.ownershipHarness);
  await setup.evaluate((projectId) => window.ownershipHarness.acquire(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.createMilestone2Fixture(projectId), id);
  await setup.evaluate((projectId) => window.ownershipHarness.release(projectId), id);
  await page.goto(`/#/projects/${id}`);
  const item = page.locator('.ProseMirror > ul > li').first();
  await expect(item.getByRole('img', { name: 'Question image' })).toBeVisible();
  await item.getByRole('cell').first().click();
  await page.keyboard.type(' revised');
  await expect(item.getByRole('cell').first()).toContainText('revised');
  await item.getByRole('button', { name: /移動題目/ })
    .dragTo(page.getByRole('heading', { name: 'Section two' }));
  await page.getByRole('button', { name: '復原' }).click();
  await page.getByRole('button', { name: '重做' }).click();
  await page.getByRole('link', { name: '返回首頁' }).click();
  await page.getByRole('link', { name: 'Milestone two fixture' }).click();
  await page.reload();
  await expect(page.getByText('Unselected question')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Shared image' })).toBeVisible();
  await expect(page.getByRole('cell').first()).toContainText('revised');
  await expect(page.locator('.ProseMirror > h2').nth(1)
    .locator('xpath=following-sibling::*[1][self::ul] > li')).toHaveCount(2);
});

test('keeps an edited table after reloading', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  await page.getByRole('button', { name: '插入表格' }).click();
  const editor = page.locator('.ProseMirror');
  await editor.getByRole('cell').first().click();
  await page.keyboard.type('Answer');
  await page.getByRole('button', { name: '新增列' }).click();
  await expect(editor.getByRole('row')).toHaveCount(3);
  await page.getByRole('link', { name: '返回首頁' }).click();
  await page.getByRole('link', { name: '未命名試卷' }).click();
  await page.reload();
  await expect(editor.getByRole('row')).toHaveCount(3);
  await expect(editor.getByRole('cell').first()).toHaveText('Answer');
});

test('stores a locally inserted image across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  await page.getByLabel('插入圖片').setInputFiles('src/test/fixtures/red.jpg');
  const image = page.getByRole('img', { name: 'red.jpg' });
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty('naturalWidth', 1);
  await page.getByRole('link', { name: '返回首頁' }).click();
  await page.getByRole('link', { name: '未命名試卷' }).click();
  await page.reload();
  await expect(image).toHaveJSProperty('naturalWidth', 1);
});
