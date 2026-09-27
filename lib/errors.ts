function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

function codeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

export function publicAgentError(error: unknown): string {
  return publicProviderError(error, "The agent reply");
}

export function publicTranscriptionError(error: unknown): string {
  return publicProviderError(error, "Transcription");
}

export function publicSpeechError(error: unknown): string {
  return publicProviderError(error, "Speech generation");
}

export function publicJudgeError(error: unknown): string {
  return publicProviderError(error, "The AI judge");
}

function publicProviderError(error: unknown, label: string): string {
  const status = statusOf(error);
  const code = codeOf(error);
  const name = error instanceof Error ? error.name : "";
  if (status === 401 || status === 403) {
    return `The API key was rejected. Check OPENAI_API_KEY in .env.local. ${label} was not returned.`;
  }
  if (status === 429) {
    return "The provider rate limit was reached. Wait and retry manually. This app does not retry automatically.";
  }
  if (status === 404 || code === "model_not_found") {
    return "The configured model is unavailable for this account. Update the model name in .env.local. The app will not switch models automatically.";
  }
  if (name === "APIConnectionTimeoutError" || name === "TimeoutError") {
    return `${label} timed out. Retry manually. Nothing was saved from the provider response.`;
  }
  return `${label} could not be completed. Retry manually. No provider result was produced.`;
}
