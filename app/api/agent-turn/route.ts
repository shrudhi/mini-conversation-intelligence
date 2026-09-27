import { NextResponse } from "next/server";
import { applyCustomerTurn, createState } from "@/lib/agent";
import {
  applyPresentationStyle,
  snapshotAgentSettings,
  stylePhrasingInstructions,
  type AgentStyleSettings,
} from "@/lib/agent-settings";
import { getAgentSettings } from "@/lib/agent-settings-store";
import { getCaseByOrderId } from "@/lib/cases";
import { getCustomerByOrderId } from "@/lib/customers";
import { hasApiKey } from "@/lib/env";
import { publicAgentError } from "@/lib/errors";
import { guardReply } from "@/lib/guard";
import { RequestGuardError, withAgentSlot } from "@/lib/limits";
import { phraseWithModel } from "@/lib/phrase";
import { assessPriority } from "@/lib/priority";
import { makeCustomerFriendly, phrasingPreservesIntent } from "@/lib/reply";
import { classifyMessage } from "@/lib/routing";
import { getSession, saveSession } from "@/lib/sessions";
import { TicketError, createApprovedTicket } from "@/lib/tickets";
import type { PersistedSession, ReplyLanguage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Send the corrected transcript as JSON." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Enter or record a message before sending." }, { status: 400 });
  if (text.length > 2000) {
    return NextResponse.json({ error: "That message is too long. Keep a turn under 2,000 characters." }, { status: 400 });
  }

  const existing = typeof body.sessionId === "string" ? await getSession(body.sessionId) : null;
  if (typeof body.sessionId === "string" && !existing) {
    return NextResponse.json({ error: "That conversation was not found. Start a new one." }, { status: 404 });
  }
  if (existing?.ended) {
    return NextResponse.json({ error: "This conversation has ended. Start a new one to continue." }, { status: 400 });
  }

  const pmDefaults = existing?.agentStyle ?? (await getAgentSettings());
  const session = existing ?? (await newSession(body, pmDefaults));
  // Existing chats keep frozen agentStyle. Language mode may follow the support UI for STT/reply language.
  if (existing) {
    if (body.languageMode === "en" || body.languageMode === "hi" || body.languageMode === "auto") {
      session.languageMode = body.languageMode;
    }
  } else {
    session.languageMode = pmDefaults.languageMode;
  }
  const languageMode = session.languageMode;
  if (session.turns.length === 0 && typeof body.orderId === "string") session.selectedOrderId = body.orderId;
  if (typeof body.scenarioId === "string") session.scenarioId = body.scenarioId;
  if (typeof body.customerId === "string" && body.customerId.trim()) {
    session.customerId = body.customerId.trim().toUpperCase();
  }

  const style = session.agentStyle ?? null;
  const messageKind = classifyMessage(text);

  const next = await applyCustomerTurn(
    session,
    text,
    {
      createTicket: async ({ orderId, type }) => {
        if (session.toolFailure) return { error: "Lookup failed, so no ticket was created." };
        try {
          const result = await createApprovedTicket({ orderId, type, approved: true });
          return { ticketId: result.ticket.ticket_id, created: result.created };
        } catch (error) {
          return {
            error: error instanceof TicketError ? error.message : "Not created. The support ticket could not be saved.",
          };
        }
      },
    },
    {
      corrected: body.corrected === true,
      originalTranscript: typeof body.originalTranscript === "string" ? body.originalTranscript : null,
      stt: parseStt(body.stt),
    },
  );

  const last = next.turns[next.turns.length - 1];
  if (last && style && messageKind === "greeting") {
    // Presentation only: swap the canned greeting for the PM-approved greeting text.
    last.responseText = applyPresentationStyle(last.responseText, style, { kind: "greeting" });
  }

  let phrasedWithModel = false;
  if (last && hasApiKey()) {
    const started = Date.now();
    try {
      const phrased = await withAgentSlot(() =>
        phraseWithModel({
          language: (last.language === "uncertain" ? "en" : last.language) as ReplyLanguage,
          approvedReply: last.responseText,
          citations: last.citations,
          recentTurns: next.turns.slice(0, -1).map((turn) => ({
            customerText: turn.customerText,
            responseText: turn.responseText,
          })),
          styleInstructions: style ? stylePhrasingInstructions(style) : undefined,
        }),
      );
      last.latency.model = Date.now() - started;
      last.latency.total = (last.latency.stt ?? 0) + last.latency.retrieval + (last.latency.model ?? 0);
      const friendlyReply = makeCustomerFriendly(phrased.reply);
      const problem = guardReply(friendlyReply, { ...last.constraints, disclosed: last.disclosed });
      if (!problem && phrasingPreservesIntent(last.responseText, friendlyReply)) {
        last.responseText = friendlyReply;
        last.responseSource = "model";
        last.usage.inputTokens = phrased.inputTokens;
        last.usage.outputTokens = phrased.outputTokens;
        phrasedWithModel = true;
      } else if (!problem) {
        last.uncertainties.push(
          "Model phrasing dropped a required part of the approved reply, so the safer local reply was kept.",
        );
      } else {
        last.uncertainties.push(problem);
      }
    } catch (error) {
      if (error instanceof RequestGuardError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      last.uncertainties.push(publicAgentError(error));
    }
  }

  if (last && style && !phrasedWithModel && messageKind !== "greeting") {
    last.responseText = applyPresentationStyle(last.responseText, style, { kind: messageKind });
  }

  const saved: PersistedSession = {
    ...next,
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: new Date().toISOString(),
    ended: false,
    source: next.turns.some((turn) => turn.responseSource === "model") ? "live" : "simulated",
    customerId: session.customerId ?? null,
    agentStyle: session.agentStyle ?? null,
  };
  await saveSession(saved);

  const orderId = saved.verifiedOrderId ?? saved.selectedOrderId;
  const record = orderId ? getCaseByOrderId(orderId) : null;
  const customer = orderId ? getCustomerByOrderId(orderId) : null;
  const livePriority =
    record && customer
      ? assessPriority({
          record,
          customer,
          liveSentiment: saved.liveSentiment ?? undefined,
          liveIssueFocus: saved.liveIssueFocus ?? undefined,
          liveBoost: saved.livePriorityBoost,
        })
      : null;

  return NextResponse.json({
    sessionId: saved.id,
    turnId: last?.id ?? null,
    reply: last?.responseText ?? "",
    source: last?.responseSource ?? "template",
    simulated: last?.responseSource !== "model",
    language: last?.language ?? languageMode,
    pendingApproval: saved.pendingAction,
    ticket: last?.ticket ?? null,
    ticketId: saved.ticketId,
    ticketType: saved.ticketType,
    liveSentiment: saved.liveSentiment,
    liveIssueFocus: saved.liveIssueFocus,
    livePriority,
    agentStyle: saved.agentStyle ?? null,
    citations: (last?.citations ?? []).map((citation) => ({
      policyId: citation.policyId,
      version: citation.version,
    })),
    uncertainties: last?.uncertainties ?? [],
  });
}

async function newSession(body: Record<string, unknown>, defaults: AgentStyleSettings): Promise<PersistedSession> {
  const now = new Date().toISOString();
  const frozen = snapshotAgentSettings(defaults);
  return {
    ...createState({
      languageMode: frozen.languageMode,
      selectedOrderId: typeof body.orderId === "string" ? body.orderId : null,
      scenarioId: typeof body.scenarioId === "string" ? body.scenarioId : null,
    }),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ended: false,
    source: "simulated",
    customerId: typeof body.customerId === "string" ? body.customerId.trim().toUpperCase() : null,
    agentStyle: frozen,
  };
}

function parseStt(value: unknown): PersistedSession["turns"][number]["stt"] {
  if (!value || typeof value !== "object") return null;
  const stt = value as Record<string, unknown>;
  return {
    latencyMs: typeof stt.latencyMs === "number" ? stt.latencyMs : null,
    durationSeconds: typeof stt.durationSeconds === "number" ? stt.durationSeconds : null,
    format: typeof stt.format === "string" ? stt.format : null,
    detectedLanguages: Array.isArray(stt.detectedLanguages)
      ? stt.detectedLanguages.filter((item): item is string => typeof item === "string")
      : [],
  };
}
