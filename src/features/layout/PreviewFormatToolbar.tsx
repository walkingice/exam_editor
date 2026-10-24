import { useState } from 'react';
import type { FormatChange } from './updateSourceFormat';

export function PreviewFormatToolbar({ type, attrs, maxWidthMm, onChange }: {
  type: string; attrs: Record<string, unknown>; maxWidthMm: number;
  onChange: (change: FormatChange) => void;
}) {
  const [width, setWidth] = useState(String(attrs.widthMm ?? ''));
  return <div className="editor-toolbar" aria-label="局部格式">
    {(type === 'paragraph' || type === 'heading') && <>
      <label>對齊 <select value={String(attrs.textAlign ?? 'left')}
        onChange={(event) => onChange({ textAlign: event.target.value as FormatChange['textAlign'] })}>
        <option value="left">靠左</option><option value="center">置中</option>
        <option value="right">靠右</option>
      </select></label>
      <label>段後間距 (mm) <input type="number" min="0" max="30" step="0.5"
        value={String(attrs.spacingAfterMm ?? 0)}
        onChange={(event) => onChange({ spacingAfterMm: Number(event.target.value) })} /></label>
    </>}
    {type === 'image' && <label>圖片寬度 (mm) <input type="number" min="1"
      max={maxWidthMm} step="1" value={width} onChange={(event) => setWidth(event.target.value)}
      onBlur={() => onChange({ widthMm: width === '' ? null : Number(width) })} /></label>}
  </div>;
}
