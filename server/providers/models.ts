import { DEFAULT_ANTHROPIC_MODEL, type ModelInfo, type ProviderId } from '../../shared/settings.ts';

export { DEFAULT_ANTHROPIC_MODEL };

const OPENAI_CHAT_PREFIX = /^(gpt-|chatgpt-|o\d)/;
const OPENAI_NOT_CHAT =
  /(audio|realtime|tts|transcribe|image|embedding|search|moderation|instruct|codex|dall-e|whisper|computer-use|deep-research)/;
const OPENAI_FLAGSHIP = /^gpt-(\d+)(?:\.(\d+))?$/;

/** OpenAI lists every model the key can reach; keep the ones that can write a page, newest first. */
export function openAIChatModels(models: ReadonlyArray<{ id: string; created: number }>): ModelInfo[] {
  return models
    .filter((m) => OPENAI_CHAT_PREFIX.test(m.id) && !OPENAI_NOT_CHAT.test(m.id))
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
    .map((m) => ({ id: m.id, label: m.id }));
}

function compareVersions(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

export function pickDefaultModel(provider: ProviderId, models: readonly ModelInfo[]): string | null {
  if (models.length === 0) return null;

  if (provider === 'anthropic') {
    return models.some((m) => m.id === DEFAULT_ANTHROPIC_MODEL) ? DEFAULT_ANTHROPIC_MODEL : models[0].id;
  }

  // OpenAI: the highest plain "gpt-N.M" (no -mini, -nano or dated snapshot).
  let best: { id: string; version: [number, number] } | null = null;
  for (const model of models) {
    const match = OPENAI_FLAGSHIP.exec(model.id);
    if (!match) continue;
    const version: [number, number] = [Number(match[1]), Number(match[2] ?? 0)];
    if (!best || compareVersions(version, best.version) > 0) best = { id: model.id, version };
  }
  return best?.id ?? models[0].id;
}
