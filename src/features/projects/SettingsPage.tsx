import { useState } from 'react';
import { AI_DEFAULT_PROMPT_STORAGE_KEY, GEMINI_API_KEY_STORAGE_KEY,
  GEMINI_MODEL_STORAGE_KEY } from '../../shared/storageKeys';
import { DEFAULT_AI_PROMPT, getAIPrompt } from '../../shared/aiPrompt';
import { DEFAULT_GEMINI_MODELS, fetchAvailableGeminiModels } from './geminiModels';

export function SettingsPage() {
  const [geminiApiKey, setGeminiApiKey] = useState(() => window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) ?? '');
  const [geminiModel, setGeminiModel] = useState(() => window.localStorage.getItem(GEMINI_MODEL_STORAGE_KEY) ?? DEFAULT_GEMINI_MODELS[0]);
  const [defaultPrompt, setDefaultPrompt] = useState(getAIPrompt);
  const [availableModels, setAvailableModels] = useState<string[]>(DEFAULT_GEMINI_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');

  function saveSettings() {
    if (geminiApiKey.trim()) window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, geminiApiKey.trim());
    else window.localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    window.localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, geminiModel);
    if (defaultPrompt === DEFAULT_AI_PROMPT) window.localStorage.removeItem(AI_DEFAULT_PROMPT_STORAGE_KEY);
    else window.localStorage.setItem(AI_DEFAULT_PROMPT_STORAGE_KEY, defaultPrompt);
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
      <a className="settings-back-link" href="#/" aria-label="返回首頁">← 返回首頁</a>
      <div className="settings-page-intro">
        <p className="home-eyebrow">WORKSPACE SETTINGS</p>
        <h1>設定</h1>
        <p>管理試卷編輯時使用的 AI 服務。</p>
      </div>
    </header>
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="settings-section-heading">
        <span className="settings-section-icon" aria-hidden="true">✦</span>
        <div><h2 id="settings-title">AI 設定</h2>
          <p>連接 Gemini，讓 AI 協助修改試卷內容。</p></div>
      </div>
      <div className="settings-field">
        <div className="settings-field-description">
          <label htmlFor="gemini-api-key">Gemini API key</label>
          <p>金鑰會儲存在這個瀏覽器中。</p>
        </div>
        <div className="settings-field-control">
          <input id="gemini-api-key" type="text" autoComplete="off" value={geminiApiKey}
            onChange={(event) => setGeminiApiKey(event.target.value)} placeholder="輸入 Gemini API key" />
          <nav aria-label="Gemini API key 說明">
            <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">申請金鑰 ↗</a>
            <a href="https://www.google.com/search?q=%E5%A6%82%E4%BD%95%E7%94%B3%E8%AB%8B+Gemini+API+Key" target="_blank" rel="noreferrer">如何申請 ↗</a>
          </nav>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-description">
          <label htmlFor="gemini-model">Model</label>
          <p>選擇產生內容時使用的模型。</p>
        </div>
        <div className="settings-field-control settings-model-control">
          <select id="gemini-model" value={geminiModel} onChange={(event) => setGeminiModel(event.target.value)}>
            {availableModels.map((model) => <option key={model} value={model}>{model}{model === DEFAULT_GEMINI_MODELS[0] ? '（預設）' : ''}</option>)}
          </select>
          <button type="button" disabled={!geminiApiKey.trim() || modelsLoading} onClick={() => void reloadModels()}>
            <span aria-hidden="true">⟳</span> {modelsLoading ? '載入中…' : 'Refresh'}
          </button>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-description">
          <label htmlFor="default-prompt">Default Prompt</label>
          <p>修改 AI 改寫題目時使用的預設提示詞。</p>
        </div>
        <div className="settings-field-control settings-prompt-control">
          <textarea id="default-prompt" rows={8} value={defaultPrompt}
            onChange={(event) => setDefaultPrompt(event.target.value)} />
          <button type="button" onClick={() => setDefaultPrompt(DEFAULT_AI_PROMPT)}>Reset</button>
        </div>
      </div>
      {modelsError && <p className="settings-error" role="alert">{modelsError}</p>}
      <div className="settings-actions">
        <a href="#/">取消</a>
        <button className="settings-save" type="button" onClick={saveSettings}>儲存設定</button>
      </div>
    </section>
  </main>;
}
