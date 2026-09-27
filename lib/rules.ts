import type { EscalationType } from "./constants";
import type { CaseRecord } from "./types";

export type CaseDecision = {
  policyIds: string[];
  escalationType: EscalationType | null;
  eligible: boolean;
  offer: boolean;
  reason: string;
  uncertain: boolean;
  boundary: "inside" | "exact" | "over" | "not_applicable";
  kind: "refund" | "pickup" | "qc" | "unknown" | "final_sale";
};

export function refundWindowThreshold(record: CaseRecord): number {
  return record.paymentMethod === "cod" ? 10 : 7;
}

export function isRefundOverdue(record: CaseRecord): boolean {
  if (record.caseState === "refund_overdue") return true;
  const days = record.refund.workingDaysSinceInitiation;
  if (days === null || record.refund.initiated !== true || record.refund.received === true) return false;
  return days > refundWindowThreshold(record);
}

export function decideCase(record: CaseRecord): CaseDecision {
  if (record.issue === "unknown_status" || record.refund.initiated === null || record.returnRequest.pickupStatus === "unknown") {
    return {
      policyIds: ["ACT-01", "SEC-01"],
      escalationType: "human_review",
      eligible: true,
      offer: true,
      reason: "Return status, refund initiation, and elapsed working days are not available. A human status check is a handoff, not an overdue-refund escalation.",
      uncertain: true,
      boundary: "not_applicable",
      kind: "unknown",
    };
  }

  if (record.finalSale || record.issue === "wrong_item") {
    return {
      policyIds: ["RET-02", "ACT-01"],
      escalationType: "human_review",
      eligible: true,
      offer: true,
      reason: "Final-sale or wrong-item reports go to human review. The agent must not promise approval.",
      uncertain: false,
      boundary: "not_applicable",
      kind: "final_sale",
    };
  }

  if (record.returnRequest.inspectionStatus === "failed") {
    return {
      policyIds: ["RET-05", "ACT-01"],
      escalationType: "human_review",
      eligible: true,
      offer: true,
      reason: "Inspection failed. Explain the recorded reason and offer human review. Do not initiate a refund or say the case is resolved.",
      uncertain: false,
      boundary: "not_applicable",
      kind: "qc",
    };
  }

  if (record.returnRequest.pickupStatus === "pending" && record.refund.initiated !== true) {
    const days = record.returnRequest.pickupWorkingDaysElapsed;
    if (days === null) {
      return unavailable("Pickup elapsed working days are not available.");
    }
    if (days > 3) {
      return {
        policyIds: ["RET-03", "ACT-01"],
        escalationType: "logistics",
        eligible: true,
        offer: true,
        reason: "Pickup is still pending after more than 3 working days, so a logistics escalation can be offered after approval.",
        uncertain: false,
        boundary: "over",
        kind: "pickup",
      };
    }
    return {
      policyIds: ["RET-03"],
      escalationType: null,
      eligible: false,
      offer: false,
      reason: days === 3
        ? "Exactly 3 working days is not beyond the pickup threshold."
        : "Pickup is still inside the normal 3 working-day window.",
      uncertain: false,
      boundary: days === 3 ? "exact" : "inside",
      kind: "pickup",
    };
  }

  if (record.refund.initiated === true && record.refund.received === false) {
    const days = record.refund.workingDaysSinceInitiation;
    if (days === null) return unavailable("Working days since refund initiation are not available.");
    const threshold = refundWindowThreshold(record);
    const policyId = record.paymentMethod === "cod" ? "PAY-02" : "PAY-01";
    if (days > threshold) {
      return {
        policyIds: [policyId, "RET-04", "ACT-01"],
        escalationType: "payment_support",
        eligible: true,
        offer: true,
        reason: `The refund was initiated more than ${threshold} working days ago, so payment-support escalation can be offered after approval.`,
        uncertain: false,
        boundary: "over",
        kind: "refund",
      };
    }
    return {
      policyIds: [policyId, "RET-04"],
      escalationType: null,
      eligible: false,
      offer: false,
      reason: days === threshold
        ? `Exactly ${threshold} working days is not beyond the threshold.`
        : "The verified elapsed time is still inside the normal refund window.",
      uncertain: false,
      boundary: days === threshold ? "exact" : "inside",
      kind: "refund",
    };
  }

  return {
    policyIds: ["RET-01"],
    escalationType: null,
    eligible: false,
    offer: false,
    reason: "No overdue pickup or refund is recorded.",
    uncertain: false,
    boundary: "not_applicable",
    kind: "refund",
  };
}

function unavailable(reason: string): CaseDecision {
  return {
    policyIds: ["ACT-01"],
    escalationType: "human_review",
    eligible: true,
    offer: true,
    reason,
    uncertain: true,
    boundary: "not_applicable",
    kind: "unknown",
  };
}
