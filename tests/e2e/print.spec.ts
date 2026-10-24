import { expect, test } from '@playwright/test';

test('prints the latest content snapshot without workspace controls', async ({ page }) => {
  await page.addInitScript(() => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    (window as unknown as { releasePrintFonts: () => void }).releasePrintFonts = release;
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  const source = page.getByRole('tabpanel').first().locator('.ProseMirror');
  await source.fill('最新未儲存的列印內容');
  await page.getByRole('tab', { name: '排版預覽' }).click();
  await page.evaluate(() => {
    window.print = () => {
      const root = document.querySelector<HTMLElement>('#exam-print-root');
      const main = document.querySelector<HTMLElement>('main');
      const detail = { text: root?.innerText ?? '', checkboxes: root?.querySelectorAll('input[type="checkbox"]').length,
        mainVisibility: main ? getComputedStyle(main).visibility : '',
        rootDisplay: root ? getComputedStyle(root).display : '' };
      window.dispatchEvent(new CustomEvent('test-print', { detail }));
    };
  });
  const printed = page.evaluate(() => new Promise<{ text: string; checkboxes: number;
    mainVisibility: string; rootDisplay: string }>((resolve) => {
    window.addEventListener('test-print', (event) => resolve(
      (event as CustomEvent).detail), { once: true });
  }));
  await page.getByRole('button', { name: '列印 / PDF' }).click();
  await page.locator('#exam-print-root').waitFor({ state: 'attached' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => (window as unknown as { releasePrintFonts: () => void })
    .releasePrintFonts());
  const inspection = await printed;
  expect(inspection.text).toContain('最新未儲存的列印內容');
  expect(inspection.checkboxes).toBe(0);
  expect(inspection.mainVisibility).toBe('hidden');
  expect(inspection.rootDisplay).toBe('block');
});

test('prints from the preview tab using the same selected output', async ({ page }) => {
  await page.addInitScript(() => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    (window as unknown as { releasePrintFonts: () => void }).releasePrintFonts = release;
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  const source = page.getByRole('tabpanel').first().locator('.ProseMirror');
  await source.fill('Preview source text');
  await page.getByRole('tab', { name: '排版預覽' }).click();
  await page.evaluate(() => { window.print = () => {
    const detail = document.querySelector('#exam-print-root')?.textContent ?? '';
    window.dispatchEvent(new CustomEvent('test-print', { detail }));
  }; });
  const printed = page.evaluate(() => new Promise<string>((resolve) => {
    window.addEventListener('test-print', (event) => resolve(
      (event as CustomEvent<string>).detail), { once: true });
  }));
  await page.getByRole('button', { name: '列印 / PDF' }).click();
  await page.locator('#exam-print-root').waitFor({ state: 'attached' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => (window as unknown as { releasePrintFonts: () => void })
    .releasePrintFonts());
  expect(await printed).toContain('Preview source text');
});

test('switches preview columns while keeping headings across the page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  const source = page.getByRole('tabpanel').first().locator('.ProseMirror');
  await source.fill('Exam title');
  await source.press('ControlOrMeta+Alt+1');
  await source.press('End');
  await source.press('Enter');
  await source.press('ControlOrMeta+Alt+2');
  await page.keyboard.type('Student details');
  await source.press('Enter');
  await page.keyboard.type('Question body');
  await page.getByRole('tab', { name: '排版預覽' }).click();
  await page.getByLabel('欄數').selectOption('2');
  const preview = page.locator('.preview-paper .ProseMirror');
  await expect(preview).toHaveCSS('column-count', '2');
  await expect(preview.locator('h1')).toHaveCSS('column-span', 'all');
  await expect(preview.locator('h2')).toHaveCSS('column-span', 'all');
  await expect(preview.locator('p').filter({ hasText: 'Question body' })).toHaveCSS('column-span', 'none');
  await expect(page.getByRole('status')).toHaveText('已儲存');
  await page.reload();
  await page.getByRole('tab', { name: '排版預覽' }).click();
  await expect(page.getByLabel('欄數')).toHaveValue('2');
  await page.getByLabel('欄數').selectOption('1');
  await expect(preview).toHaveCSS('column-count', 'auto');
  await page.getByLabel('方向').selectOption('landscape');
  await page.getByLabel('欄數').selectOption('2');
  await expect(preview).toHaveCSS('writing-mode', 'vertical-rl');
  await expect(preview).toHaveCSS('column-count', '2');
  await expect(preview.locator('h1')).toHaveCSS('column-span', 'none');
  await expect(preview.locator('h2')).toHaveCSS('column-span', 'none');
  const height = await preview.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeCloseTo(235 * 96 / 25.4, 0);
  await page.getByLabel('方向').selectOption('portrait');
  await expect(preview).toHaveCSS('writing-mode', 'horizontal-tb');
  await expect(preview.locator('h1')).toHaveCSS('column-span', 'all');
});

test('prints a locally inserted image after it loads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  await page.getByLabel('插入圖片').setInputFiles('src/test/fixtures/red.jpg');
  await expect(page.getByRole('img', { name: 'red.jpg' })).toHaveJSProperty('naturalWidth', 1);
  await page.getByRole('tab', { name: '排版預覽' }).click();
  await page.evaluate(() => {
    window.print = () => {
      const image = document.querySelector<HTMLImageElement>('#exam-print-root img');
      document.body.dataset.printedImageWidth = String(image?.naturalWidth);
    };
  });
  await page.getByRole('button', { name: '列印 / PDF' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-printed-image-width', '1');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
