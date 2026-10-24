import { useState } from 'react';
import { validatePageSettings, type PageSettings } from '../../domain/types';
import { pageDimensions } from '../../domain/pageSettings';

type NumericKey = 'top' | 'right' | 'bottom' | 'left' | 'defaultFontSizePt' | 'lineHeight';

export function PageSettingsForm({ settings, onChange }: {
  settings: PageSettings; onChange: (settings: PageSettings) => void;
}) {
  const [draft, setDraft] = useState<Partial<Record<NumericKey, string>>>({});
  const [error, setError] = useState('');
  const dimensions = pageDimensions(settings);

  function commit(next: PageSettings) {
    try { validatePageSettings(next); onChange(next); setError(''); setDraft({}); return true; }
    catch { setError('頁面設定超出允許範圍，或內容區域大小不足。'); return false; }
  }

  function numeric(key: NumericKey, label: string, value: number, min: number, max: number, step: string) {
    return <label key={key}>{label} <input type="number" min={min} max={max} step={step}
      value={draft[key] ?? value} onChange={(event) => {
        const text = event.target.value;
        setDraft((current) => ({ ...current, [key]: text }));
        const number = Number(text);
        if (!text || !Number.isFinite(number)) {
          setError('請輸入有效數值。'); return;
        }
        const next = key in settings.marginsMm
          ? { ...settings, marginsMm: { ...settings.marginsMm, [key]: number } }
          : { ...settings, [key]: number };
        commit(next);
      }} /> </label>;
  }

  return <section aria-label="頁面設定">
    <h2>頁面設定</h2>
    <label>紙張 <select value={settings.paperSize} onChange={(event) =>
      commit({ ...settings, paperSize: event.target.value as PageSettings['paperSize'] })}>
      <option value="TW_B4">台灣 B4</option><option value="A4">A4</option>
    </select></label>
    <label>方向 <select value={settings.orientation} onChange={(event) =>
      commit({ ...settings, orientation: event.target.value as PageSettings['orientation'] })}>
      <option value="portrait">直向</option><option value="landscape">橫向</option>
    </select></label>
    {(['top', 'right', 'bottom', 'left'] as const).map((key) => numeric(key,
      { top: '上邊距 (mm)', right: '右邊距 (mm)', bottom: '下邊距 (mm)', left: '左邊距 (mm)' }[key],
      settings.marginsMm[key], 0, 100, '0.5'))}
    {numeric('defaultFontSizePt', '字級 (pt)', settings.defaultFontSizePt, 6, 72, '0.5')}
    {numeric('lineHeight', '行距', settings.lineHeight, 0.5, 4, '0.1')}
    <label>輸出清單 <select value={settings.outputListStyle} onChange={(event) =>
      commit({ ...settings, outputListStyle: event.target.value as PageSettings['outputListStyle'] })}>
      <option value="ordered">編號</option><option value="unordered">項目符號</option>
    </select></label>
    <p>內容區域：{dimensions.contentWidthMm} × {dimensions.contentHeightMm} mm</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
