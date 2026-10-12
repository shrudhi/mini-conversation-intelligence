import { isOverallPass } from "./score";
import type { ConversationFeedback, EvalRun, PersistedSession } from "./types";

export type ObservabilitySummary = {
  conversationVolume: Array<{ date: string; conversations: number; tickets: number; handoffs: number }>;
  latencyTrend: Array<{ date: string; medianMs: number | null; averageMs: number | null; samples: number }>;
  latencyStages: { sttMs: number | null; retrievalMs: number | null; modelMs: number | null; ttsMs: number | null };
  languageMix: Array<{ key: string; label: string; count: number; share: number }>;
  sentimentMix: Array<{ key: string; label: string; count: number; share: number }>;
  ticketMix: Array<{ key: string; label: string; count: number; share: number }>;
  issueMix: Array<{ key: string; label: string; count: number; share: number }>;
  opsKpis: {
    conversations: number;
    endedConversations: number;
    ticketRate: number | null;
    autoTicketCount: number;
    handoffRate: number | null;
    avgHandleTimeMs: number | null;
    p95LatencyMs: number | null;
    escalatingShare: number | null;
  };
  agentScorecard: {
    agentName: string;
    role: string;
    evaluatedRuns: number;
    passRate: number | null;
    avgScore: number | null;
    csat: number | null;
    resolutionRate: number | null;
    needsReviewCount: number;
    languageReviewedCount: number;
  };
  qaQueue: Array<{
    sessionId: string;
    orderId: string | null;
    scenarioId: string | null;
    reason: string;
    priority: "high" | "medium" | "watch";
    updatedAt: string;
    score: number | null;
  }>;
  note: string;
};

const SENTIMENT_LABELS: Record<string, string> = {
  escalating: "Escalating",
  frustrated: "Frustrated",
  confused: "Confused",
  calm: "Calm",
  neutral: "Neutral",
  positive: "Positive",
};

const TICKET_LABELS: Record<string, string> = {
  payment_support: "Payment support",
  logistics: "Logistics / pickup",
  human_review: "Human review",
  none: "No ticket",
};

export function buildObservability(
  runs: EvalRun[],
  sessions: PersistedSession[],
  feedback: ConversationFeedback[],
): ObservabilitySummary {
  const liveSessions = sessions.filter((session) => session.source === "live");
  const liveRuns = runs.filter((run) => run.source === "live");
  const ended = liveSessions.filter((session) => session.ended);
  const feedbackBySession = new Map(feedback.map((item) => [item.sessionId, item]));

  const volumeMap = new Map<string, { conversations: number; tickets: number; handoffs: number }>();
  const latencyMap = new Map<string, number[]>();
  const languageCounts: Record<string, number> = { en: 0, hi: 0, hinglish: 0, uncertain: 0 };
  const sentimentCounts = new Map<string, number>();
  const ticketCounts = new Map<string, number>();
  const issueCounts = new Map<string, number>();

  let ticketed = 0;
  let handoffs = 0;
  let escalating = 0;
  const handleTimes: number[] = [];
  const allLatencies: number[] = [];
  const stageBuckets = { stt: [] as number[], retrieval: [] as number[], model: [] as number[], tts: [] as number[] };

  for (const session of liveSessions) {
    const date = session.updatedAt.slice(0, 10);
    const volume = volumeMap.get(date) ?? { conversations: 0, tickets: 0, handoffs: 0 };
    volume.conversations += 1;
    if (session.ticketId) {
      volume.tickets += 1;
      ticketed += 1;
    }
    const handoff = session.turns.some((turn) => turn.proposedAction === "human_review" || turn.ticket?.type === "human_review");
    if (handoff) {
      volume.handoffs += 1;
      handoffs += 1;
    }
    volumeMap.set(date, volume);

    const sentiment = (session.liveSentiment || "neutral").toLowerCase();
    sentimentCounts.set(sentiment, (sentimentCounts.get(sentiment) ?? 0) + 1);
    if (sentiment === "escalating" || sentiment === "frustrated") escalating += 1;

    const issue = session.liveIssueFocus || session.scenarioId || "general";
    issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);

    const ticketKey = session.ticketType || (session.ticketId ? "payment_support" : "none");
    ticketCounts.set(ticketKey, (ticketCounts.get(ticketKey) ?? 0) + 1);

    const turnLatencies: number[] = [];
    for (const turn of session.turns) {
      if (turn.language in languageCounts) languageCounts[turn.language] += 1;
      if (typeof turn.latency.total === "number") {
        turnLatencies.push(turn.latency.total);
        allLatencies.push(turn.latency.total);
      }
      if (typeof turn.latency.stt === "number") stageBuckets.stt.push(turn.latency.stt);
      if (typeof turn.latency.retrieval === "number") stageBuckets.retrieval.push(turn.latency.retrieval);
      if (typeof turn.latency.model === "number") stageBuckets.model.push(turn.latency.model);
      if (typeof turn.latency.tts === "number") stageBuckets.tts.push(turn.latency.tts);
    }
    if (turnLatencies.length) {
      const list = latencyMap.get(date) ?? [];
      list.push(...turnLatencies);
      latencyMap.set(date, list);
      handleTimes.push(turnLatencies.reduce((sum, value) => sum + value, 0));
    }
  }

  const submitted = ended
    .map((session) => feedbackBySession.get(session.id))
    .filter((item): item is ConversationFeedback => Boolean(item && item.status === "submitted"));
  const csatDenom = submitted.length;
  const csat = csatDenom ? submitted.filter((item) => item.satisfied === "yes").length / csatDenom : null;
  const resolutionRate = csatDenom ? submitted.filter((item) => item.resolved === "yes").length / csatDenom : null;

  const scored = liveRuns.filter((run) => run.score.headline !== null);
  const avgScore = scored.length
    ? scored.reduce((sum, run) => sum + (run.score.headline ?? 0), 0) / scored.length
    : null;
  const passCount = liveRuns.filter((run) => isOverallPass(run)).length;
  const needsReviewCount = liveRuns.filter(
    (run) => run.score.label === "needs_review" || run.score.label === "incomplete" || !isOverallPass(run),
  ).length;
  const languageReviewedCount = liveRuns.filter((run) =>
    run.criteria.some((item) => item.criterion === "language_quality" && item.source !== "deterministic"),
  ).length;

  const qaQueue = liveRuns
    .map((run) => {
      const session = liveSessions.find((item) => item.id === run.sessionId);
      if (!session) return null;
      const failed = run.criteria.find((item) => item.status === "fail");
      const languageGap = run.criteria.find(
        (item) => item.criterion === "language_quality" && item.status === "not_assessable",
      );
      if (!failed && !languageGap && isOverallPass(run)) return null;
      const reason = failed
        ? `${failed.criterion}: ${failed.rationale}`
        : languageGap
          ? "Language quality needs human or AI review"
          : run.score.reason || "Needs supervisor review";
      const priority: "high" | "medium" | "watch" =
        session.liveSentiment === "escalating" || failed?.criterion === "action_safety"
          ? "high"
          : failed
            ? "medium"
            : "watch";
      return {
        sessionId: session.id,
        orderId: session.verifiedOrderId ?? session.selectedOrderId,
        scenarioId: session.scenarioId,
        reason,
        priority,
        updatedAt: session.updatedAt,
        score: run.score.headline,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, watch: 2 };
      return rank[a.priority] - rank[b.priority] || b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, 12);

  const dates = [...new Set([...volumeMap.keys(), ...latencyMap.keys()])].sort();
  const conversationVolume = dates.map((date) => ({
    date,
    ...(volumeMap.get(date) ?? { conversations: 0, tickets: 0, handoffs: 0 }),
  }));
  const latencyTrend = dates.map((date) => {
    const samples = latencyMap.get(date) ?? [];
    return {
      date,
      medianMs: median(samples),
      averageMs: samples.length ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length) : null,
      samples: samples.length,
    };
  });

  const totalLang = Object.values(languageCounts).reduce((sum, value) => sum + value, 0) || 1;
  const languageMix = Object.entries(languageCounts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({
      key,
      label: key === "en" ? "English" : key === "hi" ? "Hindi" : key === "hinglish" ? "Hinglish" : "Uncertain",
      count,
      share: count / totalLang,
    }));

  return {
    conversationVolume,
    latencyTrend,
    latencyStages: {
      sttMs: avg(stageBuckets.stt),
      retrievalMs: avg(stageBuckets.retrieval),
      modelMs: avg(stageBuckets.model),
      ttsMs: avg(stageBuckets.tts),
    },
    languageMix,
    sentimentMix: toMix(sentimentCounts, SENTIMENT_LABELS),
    ticketMix: toMix(ticketCounts, TICKET_LABELS),
    issueMix: toMix(issueCounts, {}).slice(0, 6),
    opsKpis: {
      conversations: liveSessions.length,
      endedConversations: ended.length,
      ticketRate: liveSessions.length ? ticketed / liveSessions.length : null,
      autoTicketCount: ticketed,
      handoffRate: liveSessions.length ? handoffs / liveSessions.length : null,
      avgHandleTimeMs: avg(handleTimes),
      p95LatencyMs: percentile(allLatencies, 0.95),
      escalatingShare: liveSessions.length ? escalating / liveSessions.length : null,
    },
    agentScorecard: {
      agentName: "Priya",
      role: "VelaWear Voice Care",
      evaluatedRuns: liveRuns.length,
      passRate: liveRuns.length ? passCount / liveRuns.length : null,
      avgScore,
      csat,
      resolutionRate,
      needsReviewCount,
      languageReviewedCount,
    },
    qaQueue,
    note:
      liveRuns.length === 0
        ? "No measured conversations yet — observability fills once chats are ended and evaluated."
        : `Ops view covers ${liveSessions.length} live conversation${liveSessions.length === 1 ? "" : "s"} and ${liveRuns.length} scored run${liveRuns.length === 1 ? "" : "s"}.`,
  };
}

function toMix(counts: Map<string, number>, labels: Record<string, string>) {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      key,
      label: labels[key] ?? titleCase(key),
      count,
      share: count / total,
    }));
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? null;
}
