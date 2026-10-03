import "server-only";
import { transcriptionModel, ttsModel, ttsVoice } from "./env";
import { createOpenAI } from "./openai";
import type { LanguageMode, ReplyLanguage } from "./types";

export async function transcribeAudio(
  file: File,
  languageMode: LanguageMode,
): Promise<{ text: string; languages: string[] }> {
  const client = createOpenAI();
  const result = await client.audio.transcriptions.create({
    file,
    model: transcriptionModel(),
    response_format: "json",
    prompt:
      "VelaWear fashion support call. Important terms: demo PIN, order ID, refund, return, pickup, quality check. A demo PIN has four digits and may be spoken one digit at a time, for example: four eight two six. Transcribe every digit word clearly and faithfully.",
    keywords: [
      "VelaWear",
      "demo PIN",
      "order ID",
      "refund",
      "return",
      "pickup",
      "quality check",
      "VW-1001",
      "VW-1002",
      "VW-1003",
      "VW-1004",
      "VW-1005",
      "VW-1006",
      "VW-1007",
    ],
    ...(languageMode === "en" ? { language: "en" } : {}),
    ...(languageMode === "hi" ? { language: "hi" } : {}),
    ...(languageMode === "auto" ? { languages: ["en", "hi"] } : {}),
  });
  const languages = Array.isArray(result.languages)
    ? result.languages.map((item) => item.code).filter((item): item is string => Boolean(item))
    : [];
  return { text: result.text, languages };
}

/** Prefer a shorter spoken line so TTS returns faster while the UI can still show the full reply. */
export function spokenUtterance(text: string, maxChars = 420): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const sentences = cleaned.split(/(?<=[।.!?])\s+/).filter(Boolean);
  let out = "";
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > maxChars) break;
    out = next;
    if (out.length >= 180) break;
  }
  return (out || cleaned.slice(0, maxChars)).trim();
}

export async function synthesizeSpeech(
  text: string,
  language: ReplyLanguage,
  options: { voice?: string } = {},
): Promise<Uint8Array> {
  const client = createOpenAI();
  const voice = options.voice?.trim() || ttsVoice();
  const response = await client.audio.speech.create({
    model: ttsModel(),
    voice,
    input: spokenUtterance(text).slice(0, 1200),
    response_format: "mp3",
    instructions: speechInstructions(language),
  });
  return new Uint8Array(await response.arrayBuffer());
}

function speechInstructions(language: ReplyLanguage): string {
  const shared =
    "Sound like a real empathetic call-centre agent: warm, clear, and slightly brisk. Keep a natural conversational pace — do not drag or over-enunciate. This audio is AI-generated.";
  if (language === "hi") return `Speak natural Hindi. ${shared}`;
  if (language === "hinglish") return `Speak natural Hinglish as written. ${shared}`;
  return `Speak natural English. ${shared}`;
}
