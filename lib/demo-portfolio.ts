import "server-only";
import { POLICY_VERSION, RUBRIC_VERSION } from "./constants";
import { agentModel, transcriptionModel, ttsModel } from "./env";
import { listScenarios, runScenario, evaluateConversation, type ScenarioSpec } from "./evaluate";
import type { ConversationFeedback, EvalRun, PersistedSession } from "./types";

export type DemoPortfolio = {
  sessions: PersistedSession[];
  runs: EvalRun[];
  feedback: ConversationFeedback[];
  note: string;
};

const SENTIMENTS = ["frustrated", "escalating", "calm", "confused", "neutral"] as const;

/**
 * Build a portfolio sample from fixture scenarios so PM / Support dashboards
 * always have graphical metrics when no ended live chats exist yet
 * (common on fresh clones and ephemeral Vercel /tmp storage).
 */
export async function buildDemoPortfolio(): Promise<DemoPortfolio> {
  const scenarios = listScenarios();
  const sessions: PersistedSession[] = [];
  const runs: EvalRun[] = [];
  const feedback: ConversationFeedback[] = [];
  const now = Date.now();

  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index]!;
    const state = await runScenario(scenario);
    const evaluation = evaluateConversation(state, scenario, languageHint(scenario, index));
    const createdAt = new Date(now - (scenarios.length - index) * 36 * 60 * 60 * 1000).toISOString();
    const sessionId = `demo-${scenario.id.toLowerCase()}`;

    const turns = state.turns.map((turn, turnIndex) => {
      const stt = 420 + turnIndex * 40 + (index % 3) * 55;
      const retrieval = turn.retrievalMs || 80 + turnIndex * 10;
      const model = 680 + turnIndex * 90 + (index % 4) * 70;
      const tts = 900 + turnIndex * 120 + (index % 5) * 80;
      const total = stt + retrieval + model + tts;
      return {
        ...turn,
        latency: {
          stt,
          retrieval,
          model,
          tts,
          total,
        },
        usage: {
          inputTokens: 180 + turnIndex * 40 + index * 12,
          outputTokens: 90 + turnIndex * 25 + index * 8,
          audioSeconds: 4 + turnIndex * 1.2,
        },
        speech: {
          ...turn.speech,
          status: "generated" as const,
          voice: "alloy",
          latencyMs: tts,
          playback: "played" as const,
        },
      };
    });

    const session: PersistedSession = {
      ...state,
      turns,
      id: sessionId,
      createdAt,
      updatedAt: createdAt,
      ended: true,
      source: "live",
      customerId: state.verifiedOrderId ? `CUST-DEMO-${index + 1}` : null,
      liveSentiment: SENTIMENTS[index % SENTIMENTS.length] ?? "neutral",
      liveIssueFocus: scenario.issue ?? scenario.title,
    };
    sessions.push(session);

    const usage = turns.reduce(
      (sum, turn) => ({
        inputTokens: sum.inputTokens + (turn.usage.inputTokens ?? 0),
        outputTokens: sum.outputTokens + (turn.usage.outputTokens ?? 0),
        audioSeconds: sum.audioSeconds + (turn.usage.audioSeconds ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, audioSeconds: 0 },
    );
    const latencyMs = turns.reduce((sum, turn) => sum + (turn.latency.total ?? 0), 0);

    runs.push({
      id: `run-${sessionId}`,
      sessionId,
      scenarioId: scenario.id,
      source: "live",
      createdAt,
      policyVersion: POLICY_VERSION,
      rubricVersion: RUBRIC_VERSION,
      models: {
        agent: agentModel(),
        transcription: transcriptionModel(),
        tts: ttsModel(),
      },
      score: evaluation.score,
      originalScore: evaluation.originalScore,
      criteria: evaluation.criteria,
      failureStage: evaluation.failureStage,
      uncertainties: evaluation.uncertainties,
      humanNote: null,
      pronunciationNote: null,
      aiJudge: false,
      handoffOffered: evaluation.handoffOffered,
      latencyMs: latencyMs || null,
      usage,
    });

    feedback.push(feedbackFor(sessionId, scenario, index, createdAt));
  }

  return {
    sessions,
    runs,
    feedback,
    note: "Showing sample portfolio data from fixture scenarios so charts stay populated. End a live customer chat to replace this with measured results.",
  };
}

function languageHint(scenario: ScenarioSpec, index: number): { languageStatus: "pass" | "partial" | "fail"; note: string; source: "human" } | undefined {
  if (index % 5 === 4) {
    return {
      languageStatus: "partial",
      note: "Tone was helpful but pacing felt slightly rushed on the refund explanation.",
      source: "human",
    };
  }
  if (scenario.language === "hi" || scenario.languageMode === "hi") {
    return {
      languageStatus: "pass",
      note: "Hindi delivery was clear and empathetic.",
      source: "human",
    };
  }
  return {
    languageStatus: "pass",
    note: "Natural Care tone; intro and next-step clarity were good.",
    source: "human",
  };
}

function feedbackFor(
  sessionId: string,
  scenario: ScenarioSpec,
  index: number,
  createdAt: string,
): ConversationFeedback {
  const pattern = index % 4;
  if (pattern === 3) {
    return {
      id: `fb-${sessionId}`,
      sessionId,
      customerId: `CUST-DEMO-${index + 1}`,
      orderId: null,
      createdAt,
      updatedAt: createdAt,
      status: "skipped",
      satisfied: null,
      resolved: null,
      comment: null,
    };
  }
  return {
    id: `fb-${sessionId}`,
    sessionId,
    customerId: `CUST-DEMO-${index + 1}`,
    orderId: null,
    createdAt,
    updatedAt: createdAt,
    status: "submitted",
    satisfied: pattern === 2 ? "no" : "yes",
    resolved: pattern === 2 ? "no" : pattern === 1 ? "partly" : "yes",
    comment:
      pattern === 2
        ? `Still waiting on resolution for ${scenario.title}.`
        : `Helpful on ${scenario.issue || scenario.title}.`,
  };
}
