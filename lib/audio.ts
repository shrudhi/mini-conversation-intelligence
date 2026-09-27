import { intEnv, MAX_AUDIO_SECONDS } from "./constants";

const MAX_SECONDS = MAX_AUDIO_SECONDS;

type DetectedFormat = {
  ext: string;
  mime: string;
};

export function maxAudioBytes(): number {
  return intEnv("MAX_AUDIO_BYTES", 10_000_000);
}

export function detectAudioFormat(bytes: Uint8Array, filename: string): DetectedFormat | null {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  const magic = magicFormat(bytes);
  if (!magic) return null;
  const extensionOk =
    extension.length === 0 ||
    magic.extensions.includes(extension);
  if (!extensionOk) return null;
  return { ext: magic.ext, mime: magic.mime };
}

function magicFormat(bytes: Uint8Array): { ext: string; mime: string; extensions: string[] } | null {
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && ascii(bytes, 8, 4) === "WAVE") {
    return { ext: "wav", mime: "audio/wav", extensions: ["wav"] };
  }
  if (ascii(bytes, 0, 4) === "OggS") {
    return { ext: "ogg", mime: "audio/ogg", extensions: ["ogg"] };
  }
  if (ascii(bytes, 0, 4) === "fLaC") {
    return { ext: "flac", mime: "audio/flac", extensions: ["flac"] };
  }
  if (ascii(bytes, 0, 3) === "ID3" || isMp3Frame(bytes)) {
    return { ext: "mp3", mime: "audio/mpeg", extensions: ["mp3", "mpeg", "mpga"] };
  }
  if (ascii(bytes, 4, 4) === "ftyp") {
    return { ext: "mp4", mime: "audio/mp4", extensions: ["mp4", "m4a"] };
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { ext: "webm", mime: "audio/webm", extensions: ["webm"] };
  }
  return null;
}

export function readWavDuration(bytes: Uint8Array): number | null {
  if (bytes.length < 44) return null;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return null;
  let offset = 12;
  let byteRate: number | null = null;
  let dataSize: number | null = null;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = readU32(bytes, offset + 4);
    if (!Number.isFinite(size) || size < 0) return null;
    if (id === "fmt " && offset + 24 <= bytes.length) {
      byteRate = readU32(bytes, offset + 16);
    } else if (id === "data") {
      dataSize = size;
    }
    const step = 8 + size + (size % 2);
    if (step <= 0) return null;
    offset += step;
  }
  if (!byteRate || dataSize === null || byteRate <= 0) return null;
  return dataSize / byteRate;
}

export function assertAudioAcceptable(input: {
  size: number;
  duration: number | null;
  format: string | null;
  /** Client-measured recording length (MediaRecorder webm/mp4 often lacks duration tags). */
  reportedDuration?: number | null;
}): void {
  if (input.size <= 0) {
    throw new Error("The audio file is empty. Upload a short recording.");
  }
  const limit = maxAudioBytes();
  if (input.size > limit) {
    throw new Error(
      `The recording is larger than ${Math.round(limit / 1_000_000)} MB. Upload a shorter clip. No transcription was started.`,
    );
  }
  if (!input.format) {
    throw new Error("Upload a supported audio file: wav, mp3, m4a, mp4, ogg, webm, or flac.");
  }

  const duration = resolveDuration(input.duration, input.reportedDuration);
  if (duration === null) {
    throw new Error(
      "Could not confirm the recording length. Record again for at least one second, then tap Send.",
    );
  }
  if (duration <= 0.05) {
    throw new Error("The audio file is empty or silent. Upload a recording with speech.");
  }
  if (duration > MAX_SECONDS) {
    throw new Error("Recording is longer than 60 seconds. Record a shorter clip. No transcription was started.");
  }
}

/** Prefer container metadata; fall back to the mic timer for live browser recordings. */
export function resolveDuration(
  metadataDuration: number | null,
  reportedDuration: number | null | undefined,
): number | null {
  if (typeof metadataDuration === "number" && Number.isFinite(metadataDuration) && metadataDuration > 0) {
    return metadataDuration;
  }
  if (typeof reportedDuration === "number" && Number.isFinite(reportedDuration) && reportedDuration > 0) {
    return Math.min(MAX_SECONDS, reportedDuration);
  }
  return null;
}

export async function inspectAudio(bytes: Uint8Array, filename: string): Promise<{
  format: string | null;
  duration: number | null;
}> {
  const format = detectAudioFormat(bytes, filename);
  if (!format) return { format: null, duration: null };
  if (format.ext === "wav") {
    return { format: format.ext, duration: readWavDuration(bytes) };
  }
  const duration = await durationFromMetadata(bytes, format.mime);
  return { format: format.ext, duration };
}

async function durationFromMetadata(bytes: Uint8Array, mime: string): Promise<number | null> {
  try {
    const { parseBuffer } = await import("music-metadata");
    const metadata = await parseBuffer(Buffer.from(bytes), { mimeType: mime });
    const duration = metadata.format.duration;
    return typeof duration === "number" && Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return Number.NaN;
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function isMp3Frame(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}
