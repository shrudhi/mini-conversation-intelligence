import type { CaseRecord, FixturePastConversation } from "./types";
import { isRefundOverdue } from "./rules";

export type CustomerBehavior = "calm" | "patient" | "anxious" | "frustrated" | "assertive" | "uncertain" | "concerned";

export type CustomerProfile = {
  customerId: string;
  name: string;
  city: string;
  memberSince: string;
  segment: string;
  preferredLanguage: "en" | "hi" | "hinglish";
  behavior: CustomerBehavior;
  escalationLevel: number;
  orderIds: string[];
  pastIssues: Array<{ orderId: string; type: string; outcome: string; when: string }>;
  pastConversations: FixturePastConversation[];
};

export type PriorityLevel = "P1" | "P2" | "P3";

export type PriorityAssessment = {
  level: PriorityLevel;
  score: number;
  label: string;
  reasons: string[];
  recommendedNextStep: string;
  decisionHint: string;
  sentiment?: string;
  issueFocus?: string;
};

export function assessPriority(input: {
  record: CaseRecord;
  customer: CustomerProfile;
  liveSentiment?: string;
  liveIssueFocus?: string;
  liveBoost?: number;
}): PriorityAssessment {
  const { record, customer } = input;
  let score = 20;
  const reasons: string[] = [];

  if (record.caseState === "refund_overdue" || isRefundOverdue(record)) {
    score += 35;
    reasons.push("Refund is outside the normal arrival window.");
  } else if (record.issue === "pickup_delay" && (record.returnRequest.pickupWorkingDaysElapsed ?? 0) > 3) {
    score += 28;
    reasons.push("Pickup has crossed the logistics wait window.");
  } else if (record.issue === "qc_fail") {
    score += 26;
    reasons.push("Quality check failed, so refund cannot start automatically.");
  } else if (record.issue === "wrong_item") {
    score += 24;
    reasons.push("Wrong-item report needs exception handling.");
  } else if (record.issue === "unknown_status") {
    score += 22;
    reasons.push("System status is incomplete and needs careful handling.");
  } else {
    score += 8;
    reasons.push("Issue is still inside the normal policy window.");
  }

  if (record.priorContacts >= 2) {
    score += 18;
    reasons.push(`${record.priorContacts} earlier contacts raise urgency.`);
  } else if (record.priorContacts === 1) {
    score += 8;
    reasons.push("Customer has contacted once before.");
  }

  if (customer.behavior === "frustrated" || customer.behavior === "assertive") {
    score += 12;
    reasons.push(`Customer behaviour is marked ${customer.behavior}.`);
  } else if (customer.behavior === "anxious" || customer.behavior === "concerned") {
    score += 8;
    reasons.push(`Customer behaviour is marked ${customer.behavior}.`);
  }

  if (customer.escalationLevel >= 2) {
    score += 14;
    reasons.push("Account already sits at a higher escalation level.");
  } else if (customer.escalationLevel === 1) {
    score += 7;
    reasons.push("Account has a mild escalation history.");
  }

  if (customer.pastIssues.length >= 2) {
    score += 5;
    reasons.push("Past issue history suggests closer monitoring.");
  }

  if (input.liveSentiment === "escalating" || input.liveSentiment === "aggressive") {
    score += input.liveBoost ?? 18;
    reasons.push(`Live tone is ${input.liveSentiment} — priority raised mid-conversation.`);
  } else if (input.liveSentiment === "frustrated") {
    score += input.liveBoost ?? 12;
    reasons.push("Live tone shows frustration — priority raised.");
  } else if (input.liveSentiment === "concerned") {
    score += input.liveBoost ?? 6;
    reasons.push("Live tone shows concern.");
  } else if ((input.liveBoost ?? 0) > 0) {
    score += input.liveBoost ?? 0;
  }

  if (input.liveIssueFocus && input.liveIssueFocus !== "general") {
    reasons.push(`Current issue focus: ${input.liveIssueFocus.replaceAll("_", " ")}.`);
  }

  const level: PriorityLevel = score >= 70 ? "P1" : score >= 45 ? "P2" : "P3";
  const label = level === "P1" ? "High priority" : level === "P2" ? "Medium priority" : "Standard priority";

  const recommendedNextStep = nextActionForCase(record, level);

  const decisionHint =
    record.caseState === "refund_overdue"
      ? "Likely payment-support request after approval"
      : record.issue === "pickup_delay"
        ? "Likely pickup-support request after approval"
        : record.issue === "qc_fail" || record.issue === "wrong_item" || record.issue === "unknown_status"
          ? "Likely human review after approval"
          : "Explain and close without ticket";

  return {
    level,
    score: Math.min(100, score),
    label,
    reasons,
    recommendedNextStep,
    decisionHint,
    sentiment: input.liveSentiment,
    issueFocus: input.liveIssueFocus,
  };
}

function nextActionForCase(record: CaseRecord, level: PriorityLevel): string {
  if (record.caseState === "refund_overdue" || (record.refund.workingDaysSinceInitiation ?? 0) > 7) {
    return level === "P1"
      ? "Acknowledge the delay, share the verified refund reference, and raise one payment-support ticket after customer approval — then track that ticket."
      : "Share the verified refund status and offer a payment-support ticket after approval if still overdue.";
  }
  if (record.issue === "pickup_delay" && (record.returnRequest.pickupWorkingDaysElapsed ?? 0) > 3) {
    return "Explain the delayed pickup, offer a pickup-support ticket after approval, and track logistics until pickup is completed.";
  }
  if (record.issue === "qc_fail") {
    return "Explain the inspection failure reason and offer human review after approval — do not start a refund.";
  }
  if (record.issue === "wrong_item") {
    return "Explain the final-sale / wrong-item exception path and offer human review after approval.";
  }
  if (record.issue === "unknown_status") {
    return "Say status is unavailable, offer a human status check after approval, and avoid inventing refund facts.";
  }
  if (record.refund.initiated && record.refund.reference) {
    return `Reassure with refund ${record.refund.reference} and the normal arrival window — no ticket unless the window is exceeded.`;
  }
  return "Explain the verified case timeline clearly and close without escalation unless the customer asks for more help.";
}
