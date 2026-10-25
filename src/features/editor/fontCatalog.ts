import { fontFamilies, validFontFamily } from './fontStyles';
import { RECENT_FONTS_STORAGE_KEY } from '../../shared/storageKeys';

export function readRecentFonts(): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECENT_FONTS_STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? [...new Set(saved.filter(validFontFamily))].slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function rememberFont(font: string): string[] {
  const recent = [font, ...readRecentFonts().filter((name) => name !== font)].slice(0, 5);
  try { window.localStorage.setItem(RECENT_FONTS_STORAGE_KEY, JSON.stringify(recent)); } catch { /* unavailable */ }
  return recent;
}

export function fontOptions(installed: string[] | null, recent: string[], current: string): {
  recent: string[]; others: string[];
} {
  const available = installed ?? fontFamilies;
  const top = recent.filter((font) => installed === null || installed.includes(font));
  const others = [...new Set([...available, current].filter(validFontFamily))]
    .filter((font) => !top.includes(font)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  return { recent: top.slice(0, 5), others };
}
