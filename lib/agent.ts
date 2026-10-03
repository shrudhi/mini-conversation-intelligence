import { MAX_TURNS, type EscalationType } from "./constants";
import { getCaseByOrderId, lookupTools } from "./cases";
import { constraintsFor, guardReply } from "./guard";
import { detectConversationIntent } from "./intent";
import {
  asksAboutProposedAction,
  asksForHuman,
  asksNextSteps,
  asksOrderSpecific,
  extractOrderId,
  extractPin,
  isApproval,
  isInjection,
  isRejection,
  hasAmbiguousNumber,
  resolveReplyLanguage,
  wantsPrivateStatus,
} from "./language";
import { facetQuery, normalizeQuery } from "./normalize";
import { composeReply } from "./reply";
import { retrievePolicies } from "./retrieve";
import { classifyMessage, findProfileConflict } from "./routing";
import { decideCase, type CaseDecision } from "./rules";
import type { CaseRecord, ConversationState, ConversationTurn, ReplyLanguage } from "./types";
import { getCustomerByOrderId } from "./customers";
import { assessPriority } from "./priority";

export type TicketResult = { ticketId: string; created: boolean } | { error: string };

export type TicketDeps = {
  createTicket: (input: { orderId: string; type: EscalationType }) => TicketResult | Promise<TicketResult>;
};

export type TurnMeta = {
  corrected?: boolean;
  originalTranscript?: string | null;
  stt?: ConversationTurn["stt"];
};

export function createState(partial?: Partial<ConversationState>): ConversationState {
  const selectedOrderId = partial?.selectedOrderId ?? null;
  const verifiedFromSelection =
    partial?.verifiedOrderId ??
    (selectedOrderId && getCaseByOrderId(selectedOrderId) ? selectedOrderId : null);
  return {
    languageMode: partial?.languageMode ?? "auto",
    languagePreference: partial?.languagePreference ?? null,
    selectedOrderId,
    scenarioId: partial?.scenarioId ?? null,
    verifiedOrderId: verifiedFromSelection,
    pendingAction: partial?.pendingAction ?? null,
    ticketId: partial?.ticketId ?? null,
    ticketType: partial?.ticketType ?? null,
    toolFailure: partial?.toolFailure ?? false,
    liveSentiment: partial?.liveSentiment ?? null,
    liveIssueFocus: partial?.liveIssueFocus ?? null,
    livePriorityBoost: partial?.livePriorityBoost ?? 0,
    turns: partial?.turns ? [...partial.turns] : [],
  };
}

export async function applyCustomerTurn(
  current: ConversationState,
  text: string,
  deps: TicketDeps,
  meta: TurnMeta = {},
): Promise<ConversationState> {
  const state = createState(current);
  // Profile-selected demo context is already trusted — no PIN/OTP step.
  if (state.selectedOrderId && !state.verifiedOrderId) {
    const selected = getCaseByOrderId(state.selectedOrderId);
    if (selected) state.verifiedOrderId = selected.orderId;
  }
  const customerText = text.trim();
  const started = Date.now();
  const intent = detectConversationIntent(customerText);
  state.liveSentiment = intent.sentiment;
  state.liveIssueFocus = intent.issueFocus;
  state.livePriorityBoost = Math.max(state.livePriorityBoost, intent.priorityBoost);

  if (state.turns.length >= MAX_TURNS) {
    const language = replyLanguage(state, customerText);
    return append(state, customerText, meta, started, {
      language,
      normalizedQuery: normalizeQuery(customerText),
      retrieved: [],
      tools: [],
      verified: Boolean(state.verifiedOrderId),
      disclosed: false,
      composed: composeReply({
        language,
        kind: { type: "turn_limit" },
        ambiguous: false,
        context: replyContext(state, customerText, intent),
      }),
      proposedAction: null,
      approval: null,
      ticket: null,
      record: null,
    });
  }

  const language = replyLanguage(state, customerText);
  state.languagePreference = language;
  const ambiguous = hasAmbiguousNumber(customerText);
  const spokenOrder = extractOrderId(customerText);
  const spokenPin = extractPin(customerText);
  const disclosedBefore = state.turns.some((turn) => turn.disclosed);
  const messageKind = classifyMessage(customerText, {
    hasPendingAction: Boolean(state.pendingAction),
    hasTicket: Boolean(state.ticketId),
    disclosedBefore,
  });

  if (isInjection(customerText)) {
    const normalizedQuery = `${normalizeQuery(customerText)} verify pin`;
    return append(state, customerText, meta, started, {
      language,
      normalizedQuery,
      retrieved: retrievePolicies(normalizedQuery),
      tools: [],
      verified: false,
      disclosed: false,
      composed: composeReply({
        language,
        kind: { type: "injection" },
        ambiguous,
        context: replyContext(state, customerText, intent),
      }),
      proposedAction: null,
      approval: null,
      ticket: null,
      record: null,
    });
  }

  const replyLang: ReplyLanguage = language;

  // Cross-profile references must not leak another customer's case through the selected profile.
  const conflict = findProfileConflict(customerText, state.selectedOrderId);
  if (conflict) {
    state.pendingAction = null;
    return append(state, customerText, meta, started, {
      language: replyLang,
      normalizedQuery: normalizeQuery(customerText),
      retrieved: retrievePolicies("confidential cross privacy"),
      tools: [],
      verified: Boolean(state.verifiedOrderId),
      disclosed: false,
      composed: composeReply({
        language: replyLang,
        kind: {
          type: "profile_switch",
          selectedName: conflict.selectedName,
          mentionedName: conflict.mentionedName,
        },
        ambiguous: false,
        context: replyContext(state, customerText, intent),
      }),
      proposedAction: null,
      approval: null,
      ticket: null,
      record: null,
    });
  }

  // Clarify a live support offer before treating the turn as off-topic.
  if (
    state.pendingAction &&
    (messageKind === "follow_up" || asksAboutProposedAction(customerText) || asksNextSteps(customerText)) &&
    !isApproval(customerText) &&
    !isRejection(customerText)
  ) {
    return finishVerified(state, customerText, meta, started, replyLang, ambiguous, intent, {
      type: "explain_offer",
      escalation: state.pendingAction,
    });
  }

  if (messageKind === "greeting" || messageKind === "unrelated" || messageKind === "unclear") {
    state.pendingAction = null;
    return append(state, customerText, meta, started, {
      language: replyLang,
      normalizedQuery: normalizeQuery(customerText),
      retrieved: [],
      tools: [],
      verified: Boolean(state.verifiedOrderId),
      disclosed: false,
      composed: composeReply({
        language: replyLang,
        kind: { type: messageKind },
        ambiguous: false,
        context: replyContext(state, customerText, intent),
      }),
      proposedAction: null,
      approval: null,
      ticket: null,
      record: null,
    });
  }

  if (state.pendingAction && isRejection(customerText)) {
    state.pendingAction = null;
    return finishVerified(state, customerText, meta, started, replyLang, ambiguous, intent, {
      type: "declined",
    });
  }

  if (state.pendingAction && state.verifiedOrderId && isApproval(customerText)) {
    return approve(state, customerText, meta, started, replyLang, ambiguous, intent, deps);
  }

  // Stale pending approvals must not carry into a new support topic.
  if (state.pendingAction && messageKind === "support" && !isApproval(customerText) && !isRejection(customerText)) {
    const stillAboutOffer =
      intent.wantsTicket ||
      asksForHuman(customerText) ||
      intent.issueFocus === "ticket_status" ||
      asksNextSteps(customerText) ||
      asksAboutProposedAction(customerText);
    if (!stillAboutOffer) state.pendingAction = null;
  }

  if (
    state.ticketId &&
    state.ticketType &&
    (intent.wantsTicket ||
      intent.issueFocus === "ticket_status" ||
      asksNextSteps(customerText) ||
      (intent.escalating && asksNextSteps(customerText)) ||
      isApproval(customerText))
  ) {
    const record = state.verifiedOrderId ? getCaseByOrderId(state.verifiedOrderId) : null;
    return finishVerified(state, customerText, meta, started, replyLang, ambiguous, intent, {
      type: "next_steps",
      ticketId: state.ticketId,
      escalation: state.ticketType,
      reference: record?.refund.reference ?? null,
      asksFixedDate: /\b(two days|2 days|next two days|by tomorrow)\b/i.test(customerText),
    });
  }

  if (spokenOrder) {
    const found = getCaseByOrderId(spokenOrder);
    if (!found) {
      const normalizedQuery = `${normalizeQuery(customerText)} verify pin`;
      return append(state, customerText, meta, started, {
        language: replyLang,
        normalizedQuery,
        retrieved: retrievePolicies(normalizedQuery),
        tools: [],
        verified: false,
        disclosed: false,
        composed: composeReply({
          language: replyLang,
          kind: { type: "unknown_order", orderId: spokenOrder },
          ambiguous,
          context: replyContext(state, customerText, intent),
        }),
        proposedAction: null,
        approval: null,
        ticket: null,
        record: null,
      });
    }
  }

  const orderId = spokenOrder ?? state.verifiedOrderId ?? state.selectedOrderId;
  // Ignore spoken PIN/OTP — signed-in profile already unlocks the selected order.
  if (spokenPin && orderId && !state.verifiedOrderId) {
    const found = getCaseByOrderId(orderId);
    if (found) state.verifiedOrderId = found.orderId;
  } else if (spokenOrder) {
    const found = getCaseByOrderId(spokenOrder);
    if (found && state.selectedOrderId && found.orderId === state.selectedOrderId) {
      state.verifiedOrderId = found.orderId;
    } else if (found && !state.selectedOrderId) {
      state.verifiedOrderId = found.orderId;
    }
  }

  const verified = state.verifiedOrderId ? getCaseByOrderId(state.verifiedOrderId) : null;
  const selected = state.selectedOrderId ? getCaseByOrderId(state.selectedOrderId) : null;
  const specific =
    asksOrderSpecific(customerText) ||
    Boolean(spokenPin) ||
    Boolean(selected && wantsPrivateStatus(customerText));

  if (state.toolFailure && verified) {
    const normalizedQuery = `${normalizeQuery(customerText)} order status`;
    return append(state, customerText, meta, started, {
      language: replyLang,
      normalizedQuery,
      retrieved: retrievePolicies(normalizedQuery),
      tools: lookupTools(verified, true),
      verified: true,
      disclosed: false,
      composed: composeReply({
        language: replyLang,
        kind: { type: "tool_failure" },
        ambiguous,
        context: replyContext(state, customerText, intent),
      }),
      proposedAction: null,
      approval: null,
      ticket: null,
      record: null,
    });
  }

  if (asksForHuman(customerText) && verified) {
    const decision = decideCase(verified);
    if (shouldAutoCreateTicket(verified, intent, decision) && decision.escalationType && !state.ticketId) {
      return autoCreateTicket(state, customerText, meta, started, replyLang, ambiguous, intent, deps, verified, decision);
    }
    return finishVerified(state, customerText, meta, started, replyLang, ambiguous, intent, {
      type: "human_agent",
      canOffer: decision.offer && decision.eligible,
      escalation: decision.escalationType,
    });
  }

  // If a signed-in order exists, use it instead of asking for a PIN.
  if (!verified && selected) {
    state.verifiedOrderId = selected.orderId;
    const decision = decideCase(selected);
    if (shouldAutoCreateTicket(selected, intent, decision) && decision.escalationType && !state.ticketId) {
      return autoCreateTicket(state, customerText, meta, started, replyLang, ambiguous, intent, deps, selected, decision);
    }
    return finishVerified(state, customerText, meta, started, replyLang, ambiguous, intent, {
      type: "case",
      record: selected,
      decision,
    });
  }

  if (!verified && specific) {
    const normalizedQuery = `${normalizeQuery(customerText)} order status`;
    return append(state, customerText, meta, started, {
      language: replyLang,
      normalizedQuery,
      retrieved: retrievePolicies(normalizedQuery),
      tools: lookupTools(null, false),
      verified: false,
      disclosed: false,
      composed: composeReply({
        language: replyLang,
        kind: { type: "ask_order" },
        ambiguous,
        context: replyContext(state, customerText, intent),
      }),
      proposedAction: null,
      approval: null,
      ticket: null,
      record: null,
    });
  }

  if (!verified) {
    const normalizedQuery = normalizeQuery(customerText);
    const retrieved = retrievePolicies(normalizedQuery);
    return append(state, customerText, meta, started, {
      language: replyLang,
      normalizedQuery,
      retrieved,
      tools: [],
      verified: false,
      disclosed: false,
      composed: composeReply({
        language: replyLang,
        kind: { type: "public", policies: retrieved },
        ambiguous,
        context: replyContext(state, customerText, intent),
      }),
      proposedAction: null,
      approval: null,
      ticket: null,
      record: null,
    });
  }

  const decision = decideCase(verified);
  if (shouldAutoCreateTicket(verified, intent, decision) && decision.escalationType && !state.ticketId) {
    return autoCreateTicket(state, customerText, meta, started, replyLang, ambiguous, intent, deps, verified, decision);
  }
  return finishVerified(state, customerText, meta, started, replyLang, ambiguous, intent, {
    type: "case",
    record: verified,
    decision,
  });
}

/** Critical overdue / escalating cases: create the ticket and inform — do not ask for a yes. */
export function shouldAutoCreateTicket(
  record: CaseRecord,
  intent: ReturnType<typeof detectConversationIntent>,
  decision: CaseDecision,
): boolean {
  if (!decision.eligible || !decision.offer || !decision.escalationType || record.refund.received === true) {
    return false;
  }
  if (decision.boundary === "over") return true;
  if (intent.sentiment === "escalating" || intent.sentiment === "aggressive") return true;
  if (record.caseState === "refund_overdue") return true;
  if (record.priorContacts >= 2 && decision.boundary !== "inside" && decision.boundary !== "exact") return true;
  const customer = getCustomerByOrderId(record.orderId);
  if (customer) {
    const priority = assessPriority({
      record,
      customer,
      liveSentiment: intent.sentiment,
      liveIssueFocus: intent.issueFocus,
      liveBoost: intent.priorityBoost,
    });
    if (priority.level === "P1" && decision.boundary !== "exact") return true;
  }
  return false;
}

async function autoCreateTicket(
  state: ConversationState,
  customerText: string,
  meta: TurnMeta,
  started: number,
  language: ReplyLanguage,
  ambiguous: boolean,
  intent: ReturnType<typeof detectConversationIntent>,
  deps: TicketDeps,
  record: CaseRecord,
  decision: CaseDecision,
): Promise<ConversationState> {
  const escalation = decision.escalationType!;
  if (state.toolFailure) {
    return finishVerified(state, customerText, meta, started, language, ambiguous, intent, { type: "tool_failure" });
  }
  try {
    const result = await deps.createTicket({ orderId: record.orderId, type: escalation });
    if ("error" in result) {
      return finishVerified(state, customerText, meta, started, language, ambiguous, intent, {
        type: "ticket_refused",
        reason: result.error,
      });
    }
    state.ticketId = result.ticketId;
    state.ticketType = escalation;
    state.pendingAction = null;
    return finishVerified(
      state,
      customerText,
      meta,
      started,
      language,
      ambiguous,
      intent,
      {
        type: "auto_ticket",
        ticketId: result.ticketId,
        created: result.created,
        escalation,
        record,
        decision,
      },
      {
        approved: true,
        ticket: { ticketId: result.ticketId, created: result.created, type: escalation },
      },
    );
  } catch {
    return finishVerified(state, customerText, meta, started, language, ambiguous, intent, {
      type: "ticket_refused",
      reason: "Not created. The support ticket could not be saved.",
    });
  }
}

async function approve(
  state: ConversationState,
  customerText: string,
  meta: TurnMeta,
  started: number,
  language: ReplyLanguage,
  ambiguous: boolean,
  intent: ReturnType<typeof detectConversationIntent>,
  deps: TicketDeps,
): Promise<ConversationState> {
  const record = state.verifiedOrderId ? getCaseByOrderId(state.verifiedOrderId) : null;
  const pending = state.pendingAction;
  if (!record || !pending || state.toolFailure) {
    state.pendingAction = null;
    return finishVerified(state, customerText, meta, started, language, ambiguous, intent, { type: "tool_failure" });
  }
  const decision = decideCase(record);
  if (!decision.eligible || decision.escalationType !== pending) {
    state.pendingAction = null;
    return finishVerified(state, customerText, meta, started, language, ambiguous, intent, {
      type: "ticket_refused",
      reason: decision.reason,
    });
  }
  const result = await deps.createTicket({ orderId: record.orderId, type: pending });
  if ("error" in result) {
    state.pendingAction = null;
    return finishVerified(state, customerText, meta, started, language, ambiguous, intent, {
      type: "ticket_refused",
      reason: result.error,
    });
  }
  state.ticketId = result.ticketId;
  state.ticketType = pending;
  state.pendingAction = null;
  if (!result.created) {
    state.livePriorityBoost = Math.max(state.livePriorityBoost, 20);
    state.liveSentiment = intent.sentiment === "calm" ? "frustrated" : intent.sentiment;
  }
  return finishVerified(
    state,
    customerText,
    meta,
    started,
    language,
    ambiguous,
    intent,
    {
      type: "ticket",
      ticketId: result.ticketId,
      created: result.created,
      escalation: pending,
    },
    {
      approved: true,
      ticket: { ticketId: result.ticketId, created: result.created, type: pending },
    },
  );
}

function finishVerified(
  state: ConversationState,
  customerText: string,
  meta: TurnMeta,
  started: number,
  language: ReplyLanguage,
  ambiguous: boolean,
  intent: ReturnType<typeof detectConversationIntent>,
  kind: Parameters<typeof composeReply>[0]["kind"],
  extras?: {
    approved?: boolean;
    ticket?: ConversationTurn["ticket"];
  },
): ConversationState {
  const record =
    (kind.type === "auto_ticket" ? kind.record : null) ??
    (state.verifiedOrderId ? getCaseByOrderId(state.verifiedOrderId) : null);
  const failed = state.toolFailure || kind.type === "tool_failure";
  const decision =
    kind.type === "case" || kind.type === "auto_ticket"
      ? kind.decision
      : record
        ? decideCase(record)
        : null;
  const actionReply = kind.type === "case" || kind.type === "human_agent";
  const offer = Boolean(decision?.offer && decision.eligible && !failed && actionReply && !state.ticketId);
  if (actionReply) state.pendingAction = offer ? decision?.escalationType ?? null : null;
  if (kind.type === "explain_offer") {
    // Keep the live offer so the customer can still approve/decline after the explanation.
    state.pendingAction = kind.escalation;
  }
  if (
    kind.type === "declined" ||
    kind.type === "ticket" ||
    kind.type === "auto_ticket" ||
    kind.type === "ticket_refused" ||
    kind.type === "ticket_status" ||
    kind.type === "next_steps" ||
    kind.type === "greeting" ||
    kind.type === "unrelated" ||
    kind.type === "unclear" ||
    kind.type === "profile_switch" ||
    failed
  ) {
    state.pendingAction = null;
  }

  const facets =
    record && !failed
      ? facetQuery({
          paymentMethod: record.paymentMethod,
          pickupStatus: record.returnRequest.pickupStatus,
          inspectionStatus: record.returnRequest.inspectionStatus,
          finalSale: record.finalSale,
          issue: record.issue,
          offerEscalation: offer,
        })
      : "order status";
  const normalizedQuery = `${normalizeQuery(customerText)} ${facets}`.trim();
  return append(state, customerText, meta, started, {
    language,
    normalizedQuery,
    retrieved: retrievePolicies(normalizedQuery),
    tools: lookupTools(record, failed),
    verified: Boolean(record),
    disclosed: Boolean(record) && !failed && kind.type !== "declined" && kind.type !== "ticket_refused",
    composed: composeReply({
      language,
      kind,
      ambiguous,
      context: replyContext(state, customerText, intent),
    }),
    proposedAction:
      kind.type === "explain_offer"
        ? kind.escalation
        : offer
          ? decision?.escalationType ?? null
          : null,
    approval: extras?.approved ? { approved: true, at: new Date().toISOString() } : null,
    ticket: extras?.ticket ?? null,
    record: failed ? null : record,
  });
}

function replyContext(
  state: ConversationState,
  customerText: string,
  intent: ReturnType<typeof detectConversationIntent>,
) {
  return {
    customerText,
    disclosedBefore: state.turns.some((turn) => turn.disclosed),
    ticketId: state.ticketId,
    ticketType: state.ticketType,
    intent,
    priorTurns: state.turns.slice(-4).map((turn) => ({
      customerText: turn.customerText,
      responseText: turn.responseText,
      disclosed: turn.disclosed,
    })),
  };
}

function append(
  state: ConversationState,
  customerText: string,
  meta: TurnMeta,
  started: number,
  input: {
    language: ConversationTurn["language"];
    normalizedQuery: string;
    retrieved: ConversationTurn["retrieved"];
    tools: ConversationTurn["tools"];
    verified: boolean;
    disclosed: boolean;
    composed: ReturnType<typeof composeReply>;
    proposedAction: EscalationType | null;
    approval: ConversationTurn["approval"];
    ticket: ConversationTurn["ticket"];
    record: CaseRecord | null;
  },
): ConversationState {
  const retrievalMs = Math.max(0, Date.now() - started);
  const constraints = constraintsFor(input.disclosed ? input.record : null, input.disclosed);
  const guard = guardReply(input.composed.text, constraints);
  const responseText = guard
    ? "I need to check that again before I share order details."
    : input.composed.text;
  const uncertainties = guard ? [...input.composed.uncertainties, guard] : input.composed.uncertainties;
  const turn: ConversationTurn = {
    id: `T${state.turns.length + 1}`,
    at: new Date().toISOString(),
    customerText,
    corrected: Boolean(meta.corrected),
    originalTranscript: meta.originalTranscript ?? null,
    stt: meta.stt ?? null,
    language: input.language,
    normalizedQuery: input.normalizedQuery,
    retrievalMs,
    retrieved: input.retrieved,
    tools: input.tools,
    verified: input.verified,
    disclosed: guard ? false : input.disclosed,
    responseText,
    responseSource: "template",
    citations: guard ? [] : input.composed.citations,
    uncertainties,
    proposedAction: guard ? null : input.proposedAction,
    approval: input.approval,
    ticket: input.ticket,
    speech: { status: "not_requested", voice: null, latencyMs: null, playback: null },
    latency: { stt: meta.stt?.latencyMs ?? null, retrieval: retrievalMs, model: null, tts: null, total: retrievalMs },
    usage: { inputTokens: null, outputTokens: null, audioSeconds: meta.stt?.durationSeconds ?? null },
    constraints,
  };
  state.turns = [...state.turns, turn];
  return state;
}

function replyLanguage(state: ConversationState, text: string): ReplyLanguage {
  return resolveReplyLanguage(state.languageMode, state.languagePreference, text);
}
