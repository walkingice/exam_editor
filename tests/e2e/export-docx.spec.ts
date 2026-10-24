import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { Document, HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow } from 'docx';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

async function documentXml(download: Download) {
  const path = await download.path();
  expect(path).not.toBeNull();
  const zip = await JSZip.loadAsync(readFileSync(path!));
  return { zip, xml: await zip.file('word/document.xml')!.async('string') };
}

async function workflowFixture() {
  return Packer.toBuffer(new Document({ numbering: { config: [{ reference: 'questions', levels: [
    { level: 0, format: LevelFormat.DECIMAL, text: '%1.' },
  ] }] }, sections: [{ children: [
    new Paragraph({ text: 'Section one', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: 'Excluded question', numbering: { reference: 'questions', level: 0 }, children: [
      new ImageRun({ type: 'jpg', data: readFileSync('src/test/fixtures/red.jpg'), transformation: { width: 24, height: 24 } }),
    ] }),
    new Paragraph({ text: 'Moved question', numbering: { reference: 'questions', level: 0 } }),
    new Paragraph({ text: 'Section two', heading: HeadingLevel.HEADING_2 }),
    new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Retained table')] })] })] }),
  ] }] }));
}

async function expectAllQuestionsExcluded(page: Page) {
  await page.locator('.content-panel .ProseMirror li').filter({ hasText: 'Moved question' }).getByRole('checkbox').uncheck();
  await page.getByRole('tab', { name: '排版預覽' }).click();
  await expect(page.locator('.preview-paper')).not.toContainText('Moved question');
  await page.getByRole('button', { name: '列印 / PDF' }).click();
  await expect(page.locator('#exam-print-root')).not.toContainText('Moved question');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 DOCX', exact: true }).click();
  const { xml } = await documentXml(await pending);
  expect(xml).not.toContain('Moved question');
  expect(xml).not.toContain('Excluded question');
  expect(xml).toContain('Section one');
  expect(xml).toContain('Retained table');
}

async function addExcludedTable(page: Page) {
  const question = page.locator('.content-panel .ProseMirror li').filter({ hasText: 'Excluded question' });
  await question.locator('p').first().click();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: '插入表格', exact: true }).click();
  await question.getByRole('cell').first().locator('p').click();
  await page.keyboard.type('Excluded table');
  await expect(question.getByRole('table')).toContainText('Excluded table');
}

for (const style of ['ordered', 'unordered']) {
  test(`exports the imported, edited, moved and filtered ${style} output`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('匯入 DOCX').setInputFiles({ name: 'export-workflow.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await workflowFixture() });
    const source = page.locator('.content-panel .ProseMirror');
    const excluded = source.locator('li').filter({ hasText: 'Excluded question' });
    await addExcludedTable(page);
    await excluded.getByRole('checkbox').uncheck();
    const moved = source.locator('li').filter({ hasText: 'Moved question' });
    await moved.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' revised');
    await moved.getByRole('button', { name: /移動題目/ }).dragTo(source.getByRole('heading', { name: 'Section two' }));
    await expect(source.locator('h2').locator('xpath=following-sibling::*[1][self::ul]')).toContainText('Moved question revised');
    await page.getByRole('link', { name: '返回首頁' }).click();
    await page.getByRole('link', { name: 'export-workflow' }).click();
    await page.reload();
    await expect(source).toContainText('Moved question revised');
    await expect(excluded.getByRole('checkbox')).not.toBeChecked();
    await page.getByRole('tab', { name: '排版預覽' }).click();
    await page.getByLabel('樣式', { exact: true }).selectOption(style);
    const preview = page.locator('.preview-paper');
    await expect(preview).toContainText('Moved question revised');
    expect((await preview.innerText()).indexOf('Section two')).toBeLessThan((await preview.innerText()).indexOf('Moved question revised'));
    await expect(preview).not.toContainText('Excluded question');
    await expect(preview.locator('table')).toHaveCount(1);
    await expect(preview.locator('img')).toHaveCount(0);
    await page.evaluate(() => { window.print = () => {}; });
    await page.getByRole('button', { name: '列印 / PDF' }).click();
    await expect(page.locator('#exam-print-root')).toContainText('Moved question revised');
    await expect(page.locator('#exam-print-root')).not.toContainText('Excluded question');
    const printedText = await page.locator('#exam-print-root').textContent();
    expect(printedText!.indexOf('Section two')).toBeLessThan(printedText!.indexOf('Moved question revised'));
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出 DOCX', exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('export-workflow.docx');
    const { zip, xml } = await documentXml(download);
    expect(xml).toContain('Moved question revised');
    expect(xml).toContain('Retained table');
    expect(xml.indexOf('Section two')).toBeLessThan(xml.indexOf('Moved question revised'));
    expect(xml).not.toContain('Excluded question');
    expect(xml).not.toContain('Excluded table');
    expect(Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)).toHaveLength(0);
    const numbering = await zip.file('word/numbering.xml')!.async('string');
    expect(numbering).toContain(`w:val="${style === 'ordered' ? 'decimal' : 'bullet'}"`);
    await page.getByRole('tab', { name: '試卷內容' }).click();
    await expect(source).toContainText('Excluded question');
    await expect(source.locator('img')).toHaveCount(1);
    await expect(source).toContainText('Excluded table');
    await expectAllQuestionsExcluded(page);
  });
}

test('downloads immediate edits from a blank project and its readonly loaded version', async ({ context, page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立空白試卷' }).click();
  const source = page.locator('.content-panel .ProseMirror');
  await source.fill('Immediate unsaved export');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 DOCX', exact: true }).click();
  expect((await documentXml(await pending)).xml).toContain('Immediate unsaved export');
  await expect(page.getByRole('status')).toContainText('已儲存');
  const reader = await context.newPage();
  await reader.goto(page.url());
  await expect(reader.locator('.content-panel .ProseMirror')).toHaveAttribute('contenteditable', 'false');
  const readonlyDownload = reader.waitForEvent('download');
  await reader.getByRole('button', { name: '匯出 DOCX', exact: true }).click();
  expect((await documentXml(await readonlyDownload)).xml).toContain('Immediate unsaved export');
  await expect(reader.getByRole('button', { name: '重新取得寫入權' })).toBeVisible();
});
