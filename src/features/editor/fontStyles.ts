export const fontFamilies = ['Noto Sans TC', 'Noto Serif TC', 'Microsoft JhengHei',
  'Arial', 'Times New Roman'];
export const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

export function validFontFamily(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 && value.trim() === value
    && value.length > 0 && !/[;{}<>"\\\u0000-\u001f\u007f]/.test(value);
}

export function validFontSize(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?pt$/.test(value)) return false;
  const points = Number.parseFloat(value);
  return Number.isFinite(points) && points >= 6 && points <= 72;
}
