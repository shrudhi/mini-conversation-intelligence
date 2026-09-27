import "server-only";

import { getCaseByOrderId } from "./cases";
import { readJson, withStoreLock, writeJson } from "./persist";
import type {
  ConversationFeedback,
  FeedbackResolution,
  FeedbackSatisfaction,
  FeedbackStatus,
  FixturePastConversation,
  PastConversationEntry,
  PersistedSession,
} from "./types";

export type { FixturePastConversation };

const FEEDBACK_FILE = "feedback.json";
const HISTORY_FILE = "conversation-history.json";

export type FeedbackSummary = {
  endedConversations: number;
  submittedCount: number;
  skippedCount: number;
  noFeedbackCount: number;
  responseRate: number | null;
  responseLabel: string;
  satisfactionRate: number | null;
  satisfactionLabel: string;
  satisfiedCount: number;
  satisfactionDenominator: number;
  resolutionYesCount: number;
  resolutionPartlyCount: number;
  resolutionNoCount: number;
  resolutionRate: number | null;
  resolutionLabel: string;
  note: string;
};

export async function listFeedback(): Promise<ConversationFeedback[]> {
  return withStoreLock(() => readJson<ConversationFeedback[]>(FEEDBACK_FILE, []));
}

export async function getFeedbackBySession(sessionId: string): Promise<ConversationFeedback | null> {
  const all = await listFeedback();
  return all.find((item) => item.sessionId === sessionId) ?? null;
}

export async function saveFeedback(input: {
  sessionId: string;
  customerId?: string | null;
  orderId?: string | null;
  status: FeedbackStatus;
  satisfied?: FeedbackSatisfaction | null;
  resolved?: FeedbackResolution | null;
  comment?: string | null;
}): Promise<{ ok: true; feedback: ConversationFeedback } | { ok: false; error: string; code: "duplicate" | "invalid" | "unavailable" }> {
  if (process.env.FEEDBACK_FORCE_FAIL === "1") {
    return { ok: false, error: "Feedback could not be saved. Please try again.", code: "unavailable" };
  }

  if (input.status === "submitted") {
    if (input.satisfied !== "yes" && input.satisfied !== "no") {
      return { ok: false, error: "Choose Yes or No for satisfaction.", code: "invalid" };
    }
    if (input.resolved !== "yes" && input.resolved !== "partly" && input.resolved !== "no") {
      return { ok: false, error: "Choose Yes, Partly, or No for resolution.", code: "invalid" };
    }
  }

  return withStoreLock(async () => {
    const all = await readJson<ConversationFeedback[]>(FEEDBACK_FILE, []);
    const existing = all.find((item) => item.sessionId === input.sessionId);
    if (existing) {
      return { ok: false as const, error: "Feedback was already recorded for this conversation.", code: "duplicate" as const };
    }

    const now = new Date().toISOString();
    const comment =
      input.status === "submitted" && typeof input.comment === "string"
        ? input.comment.trim().slice(0, 300) || null
        : null;

    const feedback: ConversationFeedback = {
      id: `fb-${input.sessionId}`,
      sessionId: input.sessionId,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      createdAt: now,
      updatedAt: now,
      status: input.status,
      satisfied: input.status === "submitted" ? input.satisfied ?? null : null,
      resolved: input.status === "submitted" ? input.resolved ?? null : null,
      comment,
    };

    all.push(feedback);
    await writeJson(FEEDBACK_FILE, all);
    return { ok: true as const, feedback };
  });
}

export function summarizeFeedback(
  feedback: ConversationFeedback[],
  endedSessions: PersistedSession[],
): FeedbackSummary {
  const ended = endedSessions.filter((session) => session.source === "live" && session.ended);
  const endedIds = new Set(ended.map((session) => session.id));
  // Prefer feedback tied to ended live sessions
  const scoped = ended.length
    ? feedback.filter((item) => endedIds.has(item.sessionId))
    : feedback;

  const submitted = scoped.filter((item) => item.status === "submitted");
  const skipped = scoped.filter((item) => item.status === "skipped");
  const answeredSessions = new Set([...submitted, ...skipped].map((item) => item.sessionId));
  const noFeedbackCount = Math.max(0, ended.length - answeredSessions.size);

  const satisfiedCount = submitted.filter((item) => item.satisfied === "yes").length;
  const satisfactionDenominator = submitted.length;
  const resolutionYesCount = submitted.filter((item) => item.resolved === "yes").length;
  const resolutionPartlyCount = submitted.filter((item) => item.resolved === "partly").length;
  const resolutionNoCount = submitted.filter((item) => item.resolved === "no").length;

  const responseDenom = ended.length || scoped.length;
  const responseNumer = submitted.length;
  // Response rate = submitted / ended conversations offered feedback
  const responseRate = responseDenom > 0 ? responseNumer / responseDenom : null;

  return {
    endedConversations: ended.length,
    submittedCount: submitted.length,
    skippedCount: skipped.length,
    noFeedbackCount,
    responseRate,
    responseLabel: responseDenom > 0 ? `${responseNumer}/${responseDenom}` : "—",
    satisfactionRate: satisfactionDenominator > 0 ? satisfiedCount / satisfactionDenominator : null,
    satisfactionLabel: satisfactionDenominator > 0 ? `${satisfiedCount}/${satisfactionDenominator}` : "—",
    satisfiedCount,
    satisfactionDenominator,
    resolutionYesCount,
    resolutionPartlyCount,
    resolutionNoCount,
    resolutionRate: satisfactionDenominator > 0 ? resolutionYesCount / satisfactionDenominator : null,
    resolutionLabel: satisfactionDenominator > 0 ? `${resolutionYesCount}/${satisfactionDenominator}` : "—",
    note:
      ended.length === 0
        ? "No ended live conversations yet. Skipped surveys count as no feedback, not dissatisfaction."
        : `Customer survey rates use ${ended.length} ended live conversation${ended.length === 1 ? "" : "s"}. Skipped or missing surveys are “No feedback,” not “Not satisfied.”`,
  };
}

export function feedbackDisplay(feedback: ConversationFeedback | null | undefined): {
  label: "No feedback" | "Submitted" | "Skipped";
  satisfied: string;
  resolved: string;
  comment: string | null;
} {
  if (!feedback || feedback.status === "skipped") {
    return {
      label: feedback?.status === "skipped" ? "Skipped" : "No feedback",
      satisfied: "No feedback",
      resolved: "No feedback",
      comment: null,
    };
  }
  return {
    label: "Submitted",
    satisfied: feedback.satisfied === "yes" ? "Yes" : feedback.satisfied === "no" ? "No" : "No feedback",
    resolved:
      feedback.resolved === "yes"
        ? "Yes"
        : feedback.resolved === "partly"
          ? "Partly"
          : feedback.resolved === "no"
            ? "No"
            : "No feedback",
    comment: feedback.comment,
  };
}

export async function listConversationHistory(): Promise<PastConversationEntry[]> {
  return withStoreLock(() => readJson<PastConversationEntry[]>(HISTORY_FILE, []));
}

export async function getConversationHistoryEntry(sessionId: string): Promise<PastConversationEntry | null> {
  const all = await listConversationHistory();
  return all.find((item) => item.sessionId === sessionId) ?? null;
}

export async function appendConversationHistory(entry: PastConversationEntry): Promise<PastConversationEntry[]> {
  return withStoreLock(async () => {
    const all = await readJson<PastConversationEntry[]>(HISTORY_FILE, []);
    // Idempotent by sessionId — ending twice must not create duplicates.
    const existingIndex = all.findIndex((item) => item.sessionId && item.sessionId === entry.sessionId);
    if (existingIndex >= 0) {
      all[existingIndex] = { ...all[existingIndex], ...entry, readOnly: true };
    } else {
      all.push(entry);
    }
    await writeJson(HISTORY_FILE, all);
    return all.filter((item) => item.customerId === entry.customerId);
  });
}

export function historyForCustomer(
  customerId: string,
  fixture: FixturePastConversation[],
  persisted: PastConversationEntry[],
): PastConversationEntry[] {
  const fromStore = persisted
    .filter((item) => item.customerId === customerId)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  const fixtureEntries: PastConversationEntry[] = fixture.map((item, index) => {
    const orderId = item.orderId ?? null;
    return {
      sessionId: `fixture-${customerId}-${index}`,
      customerId,
      orderId,
      productName: item.productName ?? null,
      productId: item.productId ?? null,
      issue: item.issue ?? null,
      priority: item.priority ?? null,
      status: item.status ?? null,
      resolution: item.resolution ?? item.outcome,
      nextAction: item.nextAction ?? null,
      ticketId: item.ticketId ?? null,
      when: item.when,
      channel: item.channel,
      summary: item.summary,
      outcome: item.outcome,
      savedAt: `1970-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
      transcript: item.transcript ?? [
        { role: "customer", text: item.summary, at: item.when },
        { role: "agent", text: item.outcome, at: item.when },
      ],
      actions: item.actions ?? [],
      feedback: item.feedback ?? { status: "none", satisfied: null, resolved: null, comment: null },
      readOnly: true,
    };
  });

  return [...fromStore, ...fixtureEntries];
}

export function buildHistoryEntry(
  session: PersistedSession,
  customerId: string,
  feedback?: ConversationFeedback | null,
  priorityLevel?: string | null,
): PastConversationEntry {
  const orderId = session.verifiedOrderId ?? session.selectedOrderId;
  const record = orderId ? getCaseByOrderId(orderId) : null;
  const firstCustomer = session.turns.find((turn) => turn.customerText.trim())?.customerText.trim() ?? "";
  const summary =
    firstCustomer.length > 140
      ? `${firstCustomer.slice(0, 137)}…`
      : firstCustomer || `Voice support for ${orderId ?? "order"}`;

  const ticketId = session.ticketId;
  const ticketType = session.ticketType;
  const outcome = ticketId
    ? `Ticket ${ticketId}${ticketType ? ` · ${ticketType.replaceAll("_", " ")}` : ""}`
    : "Conversation completed · no ticket";

  const actions: string[] = [];
  for (const turn of session.turns) {
    if (turn.ticket?.created && turn.ticket.ticketId) {
      actions.push(`Created ${turn.ticket.type.replaceAll("_", " ")} ticket ${turn.ticket.ticketId}`);
    } else if (turn.proposedAction && turn.approval?.approved === false) {
      actions.push(`Offered ${turn.proposedAction.replaceAll("_", " ")} · declined`);
    } else if (turn.proposedAction && !turn.ticket) {
      actions.push(`Offered ${turn.proposedAction.replaceAll("_", " ")} · awaiting approval`);
    }
  }
  if (actions.length === 0) {
    actions.push(ticketId ? `Ticket on file: ${ticketId}` : "Explained case status · no ticket");
  }

  const savedAt = session.updatedAt || new Date().toISOString();
  const feedbackView = feedback
    ? {
        status: feedback.status === "submitted" ? ("submitted" as const) : ("skipped" as const),
        satisfied: feedback.satisfied,
        resolved: feedback.resolved,
        comment: feedback.comment,
      }
    : { status: "none" as const, satisfied: null, resolved: null, comment: null };

  const resolution =
    feedback?.status === "submitted" && feedback.resolved
      ? feedback.resolved === "yes"
        ? "Customer reported resolved"
        : feedback.resolved === "partly"
          ? "Customer reported partly resolved"
          : "Customer reported not resolved"
      : ticketId
        ? `Open ticket ${ticketId}`
        : "No ticket · explained within policy";

  return {
    sessionId: session.id,
    customerId,
    orderId,
    productName: record?.product ?? null,
    productId: record?.productId ?? null,
    issue: record?.issue?.replaceAll("_", " ") ?? session.liveIssueFocus?.replaceAll("_", " ") ?? null,
    priority: priorityLevel ?? null,
    status: record?.caseState?.replaceAll("_", " ") ?? (session.ended ? "Conversation ended" : "In progress"),
    resolution,
    nextAction: ticketId
      ? `Track ${ticketType?.replaceAll("_", " ") ?? "support"} ticket ${ticketId}`
      : "No further action required unless the customer follows up",
    ticketId,
    when: formatWhenLabel(savedAt),
    channel: "Voice",
    summary,
    outcome,
    savedAt,
    transcript: session.turns.flatMap((turn) => {
      const rows: Array<{ role: "customer" | "agent"; text: string; at: string }> = [];
      if (turn.customerText.trim()) {
        rows.push({ role: "customer", text: turn.customerText.trim(), at: turn.at });
      }
      if (turn.responseText.trim()) {
        rows.push({ role: "agent", text: turn.responseText.trim(), at: turn.at });
      }
      return rows;
    }),
    actions,
    feedback: feedbackView,
    readOnly: true,
  };
}

function formatWhenLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
