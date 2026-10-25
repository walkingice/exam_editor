import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { fontOptions, readRecentFonts, rememberFont } from './fontCatalog';
import { fontSizes, validFontFamily } from './fontStyles';
import { applyAllFormat } from './applyAllFormat';

export function AllFormatModal({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [fontFamily, setFontFamily] = useState('');
  const [fontSize, setFontSize] = useState('');
  const [clear, setClear] = useState(false);
  const [installedFonts, setInstalledFonts] = useState<string[] | null>(null);
  const [fontStatus, setFontStatus] = useState('');
  const [loadingFonts, setLoadingFonts] = useState(false);
  const [error, setError] = useState('');
  const availableFonts = fontOptions(installedFonts, readRecentFonts(), fontFamily);

  async function detectFonts() {
    const query = (window as Window & {
      queryLocalFonts?: () => Promise<Array<{ family: string }>>;
    }).queryLocalFonts;
    if (!query) { setFontStatus('此瀏覽器不支援偵測本機字體'); return; }
    setLoadingFonts(true);
    try {
      const faces = await query.call(window);
      const families = [...new Set(faces.map((face) => face.family).filter(validFontFamily))];
      setInstalledFonts(families);
      setFontStatus(`已載入 ${families.length} 個本機字體`);
    } catch { setFontStatus('無法讀取本機字體，請檢查瀏覽器權限'); }
    finally { setLoadingFonts(false); }
  }

  function confirm() {
    try {
      applyAllFormat(editor, { fontFamily, fontSize, clear });
      if (fontFamily) rememberFont(fontFamily);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '套用格式失敗。'); }
  }

  return <div className="settings-backdrop" role="presentation">
    <section className="settings-modal ai-all-modal" role="dialog" aria-modal="true"
      aria-label="修改全部格式" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <h2>修改全部格式</h2>
      <div className="all-format-field"><label htmlFor="all-format-font">字體</label>
        <button type="button" onClick={() => void detectFonts()} disabled={loadingFonts}>
          偵測本機字體</button></div>
      <select id="all-format-font" value={fontFamily}
        onChange={(event) => setFontFamily(event.target.value)}>
        <option value="">不變更</option>
        {availableFonts.recent.length > 0 && <optgroup label="最近使用">
          {availableFonts.recent.map((font) => <option key={font} value={font}>{font}</option>)}
        </optgroup>}
        <optgroup label={installedFonts ? '本機字體' : '預設字體'}>
          {availableFonts.others.map((font) => <option key={font} value={font}>{font}</option>)}
        </optgroup>
      </select>
      {fontStatus && <p role="status">{fontStatus}</p>}
      <label htmlFor="all-format-size">字體大小</label>
      <select id="all-format-size" value={fontSize}
        onChange={(event) => setFontSize(event.target.value)}>
        <option value="">不變更</option>
        {fontSizes.map((size) => <option key={size} value={`${size}pt`}>{size} pt</option>)}
      </select>
      <label className="all-format-clear"><input type="checkbox" checked={clear}
        onChange={(event) => setClear(event.target.checked)} />清除格式</label>
      {error && <p role="alert">{error}</p>}
      <div className="ai-all-modal-actions">
        <button type="button" onClick={confirm}>確定</button>
        <button type="button" onClick={onClose}>取消</button>
      </div>
    </section>
  </div>;
}
