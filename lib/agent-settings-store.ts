import "server-only";
import { hasApiKey, ttsVoice } from "./env";
import {
  OPENAI_TTS_VOICES,
  defaultAgentSettings,
  normalizeAgentSettings,
  type AgentSettingsCapabilities,
  type AgentStyleSettings,
} from "./agent-settings";
import { readJson, withStoreLock, writeJson } from "./persist";

const SETTINGS_FILE = "agent-settings.json";

export function getAgentSettingsCapabilities(): AgentSettingsCapabilities {
  const live = hasApiKey();
  return {
    liveAudio: live,
    voices: OPENAI_TTS_VOICES.map((voice) => ({
      id: voice.id,
      label: voice.label,
      available: live,
      reason: live ? null : "Add OPENAI_API_KEY to enable speaking voices.",
    })),
    previewAvailable: live,
    previewReason: live ? null : "Voice preview needs OPENAI_API_KEY.",
    note: "Style settings change wording and audio only. Policy, case facts, and safety rules stay the same.",
  };
}

export function getAgentSettings(): Promise<AgentStyleSettings> {
  return withStoreLock(async () => {
    const stored = await readJson<Partial<AgentStyleSettings> | null>(SETTINGS_FILE, null);
    const normalized = normalizeAgentSettings(stored);
    if (!stored || typeof stored.voice !== "string") {
      normalized.voice = ttsVoice();
    }
    return normalized;
  });
}

export function saveAgentSettings(input: unknown): Promise<AgentStyleSettings> {
  return withStoreLock(async () => {
    const next = normalizeAgentSettings({ ...defaultAgentSettings(), ...(typeof input === "object" && input ? input : {}) });
    next.updatedAt = new Date().toISOString();
    await writeJson(SETTINGS_FILE, next);
    return next;
  });
}
