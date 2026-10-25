export const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

type GeminiModel = { name?: string; supportedGenerationMethods?: string[] };

export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': apiKey.trim() },
  });
  const data = await response.json() as { models?: GeminiModel[]; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Gemini API request failed (${response.status})`);
  const models = (data.models ?? [])
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name?.replace(/^models\//, ''))
    .filter((name): name is string => Boolean(name));
  return [...new Set(models)];
}
