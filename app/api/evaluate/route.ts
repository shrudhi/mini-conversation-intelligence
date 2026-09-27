import { NextResponse } from "next/server";
import { POLICY_VERSION, RUBRIC_VERSION } from "@/lib/constants";
import { buildWorkspaceCard, getCustomerByOrderId } from "@/lib/customers";
import { agentModel, hasApiKey, transcriptionModel, ttsModel } from "@/lib/env";
import { publicJudgeError } from "@/lib/errors";
import {
  evaluateConversation,
  getScenario,
  simulatedPreviews,
  summarizeMeasured,
} from "@/lib/evaluate";
import {
  appendConversationHistory,
  buildHistoryEntry,
  feedbackDisplay,
  listFeedback,
  summarizeFeedback,
} from "@/lib/feedback";
import { judgeLanguage } from "@/lib/judge";
import { RequestGuardError, withAgentSlot } from "@/lib/limits";
import { resolveSession, listRuns, listSessions, saveRun, saveSession } from "@/lib/sessions";
import type { EvalRun, QaStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [sessions, runs, previews, feedback] = await Promise.all([
    listSessions(),
    listRuns(),
    simulatedPreviews(),
    listFeedback(),
  ]);
  const enrichedRuns = runs.map((run) => {
    const session = sessions.find((item) => item.id === run.sessionId);
    if (!session) return run;
    const language = run.criteria.find((item) => item.criterion === "language_quality");
    const human =
      language && language.source !== "deterministic"
        ? {
            languageStatus: language.status,
            note: run.humanNote ?? undefined,
            source: language.source as "human" | "ai_judge",
          }
        : undefined;
    const fresh = evaluateConversation(session, session.scenarioId ? getScenario(session.scenarioId) : null, human);
    return {
      ...run,
      criteria: fresh.criteria,
      score: fresh.score,
      originalScore: fresh.originalScore,
      failureStage: fresh.failureStage,
      uncertainties: fresh.uncertainties,
      handoffOffered: fresh.handoffOffered,
    };
  });
  const feedbackBySession = new Map(feedback.map((item) => [item.sessionId, item]));
  const conversationSnapshots = sessions
    .map((session) => {
      const savedRun = enrichedRuns.find((run) => run.sessionId === session.id) ?? null;
      const snapshot = evaluateConversation(
        session,
        session.scenarioId ? getScenario(session.scenarioId) : null,
      );
      const customerFeedback = feedbackBySession.get(session.id) ?? null;
      return {
        sessionId: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        source: session.source,
        ended: session.ended,
        evaluated: Boolean(savedRun),
        turnCount: session.turns.length,
        language: session.turns.at(-1)?.language ?? session.languageMode,
        orderId: session.verifiedOrderId ?? session.selectedOrderId,
        scenarioId: session.scenarioId,
        pendingAction: session.pendingAction,
        ticketId: session.ticketId,
        score: savedRun?.score ?? snapshot.score,
        criteria: savedRun?.criteria ?? snapshot.criteria,
        uncertainties: savedRun?.uncertainties ?? snapshot.uncertainties,
        failureStage: savedRun?.failureStage ?? snapshot.failureStage,
        feedback: customerFeedback,
        feedbackDisplay: feedbackDisplay(customerFeedback),
        agentStyle: session.agentStyle ?? null,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json({
    policyVersion: POLICY_VERSION,
    rubricVersion: RUBRIC_VERSION,
    models: { agent: agentModel(), transcription: transcriptionModel(), tts: ttsModel() },
    measured: summarizeMeasured(enrichedRuns, sessions),
    customerFeedback: summarizeFeedback(feedback, sessions),
    scenarios: previews.map((preview) => ({
      id: preview.scenario.id,
      title: preview.scenario.title,
      language: preview.scenario.language,
      paymentMethod: preview.scenario.paymentMethod,
      issue: preview.scenario.issue,
      caseState: preview.scenario.caseState,
      tags: preview.scenario.tags,
      expectedOutcome: preview.scenario.expectedOutcome,
      expectedPolicyIds: preview.scenario.expectedPolicyIds,
      allowedActions: preview.scenario.allowedActions,
      simulated: true,
      taskStatus: preview.evaluation.criteria.find((item) => item.criterion === "task_outcome")?.status ?? "not_assessable",
      failureStage: preview.evaluation.failureStage,
      recallAt3: preview.evaluation.recallAt3,
      score: preview.evaluation.score,
    })),
    runs: enrichedRuns,
    sessions,
    conversationSnapshots,
    previews: previews.map((preview) => ({
      scenarioId: preview.scenario.id,
      simulated: true,
      state: preview.state,
      evaluation: preview.evaluation,
    })),
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Evaluation request must be JSON." }, { status: 400 });
  }
  if (typeof body.sessionId !== "string") {
    return NextResponse.json({ error: "A conversation is required." }, { status: 400 });
  }
  const session = await resolveSession(body.sessionId, body.session);
  if (!session) return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
  if (session.turns.length === 0) {
    return NextResponse.json({ error: "There is nothing to evaluate yet." }, { status: 400 });
  }

  const scenario = session.scenarioId ? getScenario(session.scenarioId) : null;
  let languageStatus: QaStatus | undefined;
  let note: string | undefined;
  let source: "human" | "ai_judge" | undefined;
  let pronunciationNote: string | null = null;
  let aiJudge = false;
  const human = body.human;
  if (human && typeof human === "object") {
    const review = human as Record<string, unknown>;
    if (isStatus(review.languageStatus)) {
      languageStatus = review.languageStatus;
      source = "human";
    }
    if (typeof review.note === "string") note = review.note.slice(0, 500);
    if (typeof review.pronunciationNote === "string") pronunciationNote = review.pronunciationNote.slice(0, 400);
  }

  if (body.judge === true) {
    if (!hasApiKey()) {
      return NextResponse.json(
        { error: "Add OPENAI_API_KEY before running the AI judge. No judge request was sent." },
        { status: 400 },
      );
    }
    try {
      const judged = await withAgentSlot(() =>
        judgeLanguage(
          session.turns.flatMap((turn) => [
            { speaker: "Customer", text: turn.customerText },
            { speaker: "Agent", text: turn.responseText },
          ]),
        ),
      );
      if (!languageStatus) {
        languageStatus = judged.status;
        note = judged.rationale;
        source = "ai_judge";
        pronunciationNote = judged.pronunciationNote;
      }
      aiJudge = true;
    } catch (error) {
      if (error instanceof RequestGuardError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.json({ error: publicJudgeError(error) }, { status: 502 });
    }
  }

  if (typeof body.customerId === "string" && body.customerId.trim()) {
    session.customerId = body.customerId.trim().toUpperCase();
  }

  const evaluation = evaluateConversation(session, scenario, languageStatus ? { languageStatus, note, source } : undefined);
  const usage = session.turns.reduce(
    (sum, turn) => ({
      inputTokens: sum.inputTokens + (turn.usage.inputTokens ?? 0),
      outputTokens: sum.outputTokens + (turn.usage.outputTokens ?? 0),
      audioSeconds: sum.audioSeconds + (turn.usage.audioSeconds ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, audioSeconds: 0 },
  );
  const latency = session.turns.reduce((sum, turn) => sum + (turn.latency.total ?? 0), 0);
  const run: EvalRun = {
    id: `run-${session.id}`,
    sessionId: session.id,
    scenarioId: session.scenarioId,
    source: session.source,
    createdAt: new Date().toISOString(),
    policyVersion: POLICY_VERSION,
    rubricVersion: RUBRIC_VERSION,
    models: {
      agent: session.source === "live" ? agentModel() : null,
      transcription: session.turns.some((turn) => turn.stt) ? transcriptionModel() : null,
      tts: session.turns.some((turn) => turn.speech.status === "generated") ? ttsModel() : null,
    },
    score: evaluation.score,
    originalScore: evaluation.originalScore,
    criteria: evaluation.criteria,
    failureStage: evaluation.failureStage,
    uncertainties: evaluation.uncertainties,
    humanNote: source === "human" ? note ?? null : null,
    pronunciationNote,
    aiJudge,
    handoffOffered: evaluation.handoffOffered,
    latencyMs: latency || null,
    usage,
  };
  session.ended = true;
  session.updatedAt = run.createdAt;
  await saveSession(session);
  await saveRun(run);

  const orderId = session.verifiedOrderId ?? session.selectedOrderId;
  const customerId =
    session.customerId ??
    (typeof body.customerId === "string" ? body.customerId : null) ??
    (orderId ? getCustomerByOrderId(orderId)?.customerId ?? null : null);
  const card = orderId ? await buildWorkspaceCard(orderId) : null;
  if (customerId) {
    await appendConversationHistory(
      buildHistoryEntry(session, customerId, null, card?.priority.level ?? null),
    );
  }

  return NextResponse.json({
    run,
    simulated: run.source !== "live",
    ended: true,
    card: orderId ? await buildWorkspaceCard(orderId) : card,
    savedAt: session.updatedAt,
  });
}

function isStatus(value: unknown): value is QaStatus {
  return value === "pass" || value === "partial" || value === "fail" || value === "not_assessable" || value === "not_applicable";
}
