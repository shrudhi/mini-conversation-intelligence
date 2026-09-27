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
    ? result.languages.map((item) => item.code).filter(Boolean)
    : [];
  return { text: result.text, languages };
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
    input: text.slice(0, 4000),
    response_format: "mp3",
    instructions: speechInstructions(language),
  });
  return new Uint8Array(await response.arrayBuffer());
}

function speechInstructions(language: ReplyLanguage): string {
  if (language === "hi") return "Speak clear Hindi. AI-generated support audio.";
  if (language === "hinglish") return "Speak the Hinglish text naturally. AI-generated support audio.";
  return "Speak clear English. AI-generated support audio.";
}
