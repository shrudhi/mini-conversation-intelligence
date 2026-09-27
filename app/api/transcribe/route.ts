import { NextResponse } from "next/server";
import { assertAudioAcceptable, inspectAudio, resolveDuration } from "@/lib/audio";
import { hasApiKey } from "@/lib/env";
import { publicTranscriptionError } from "@/lib/errors";
import { RequestGuardError, withTranscriptionSlot } from "@/lib/limits";
import { transcribeAudio } from "@/lib/speech";
import type { LanguageMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload the recording as form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Record audio before transcribing." }, { status: 400 });
  }
  const languageMode = languageFrom(form.get("language"));
  const reportedDuration = parseReportedDuration(form.get("durationSeconds"));
  const bytes = new Uint8Array(await file.arrayBuffer());
  let inspected: { format: string | null; duration: number | null };
  let effectiveDuration: number | null = null;
  try {
    inspected = await inspectAudio(bytes, file.name || "recording.webm");
    assertAudioAcceptable({
      size: bytes.byteLength,
      duration: inspected.duration,
      format: inspected.format,
      reportedDuration,
    });
    effectiveDuration = resolveDuration(inspected.duration, reportedDuration);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The audio file could not be checked.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!hasApiKey()) {
    return NextResponse.json(
      { error: "Add OPENAI_API_KEY to .env.local before transcribing. The recording was not sent." },
      { status: 400 },
    );
  }

  const started = Date.now();
  try {
    const upload = new File([Buffer.from(bytes)], file.name || `recording.${inspected.format || "webm"}`, {
      type: file.type || "application/octet-stream",
    });
    const result = await withTranscriptionSlot(() => transcribeAudio(upload, languageMode));
    if (!result.text.trim()) {
      return NextResponse.json(
        { error: "The transcription was empty. Check the recording and try again manually." },
        { status: 422 },
      );
    }
    return NextResponse.json({
      text: result.text,
      languages: result.languages,
      latencyMs: Date.now() - started,
      durationSeconds: effectiveDuration,
      format: inspected.format,
    });
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Transcription failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: publicTranscriptionError(error) }, { status: 502 });
  }
}

function languageFrom(value: FormDataEntryValue | null): LanguageMode {
  if (value === "en" || value === "hi" || value === "auto") return value;
  return "auto";
}

function parseReportedDuration(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
