import { expect, test } from '@playwright/test';
import { Document, Packer, Paragraph, TextRun } from 'docx';

test('imports DOCX content and reopens it after reload', async ({ page }) => {
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
  await page.reload();
  await expect(page.getByText('中文試題')).toBeVisible();
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
