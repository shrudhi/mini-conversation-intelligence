import { NextResponse } from "next/server";
import { normalizeAgentSettings } from "@/lib/agent-settings";
import { getAgentSettingsCapabilities } from "@/lib/agent-settings-store";
import { hasApiKey } from "@/lib/env";
import { publicSpeechError } from "@/lib/errors";
import { RequestGuardError, withSpeechSlot } from "@/lib/limits";
import { synthesizeSpeech } from "@/lib/speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const capabilities = getAgentSettingsCapabilities();
  if (!hasApiKey() || !capabilities.previewAvailable) {
    return NextResponse.json(
      { error: capabilities.previewReason || "Voice preview is unavailable." },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Preview request must be JSON." }, { status: 400 });
  }

  const style = normalizeAgentSettings(body);
  const sample =
    typeof body.sampleText === "string" && body.sampleText.trim()
      ? body.sampleText.trim().slice(0, 280)
      : style.languageMode === "hi"
        ? "आपके ऑर्डर की रिफंड स्थिति यहाँ उपलब्ध है।"
        : "Your refund status for this order is available here.";

  try {
    const bytes = await withSpeechSlot(() =>
      synthesizeSpeech(sample, style.languageMode === "hi" ? "hi" : "en", {
        voice: style.voice,
      }),
    );
    return NextResponse.json({
      audioBase64: Buffer.from(bytes).toString("base64"),
      contentType: "audio/mpeg",
      voice: style.voice,
      aiGenerated: true,
    });
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: publicSpeechError(error) }, { status: 502 });
  }
}
