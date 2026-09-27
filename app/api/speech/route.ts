import { NextResponse } from "next/server";
import { hasApiKey, ttsVoice } from "@/lib/env";
import { publicSpeechError } from "@/lib/errors";
import { RequestGuardError, withSpeechSlot } from "@/lib/limits";
import { resolveSession, saveSession } from "@/lib/sessions";
import { speechPrefetchKey, takeSpeechPrefetch } from "@/lib/speech-prefetch";
import { synthesizeSpeech } from "@/lib/speech";
import type { ReplyLanguage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Speech request must be JSON." }, { status: 400 });
  }
  if (typeof body.sessionId !== "string" || typeof body.turnId !== "string") {
    return NextResponse.json({ error: "A session and turn are required." }, { status: 400 });
  }
  const session = await resolveSession(body.sessionId, body.session);
  const turn = session?.turns.find((item) => item.id === body.turnId);
  if (!session || !turn) return NextResponse.json({ error: "That spoken turn was not found." }, { status: 404 });

  if (body.playback === "played" || body.playback === "error") {
    turn.speech.playback = body.playback;
    session.updatedAt = new Date().toISOString();
    await saveSession(session);
    return NextResponse.json({ ok: true, session });
  }

  if (body.muted === true) {
    turn.speech = { status: "muted", voice: null, latencyMs: null, playback: null };
    session.updatedAt = new Date().toISOString();
    await saveSession(session);
    return NextResponse.json({ muted: true, aiGenerated: true, session });
  }

  if (!hasApiKey()) {
    turn.speech.status = "not_configured";
    session.updatedAt = new Date().toISOString();
    await saveSession(session);
    return NextResponse.json(
      { error: "Add OPENAI_API_KEY to .env.local before generating speech. No audio was requested.", session },
      { status: 400 },
    );
  }

  const started = Date.now();
  try {
    const language: ReplyLanguage = turn.language === "hi" || turn.language === "hinglish" ? turn.language : "en";
    const voice = session.agentStyle?.voice || ttsVoice();
    const key = speechPrefetchKey(body.sessionId, body.turnId);
    const prefetched = takeSpeechPrefetch(key);
    const bytes = prefetched
      ? await prefetched
      : await withSpeechSlot(() => synthesizeSpeech(turn.responseText, language, { voice }));
    const latencyMs = Date.now() - started;
    turn.speech = { status: "generated", voice, latencyMs, playback: "not_played" };
    turn.latency.tts = latencyMs;
    turn.latency.total = (turn.latency.stt ?? 0) + turn.latency.retrieval + (turn.latency.model ?? 0) + latencyMs;
    session.updatedAt = new Date().toISOString();
    await saveSession(session);
    return NextResponse.json({
      audioBase64: Buffer.from(bytes).toString("base64"),
      contentType: "audio/mpeg",
      voice,
      latencyMs,
      aiGenerated: true,
      session,
    });
  } catch (error) {
    turn.speech.status = "error";
    session.updatedAt = new Date().toISOString();
    await saveSession(session);
    if (error instanceof RequestGuardError) {
      return NextResponse.json({ error: error.message, session }, { status: error.status });
    }
    console.error("Speech failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: publicSpeechError(error), session }, { status: 502 });
  }
}
