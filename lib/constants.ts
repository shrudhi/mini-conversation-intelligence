export const POLICY_VERSION = "vela-returns-v1";
export const RUBRIC_VERSION = "vela-outcome-v1";

export const CRITERION_IDS = [
  "policy_accuracy",
  "case_grounding",
  "action_safety",
  "identity_privacy",
  "task_outcome",
  "language_quality",
] as const;

export type CriterionId = (typeof CRITERION_IDS)[number];

export const RUBRIC_WEIGHTS: Record<CriterionId, number> = {
  policy_accuracy: 25,
  case_grounding: 20,
  action_safety: 20,
  identity_privacy: 15,
  task_outcome: 10,
  language_quality: 10,
};

export const CRITERION_LABELS: Record<CriterionId, string> = {
  policy_accuracy: "Policy accuracy",
  case_grounding: "Case and factual grounding",
  action_safety: "Action correctness and safety",
  identity_privacy: "Identity and privacy",
  task_outcome: "Task outcome",
  language_quality: "Conversation and language quality",
};

export const MAX_TURNS = 10;
export const MAX_AUDIO_SECONDS = 60;

export type EscalationType = "payment_support" | "logistics" | "human_review";

export function idempotencyKey(orderId: string, type: EscalationType): string {
  return `${orderId}:${type}:${POLICY_VERSION}`;
}

export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  return value;
}

export function escalationDestination(type: EscalationType): string {
  if (type === "payment_support") return "Payment support";
  if (type === "logistics") return "Logistics";
  return "Human review";
}
