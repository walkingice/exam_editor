import { useState } from 'react';
import { GEMINI_API_KEY_STORAGE_KEY, GEMINI_MODEL_STORAGE_KEY } from '../../shared/storageKeys';
import { DEFAULT_GEMINI_MODELS, fetchAvailableGeminiModels } from './geminiModels';

export function SettingsPage() {
  const [geminiApiKey, setGeminiApiKey] = useState(() => window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) ?? '');
  const [geminiModel, setGeminiModel] = useState(() => window.localStorage.getItem(GEMINI_MODEL_STORAGE_KEY) ?? DEFAULT_GEMINI_MODELS[0]);
  const [availableModels, setAvailableModels] = useState<string[]>(DEFAULT_GEMINI_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');

  function saveSettings() {
    if (geminiApiKey.trim()) window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, geminiApiKey.trim());
    else window.localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    window.localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, geminiModel);
    window.location.hash = '/';
  }

  async function reloadModels() {
    const apiKey = geminiApiKey.trim();
    if (!apiKey || modelsLoading) return;
    setModelsLoading(true);
    setModelsError('');
    try {
      const models = await fetchAvailableGeminiModels(apiKey);
      const nextModels = [...new Set([...DEFAULT_GEMINI_MODELS, ...models])];
      setAvailableModels(nextModels);
      if (!nextModels.includes(geminiModel)) setGeminiModel(DEFAULT_GEMINI_MODELS[0]);
    } catch (cause) {
      setModelsError(cause instanceof Error ? cause.message : '操作失敗，請重試');
    } finally { setModelsLoading(false); }
  }

  return <main className="settings-page">
    <header className="settings-page-header">
      <a href="#/" aria-label="返回首頁">← 返回首頁</a>
      <p className="home-eyebrow">SETTINGS</p>
      <h1>設定</h1>
    </header>
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="settings-heading"><div><p className="home-eyebrow">AI SETTINGS</p>
        <h2 id="settings-title">AI 設定</h2></div></div>
      <label className="settings-label" htmlFor="gemini-api-key">Gemini API key</label>
      <div className="settings-key-row">
        <input id="gemini-api-key" type="text" autoComplete="off" value={geminiApiKey}
          onChange={(event) => setGeminiApiKey(event.target.value)} placeholder="輸入 Gemini API key" />
        <nav aria-label="Gemini API key 說明">
          <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">申請金鑰</a>
          <a href="https://www.google.com/search?q=%E5%A6%82%E4%BD%95%E7%94%B3%E8%AB%8B+Gemini+API+Key" target="_blank" rel="noreferrer">如何申請</a>
        </nav>
      </div>
      <p className="settings-hint">金鑰會儲存在這個瀏覽器中。</p>
      <label className="settings-label" htmlFor="gemini-model">Model</label>
      <div className="settings-model-row">
        <select id="gemini-model" value={geminiModel} onChange={(event) => setGeminiModel(event.target.value)}>
          {availableModels.map((model) => <option key={model} value={model}>{model}{model === DEFAULT_GEMINI_MODELS[0] ? '（預設）' : ''}</option>)}
        </select>
        <button type="button" disabled={!geminiApiKey.trim() || modelsLoading} onClick={() => void reloadModels()}>
          <span aria-hidden="true">⟳</span> {modelsLoading ? '載入中…' : 'Refresh'}
        </button>
      </div>
      {modelsError && <p className="settings-error" role="alert">{modelsError}</p>}
      <div className="settings-actions">
        <a href="#/">取消</a>
        <button className="settings-save" type="button" onClick={saveSettings}>儲存</button>
      </div>
    </section>
  </main>;
}
