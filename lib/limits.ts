import { intEnv } from "./constants";

export class RequestGuardError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RequestGuardError";
    this.status = status;
  }
}

let agentCount = 0;
let transcriptionCount = 0;
let speechCount = 0;
let inFlight = false;

function agentMax(): number {
  return intEnv("MAX_AGENT_REQUESTS", 20);
}

function transcriptionMax(): number {
  return intEnv("MAX_TRANSCRIPTION_REQUESTS", 10);
}

function speechMax(): number {
  return intEnv("MAX_TTS_REQUESTS", 20);
}

export function limitSnapshot(): {
  agentUsed: number;
  agentMax: number;
  transcriptionUsed: number;
  transcriptionMax: number;
  speechUsed: number;
  speechMax: number;
  inFlight: boolean;
} {
  return {
    agentUsed: agentCount,
    agentMax: agentMax(),
    transcriptionUsed: transcriptionCount,
    transcriptionMax: transcriptionMax(),
    speechUsed: speechCount,
    speechMax: speechMax(),
    inFlight,
  };
}

async function occupy<T>(fn: () => Promise<T>, take?: () => void): Promise<T> {
  if (inFlight) {
    throw new RequestGuardError("Another request is already running. Wait for it to finish.", 409);
  }
  take?.();
  inFlight = true;
  try {
    return await fn();
  } finally {
    inFlight = false;
  }
}

function take(count: number, max: number, label: string): number {
  if (count >= max) {
    throw new RequestGuardError(
      `This server process has reached its ${label} limit of ${max}. Restart the server to reset the counter. This is not a provider billing cap.`,
      429,
    );
  }
  return count + 1;
}

export function withAgentSlot<T>(fn: () => Promise<T>): Promise<T> {
  return occupy(fn, () => {
    agentCount = take(agentCount, agentMax(), "agent");
  });
}

export function withTranscriptionSlot<T>(fn: () => Promise<T>): Promise<T> {
  return occupy(fn, () => {
    transcriptionCount = take(transcriptionCount, transcriptionMax(), "transcription");
  });
}

export function withSpeechSlot<T>(fn: () => Promise<T>): Promise<T> {
  return occupy(fn, () => {
    speechCount = take(speechCount, speechMax(), "speech");
  });
}

export function resetLimitsForTests(): void {
  agentCount = 0;
  transcriptionCount = 0;
  speechCount = 0;
  inFlight = false;
}
