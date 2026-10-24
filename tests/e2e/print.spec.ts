import { expect, test } from '@playwright/test';

test('prints the current content tab snapshot without workspace controls', async ({ page }) => {
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
