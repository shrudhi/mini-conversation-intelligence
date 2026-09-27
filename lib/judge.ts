import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { agentModel } from "./env";
import { createOpenAI } from "./openai";

const JudgeSchema = z.object({
  status: z.enum(["pass", "partial", "fail", "not_assessable"]),
  rationale: z.string().min(1).max(500),
  pronunciationNote: z.string().max(400),
});

export async function judgeLanguage(turns: Array<{ speaker: string; text: string }>): Promise<{
  status: "pass" | "partial" | "fail" | "not_assessable";
  rationale: string;
  pronunciationNote: string;
  inputTokens: number | null;
  outputTokens: number | null;
}> {
  const client = createOpenAI();
  const response = await client.responses.parse({
    model: agentModel(),
    store: false,
    max_output_tokens: 500,
    reasoning: { effort: "none" },
    input: [
      {
        role: "system",
        content:
          "You judge only conversation and language quality for a VelaWear demo: clarity, empathy, and whether the reply language matches the customer. Do not change facts or policy outcomes. Do not claim you heard pronunciation unless the note says audio was not available. Return JSON only.",
      },
      { role: "user", content: JSON.stringify({ turns }) },
    ],
    text: { format: zodTextFormat(JudgeSchema, "language_judgement") },
  });
  if (response.status !== "completed" || !response.output_parsed) {
    throw new Error("The AI judge was incomplete.");
  }
  return {
    ...response.output_parsed,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}
