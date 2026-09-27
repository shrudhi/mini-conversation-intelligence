import "server-only";

export function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function agentModel(): string {
  return process.env.AGENT_MODEL?.trim() || "gpt-5.6-luna";
}

export function transcriptionModel(): string {
  return process.env.TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe";
}

export function ttsModel(): string {
  return process.env.TTS_MODEL?.trim() || "gpt-4o-mini-tts";
}

export function ttsVoice(): string {
  return process.env.TTS_VOICE?.trim() || "marin";
}
