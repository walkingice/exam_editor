import { useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import type { PageSettings } from '../../domain/types';
import type { AssetReader } from './imageMapper';
import { createDocxDownload, docxFilename, downloadBlob } from './downloadDocument';

type Snapshot = { content: JSONContent; settings: PageSettings; name: string };

export function ExportDocxButton({ snapshot, readAsset }: {
  snapshot: () => Snapshot; readAsset: AssetReader;
}) {
  const operation = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => () => { operation.current = null; }, []);
  const cancel = () => { operation.current = null; setBusy(false); };
  const start = async () => {
    if (operation.current) return;
    const token = Symbol();
    operation.current = token;
    setBusy(true); setError(''); setWarnings([]);
    try {
      const current = structuredClone(snapshot());
      const result = await createDocxDownload(current.content, current.settings, readAsset);
      if (operation.current !== token) return;
      downloadBlob(result.blob, docxFilename(current.name));
      setWarnings(result.warnings);
    } catch (cause) {
      if (operation.current === token) setError(cause instanceof Error ? cause.message : 'DOCX 匯出失敗');
    } finally {
      if (operation.current === token) { operation.current = null; setBusy(false); }
    }
  };
  return <section aria-label="DOCX 匯出">
    <button disabled={busy} onClick={() => void start()}>匯出 DOCX</button>
    {busy && <><p role="status">正在產生 DOCX…</p><button onClick={cancel}>取消匯出</button></>}
    {error && <p role="alert">{error}，請重試匯出。</p>}
    {warnings.length > 0 && <><p>匯出提醒：</p><ul>{warnings.map((warning) =>
      <li key={warning}>{warning}</li>)}</ul></>}
  </section>;
}
