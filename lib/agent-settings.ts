import type { LanguageMode } from "./types";

export type AgentTone = "warm" | "professional" | "concise";
export type ResponseLength = "brief" | "balanced" | "detailed";
export type EmpathyLevel = "low" | "medium" | "high";

/** Presentation-only controls. Never used for policy, facts, or safety. */
export type AgentStyleSettings = {
  tone: AgentTone;
  responseLength: ResponseLength;
  empathyLevel: EmpathyLevel;
  languageMode: LanguageMode;
  voice: string;
  updatedAt: string;
};

export type TtsCapability = {
  id: string;
  label: string;
  available: boolean;
  reason: string | null;
};

export type AgentSettingsCapabilities = {
  liveAudio: boolean;
  voices: TtsCapability[];
  previewAvailable: boolean;
  previewReason: string | null;
  note: string;
};

export const OPENAI_TTS_VOICES = [
  { id: "alloy", label: "Alloy" },
  { id: "ash", label: "Ash" },
  { id: "ballad", label: "Ballad" },
  { id: "coral", label: "Coral" },
  { id: "echo", label: "Echo" },
  { id: "sage", label: "Sage" },
  { id: "shimmer", label: "Shimmer" },
  { id: "verse", label: "Verse" },
  { id: "marin", label: "Marin" },
  { id: "cedar", label: "Cedar" },
] as const;

export function defaultAgentSettings(): AgentStyleSettings {
  return {
    tone: "warm",
    responseLength: "balanced",
    empathyLevel: "medium",
    languageMode: "auto",
    voice: "marin",
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeAgentSettings(input: unknown): AgentStyleSettings {
  const base = defaultAgentSettings();
  if (!input || typeof input !== "object") return base;
  const raw = input as Record<string, unknown>;
  const voiceIds: ReadonlySet<string> = new Set(OPENAI_TTS_VOICES.map((item) => item.id));
  return {
    tone: raw.tone === "warm" || raw.tone === "professional" || raw.tone === "concise" ? raw.tone : base.tone,
    responseLength:
      raw.responseLength === "brief" || raw.responseLength === "balanced" || raw.responseLength === "detailed"
        ? raw.responseLength
        : base.responseLength,
    empathyLevel:
      raw.empathyLevel === "low" || raw.empathyLevel === "medium" || raw.empathyLevel === "high"
        ? raw.empathyLevel
        : base.empathyLevel,
    languageMode: raw.languageMode === "en" || raw.languageMode === "hi" || raw.languageMode === "auto" ? raw.languageMode : base.languageMode,
    voice: typeof raw.voice === "string" && voiceIds.has(raw.voice) ? raw.voice : base.voice,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
  };
}

export function snapshotAgentSettings(settings: AgentStyleSettings): AgentStyleSettings {
  return { ...settings, updatedAt: settings.updatedAt || new Date().toISOString() };
}

/** Style-only phrasing guidance for the model. Must not invent facts or change policy. */
export function stylePhrasingInstructions(style: AgentStyleSettings): string {
  const tone =
    style.tone === "professional"
      ? "Use a professional, clear retail-care tone."
      : style.tone === "concise"
        ? "Use a concise, direct tone with short sentences."
        : "Use a warm, friendly retail-care tone.";
  const length =
    style.responseLength === "brief"
      ? "Keep the reply brief: one or two short sentences when possible."
      : style.responseLength === "detailed"
        ? "You may be a bit more detailed and explanatory, still without new facts."
        : "Keep a balanced length: clear but not wordy.";
  const empathy =
    style.empathyLevel === "low"
      ? "Keep empathy minimal; stay factual and polite."
      : style.empathyLevel === "high"
        ? "Show clear empathy when the customer is worried or frustrated, without adding new promises."
        : "Show light empathy when it fits, without adding new promises.";
  return `${tone} ${length} ${empathy} The customer starts the chat — do not invent a greeting or custom sign-off. Never change policy outcomes, eligibility, amounts, day counts, ticket decisions, or safety refusals.`;
}
