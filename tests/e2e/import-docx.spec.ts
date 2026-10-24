import { expect, test } from '@playwright/test';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { readFileSync } from 'node:fs';

test('imports DOCX content and reopens it after reload', async ({ context, page }) => {
  const document = new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun('中文試題')] }),
  ] }] });
  const buffer = await Packer.toBuffer(document);
  await page.goto('/');
  await page.getByLabel('匯入 DOCX').setInputFiles({
    name: '測驗.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer,
  });
  await expect(page.getByRole('heading', { name: '測驗' })).toBeVisible();
  await expect(page.getByText('中文試題')).toBeVisible();
  await expect(page.getByLabel('匯入提醒')).toBeVisible();
  const projectUrl = page.url();
  await page.reload();
  await expect(page.getByText('中文試題')).toBeVisible();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(projectUrl);
  await expect(reopened.getByText('中文試題')).toBeVisible();
});

test('rejects damaged DOCX without creating a project', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('匯入 DOCX').setInputFiles({
    name: 'damaged.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('PK\x03\x04broken'),
  });
  await expect(page.getByRole('alert')).toContainText('DOCX 損壞');
  await expect(page.getByText('還沒有試卷。建立一份空白試卷開始。')).toBeVisible();
});

test('imports Chinese questions, merged tables, and two stored images', async ({ page }) => {
  await page.goto('/');
  for (const name of ['chinese-questions', 'merged-table', 'mixed-images']) {
    await page.getByLabel('匯入 DOCX').setInputFiles({
      name: `${name}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: readFileSync(`src/test/fixtures/docx/${name}.docx`),
    });
    await expect(page.getByRole('heading', { name })).toBeVisible();
    if (name === 'chinese-questions') {
      await expect(page.getByText('國語試卷')).toBeVisible();
    } else if (name === 'merged-table') {
      await expect(page.getByRole('table')).toContainText('跨兩欄');
    } else {
      await expect(page.getByRole('img', { name: 'Large PNG' })).toBeVisible();
      await expect(page.getByRole('img', { name: 'Small JPEG' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('img', { name: 'Small JPEG' })).toBeVisible();
    }
    await page.getByRole('link', { name: '返回首頁' }).click();
  }
});
