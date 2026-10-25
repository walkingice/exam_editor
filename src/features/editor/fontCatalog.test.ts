import { afterEach, expect, it } from 'vitest';
import { fontOptions, readRecentFonts, rememberFont } from './fontCatalog';
import { fontLabel } from './fontStyles';
import { RECENT_FONTS_STORAGE_KEY } from '../../shared/storageKeys';

afterEach(() => window.localStorage.removeItem(RECENT_FONTS_STORAGE_KEY));

it('keeps the five most recently used unique fonts across reloads', () => {
  for (const font of ['Arial', 'Font A', 'Font B', 'Font C', 'Font D', 'Font E', 'Font C']) {
    rememberFont(font);
  }
  expect(readRecentFonts()).toEqual(['Font C', 'Font E', 'Font D', 'Font B', 'Font A']);
  expect(JSON.parse(window.localStorage.getItem(RECENT_FONTS_STORAGE_KEY)!))
    .toEqual(readRecentFonts());
});

it('puts recent installed fonts first without duplicating other choices', () => {
  expect(fontOptions(['Font B', 'Font A', 'Font C'], ['Font C', 'Missing', 'Font A'], 'Font B'))
    .toEqual({ recent: ['Font C', 'Font A'], others: ['Font B'] });
  expect(fontOptions(null, ['Custom font'], 'Custom font').recent).toEqual(['Custom font']);
});

it('offers common Chinese fonts before local detection', () => {
  const { others } = fontOptions(null, [], '');
  expect(others).toEqual(expect.arrayContaining([
    'PMingLiU', 'SimSun', 'SimHei', '標楷體',
  ]));
  for (const font of ['王漢宗中楷體注音', '文鼎標楷注音', '華康標楷W5注音']) {
    expect(others).not.toContain(font);
  }
});

it('shows Chinese labels without changing font family values', () => {
  expect(fontLabel('PMingLiU')).toBe('新細明體');
  expect(fontLabel('SimSun')).toBe('宋體');
  expect(fontLabel('SimHei')).toBe('黑體');
  expect(fontLabel('Arial')).toBe('Arial');
});

it('ignores malformed stored font lists', () => {
  window.localStorage.setItem(RECENT_FONTS_STORAGE_KEY, '{bad');
  expect(readRecentFonts()).toEqual([]);
  window.localStorage.setItem(RECENT_FONTS_STORAGE_KEY,
    JSON.stringify(['Arial', 'Arial; color: red', 'Arial']));
  expect(readRecentFonts()).toEqual(['Arial']);
});
