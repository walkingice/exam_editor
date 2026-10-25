import { afterEach, expect, it } from 'vitest';
import { fontOptions, readRecentFonts, rememberFont } from './fontCatalog';
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

it('ignores malformed stored font lists', () => {
  window.localStorage.setItem(RECENT_FONTS_STORAGE_KEY, '{bad');
  expect(readRecentFonts()).toEqual([]);
  window.localStorage.setItem(RECENT_FONTS_STORAGE_KEY,
    JSON.stringify(['Arial', 'Arial; color: red', 'Arial']));
  expect(readRecentFonts()).toEqual(['Arial']);
});
