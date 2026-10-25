import { AI_DEFAULT_PROMPT_STORAGE_KEY } from './storageKeys';

export const DEFAULT_AI_PROMPT = `你是一位台灣國中小學教師，正在準備考試題目。
為了把題目變得有趣，我會給你一個題目，以及修改的方向。

不改變題目的語意，測驗目的，也盡量不改變題目的形式符號，僅替換題目內的名詞或情境，讓題目更貼近我提供的修改方向。

直接回應修改的內容，不加上任何的贅詞、問候語、心得。
`;

export function getAIPrompt(): string {
  return window.localStorage.getItem(AI_DEFAULT_PROMPT_STORAGE_KEY) ?? DEFAULT_AI_PROMPT;
}
