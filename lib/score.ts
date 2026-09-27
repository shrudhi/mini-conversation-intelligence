import { CRITERION_IDS, RUBRIC_WEIGHTS, type CriterionId } from "./constants";
import type { QaStatus, ScoreView } from "./types";

const FACTOR: Record<"pass" | "partial" | "fail", number> = {
  pass: 1,
  partial: 0.5,
  fail: 0,
};

/** Criteria that must not fail for a run to count as an overall pass. */
export const GATE_CRITERIA: CriterionId[] = [
  "policy_accuracy",
  "case_grounding",
  "action_safety",
  "identity_privacy",
  "task_outcome",
];

export type ScoreInput = {
  criterion: CriterionId;
  status: QaStatus;
};

export type CriterionPoints = {
  earned: number;
  weight: number;
  assessed: boolean;
};

export function pointsFor(status: QaStatus, weight: number): CriterionPoints {
  if (status === "not_applicable") return { earned: 0, weight: 0, assessed: false };
  if (status === "not_assessable") return { earned: 0, weight, assessed: false };
  return { earned: weight * FACTOR[status], weight, assessed: true };
}

/**
 * Overall pass requires a published score and no fail on gated criteria.
 * A high headline with a failed escalation/policy/privacy check is not a pass.
 */
export function isOverallPass(input: {
  score: Pick<ScoreView, "label" | "headline">;
  criteria: Array<{ criterion: CriterionId; status: QaStatus }>;
}): boolean {
  if (input.score.label !== "score" || input.score.headline === null) return false;
  for (const id of GATE_CRITERIA) {
    const status = input.criteria.find((item) => item.criterion === id)?.status;
    if (status === "fail") return false;
  }
  return true;
}

function roundScore(value: number): number {
  if (Number.isInteger(value)) return value;
  return Math.round(value * 10) / 10;
}

function blocked(reason: string, label: ScoreView["label"] = "needs_review"): ScoreView {
  return {
    headline: null,
    label,
    coverage: null,
    assessedWeight: 0,
    applicableWeight: 0,
    reason,
  };
}

/**
 * Headline = 100 × earned / assessed weight.
 * not_applicable leaves the weight out.
 * not_assessable stays in the applicable weight.
 * Coverage below 80% hides the headline.
 */
export function scoreOutcome(items: ScoreInput[]): ScoreView {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.criterion)) {
      return blocked("A scorecard criterion was duplicated, so the total was not calculated.");
    }
    seen.add(item.criterion);
  }
  if (!CRITERION_IDS.every((id) => seen.has(id)) || seen.size !== CRITERION_IDS.length) {
    return blocked("A scorecard criterion was missing, so the total was not calculated.");
  }

  let earned = 0;
  let assessedWeight = 0;
  let applicableWeight = 0;

  for (const id of CRITERION_IDS) {
    const item = items.find((entry) => entry.criterion === id);
    if (!item) return blocked("A scorecard criterion was missing, so the total was not calculated.");
    const weight = RUBRIC_WEIGHTS[id];
    if (item.status === "not_applicable") continue;
    applicableWeight += weight;
    if (item.status === "not_assessable") continue;
    assessedWeight += weight;
    earned += weight * FACTOR[item.status];
  }

  if (applicableWeight === 0 || assessedWeight === 0) {
    return {
      headline: null,
      label: "no_score",
      coverage: applicableWeight === 0 ? null : 0,
      assessedWeight,
      applicableWeight,
      reason: "No score. There is not enough assessable rubric weight to calculate one.",
    };
  }

  const coverage = assessedWeight / applicableWeight;
  if (coverage < 0.8) {
    return {
      headline: null,
      label: "incomplete",
      coverage,
      assessedWeight,
      applicableWeight,
      reason: "Incomplete assessment. Coverage is below 80%, so the headline score is hidden.",
    };
  }

  return {
    headline: roundScore((100 * earned) / assessedWeight),
    label: "score",
    coverage,
    assessedWeight,
    applicableWeight,
    reason: "",
  };
}
