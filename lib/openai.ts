import "server-only";
import OpenAI from "openai";

export function createOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return new OpenAI({
    apiKey,
    timeout: 60_000,
    maxRetries: 0,
  });
}
