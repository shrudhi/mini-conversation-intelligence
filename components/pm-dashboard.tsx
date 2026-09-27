"use client";

import { useEffect, useMemo, useState } from "react";
import { formatSentimentLabel } from "@/lib/intent";

type Criterion = {
  criterion: string;
  status: string;
  weight: number;
  rationale: string;
  evidence: Array<{ label: string; quote: string }>;
  source: string;
};

type Score = {
  headline: number | null;
  label: string;
  coverage: number | null;
  reason: string;
  assessedWeight: number;
  applicableWeight: number;
};

type Turn = {
  id: string;
  customerText: string;
  originalTranscript: string | null;
  corrected: boolean;
  language: string;
  normalizedQuery: string;
  retrieved: Array<{ id: string; version: string; quote: string; score: number }>;
  tools: Array<{ name: string; available: boolean; reason: string | null; facts: Record<string, string | number | boolean | null> | null }>;
  responseText: string;
  responseSource: string;
  verified: boolean;
  disclosed: boolean;
  proposedAction: string | null;
  citations: Array<{ policyId: string; version: string; quote: string }>;
  uncertainties: string[];
  approval: { approved: boolean } | null;
  ticket: { ticketId: string; created: boolean; type: string } | null;
  speech: { status: string; voice: string | null; latencyMs: number | null; playback: string | null };
  latency: { stt: number | null; retrieval: number; model: number | null; tts: number | null; total: number | null };
  usage: { inputTokens: number | null; outputTokens: number | null; audioSeconds: number | null };
  stt: { latencyMs: number | null; detectedLanguages: string[] } | null;
};

type Run = {
  id: string;
  sessionId: string;
  scenarioId: string | null;
  source: "live" | "simulated";
  createdAt?: string;
  score: Score;
  originalScore: Score;
  criteria: Criterion[];
  failureStage: string | null;
  uncertainties: string[];
  humanNote: string | null;
  pronunciationNote: string | null;
  aiJudge: boolean;
  latencyMs: number | null;
  usage: { inputTokens: number; outputTokens: number; audioSeconds: number };
};

type ScenarioRow = {
  id: string;
  title: string;
  language: string;
  paymentMethod: string;
  issue: string;
  caseState: string;
  expectedOutcome: string;
  expectedPolicyIds: string[];
  simulated: boolean;
  taskStatus: string;
  failureStage: string | null;
  recallAt3: number | null;
  score: Score;
};

type Session = { id: string; source: "live" | "simulated"; scenarioId: string | null; turns: Turn[]; ended: boolean };

type ConversationSnapshot = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  source: "live" | "simulated";
  ended: boolean;
  evaluated: boolean;
  turnCount: number;
  language: string;
  orderId: string | null;
  scenarioId: string | null;
  pendingAction: string | null;
  ticketId: string | null;
  score: Score;
  criteria: Criterion[];
  uncertainties: string[];
  failureStage: string | null;
  feedback?: {
    status: "submitted" | "skipped";
    satisfied: "yes" | "no" | null;
    resolved: "yes" | "partly" | "no" | null;
    comment: string | null;
  } | null;
  feedbackDisplay?: FeedbackDisplay;
  agentStyle?: {
    tone: string;
    responseLength: string;
    empathyLevel: string;
    languageMode: string;
    voice: string;
  } | null;
  liveSentiment?: string | null;
  liveIssueFocus?: string | null;
};

type Measured = {
  runCount: number;
  draftCount: number;
  passRate: number | null;
  passCount: number;
  policyAccuracyRate: number | null;
  actionCorrectnessRate: number | null;
  policyErrorRate: number | null;
  unsupportedClaimRate: number | null;
  incorrectEscalationRate: number | null;
  humanHandoffRate: number | null;
  headlines: Array<number | null>;
  incompleteCount: number;
  needsReviewCount: number;
  latencyMs: number | null;
  medianLatencyMs: number | null;
  latencySamples: number;
  usage: { inputTokens: number; outputTokens: number; audioSeconds: number };
  byLanguage: { en: number; hi: number; hinglish: number; uncertain: number };
  scoreTrend: Array<{ date: string; averageScore: number | null; runCount: number }>;
  failuresByCategory: Array<{ date: string; policy: number; action_safety: number; identity: number; other: number }>;
  passTrend: Array<{ date: string; passRate: number | null; passCount: number; runCount: number }>;
  criterionHealth: Array<{
    criterion: string;
    label: string;
    weight: number;
    assessedCount: number;
    passCount: number;
    failCount: number;
    passRate: number | null;
    productSignal: string;
  }>;
  productDecisions: Array<{
    id: string;
    priority: "high" | "medium" | "watch";
    title: string;
    why: string;
    action: string;
    evidenceCount: number;
    relatedChats: Array<{
      sessionId: string;
      runId: string;
      orderId: string | null;
      scenarioId: string | null;
      label: string;
    }>;
  }>;
  needsAttention: Array<{
    key: string;
    label: string;
    bucket: string;
    count: number;
    shareOfFailures: number;
    runIds: string[];
  }>;
  failures: Array<{ runId: string; scenarioId: string | null; criterion: string; rationale: string }>;
  note: string;
  glossary?: Array<{ term: string; meaning: string; howCalculated: string }>;
};

type CustomerFeedbackSummary = {
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

type FeedbackDisplay = {
  label: string;
  satisfied: string;
  resolved: string;
  comment: string | null;
};

type Payload = {
  policyVersion: string;
  rubricVersion: string;
  models: { agent: string; transcription: string; tts: string };
  measured: Measured;
  customerFeedback: CustomerFeedbackSummary;
  scenarios: ScenarioRow[];
  runs: Run[];
  sessions: Session[];
  conversationSnapshots: ConversationSnapshot[];
};

const LABELS: Record<string, string> = {
  policy_accuracy: "Policy accuracy",
  case_grounding: "Case grounding",
  action_safety: "Action correctness",
  identity_privacy: "Identity and privacy",
  task_outcome: "Task completion",
  language_quality: "Language quality",
};

const GATE = new Set(["policy_accuracy", "case_grounding", "action_safety", "identity_privacy", "task_outcome"]);

type RowStatus = "pass" | "needs_review" | "in_progress" | "fail";

export function PmDashboard({ focusSession }: { focusSession: string | null }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"overview" | "detail">("overview");
  const [timeRange, setTimeRange] = useState("all");
  const [filterLanguage, setFilterLanguage] = useState("all");
  const [filterScenario, setFilterScenario] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [tableTab, setTableTab] = useState<"all" | "evaluated" | "draft">("all");
  const [conversationPage, setConversationPage] = useState(1);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(focusSession);
  const [note, setNote] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [languageStatus, setLanguageStatus] = useState("pass");

  async function load() {
    const response = await fetch("/api/evaluate");
    const payload = (await response.json()) as Payload & { error?: string };
    if (!response.ok) {
      setError(payload.error || "The dashboard could not be loaded.");
      return;
    }
    setData(payload);
    setSelectedSession((current) => current ?? focusSession ?? payload.conversationSnapshots[0]?.sessionId ?? null);
  }

  useEffect(() => {
    void load().catch(() => setError("The dashboard could not be loaded."));
  }, []);

  useEffect(() => {
    if (focusSession) {
      setSelectedSession(focusSession);
      setView("detail");
    }
  }, [focusSession]);

  const conversationRows = useMemo(() => {
    if (!data) return [];
    const cutoff = timeCutoff(timeRange);
    return data.conversationSnapshots
      .filter((item) => item.source === "live")
      .map((item) => {
        const run = data.runs.find((entry) => entry.sessionId === item.sessionId) ?? null;
        const status = rowStatus(item, run);
        const scenarioLabel = scenarioLabelFor(item, data.scenarios);
        return { snapshot: item, run, status, scenarioLabel };
      })
      .filter((row) => {
        if (cutoff && new Date(row.snapshot.updatedAt).getTime() < cutoff) return false;
        if (filterLanguage !== "all" && row.snapshot.language !== filterLanguage) return false;
        if (filterScenario !== "all" && row.scenarioLabel !== filterScenario) return false;
        if (filterStatus !== "all" && row.status !== filterStatus) return false;
        if (tableTab === "evaluated" && !row.snapshot.evaluated) return false;
        if (tableTab === "draft" && row.snapshot.evaluated) return false;
        return true;
      });
  }, [data, timeRange, filterLanguage, filterScenario, filterStatus, tableTab]);

  useEffect(() => {
    setConversationPage(1);
  }, [timeRange, filterLanguage, filterScenario, filterStatus, tableTab]);

  const CONVERSATION_PAGE_SIZE = 50;
  const conversationTotal = conversationRows.length;
  const conversationPageCount = Math.max(1, Math.ceil(conversationTotal / CONVERSATION_PAGE_SIZE));
  const pagedConversationRows = useMemo(() => {
    const page = Math.min(conversationPage, conversationPageCount);
    const start = (page - 1) * CONVERSATION_PAGE_SIZE;
    return conversationRows.slice(start, start + CONVERSATION_PAGE_SIZE);
  }, [conversationRows, conversationPage, conversationPageCount]);

  const filteredMeasured = useMemo(() => {
    if (!data) return null;
    const liveRuns = data.runs.filter((run) => run.source === "live");
    const cutoff = timeCutoff(timeRange);
    const matching = liveRuns.filter((run) => {
      const snapshot = data.conversationSnapshots.find((item) => item.sessionId === run.sessionId);
      if (!snapshot) return false;
      if (cutoff && new Date(run.createdAt ?? snapshot.updatedAt).getTime() < cutoff) return false;
      if (filterLanguage !== "all" && snapshot.language !== filterLanguage) return false;
      if (filterScenario !== "all" && scenarioLabelFor(snapshot, data.scenarios) !== filterScenario) return false;
      const status = rowStatus(snapshot, run);
      if (filterStatus !== "all" && status !== filterStatus) return false;
      return true;
    });
    if (
      matching.length === liveRuns.length &&
      timeRange === "all" &&
      filterLanguage === "all" &&
      filterScenario === "all" &&
      filterStatus === "all"
    ) {
      return data.measured;
    }
    return summarizeClient(matching, data.conversationSnapshots, data.measured.draftCount);
  }, [data, timeRange, filterLanguage, filterScenario, filterStatus]);

  const session = data?.sessions.find((item) => item.id === selectedSession) ?? null;
  const run = data?.runs.find((item) => item.sessionId === selectedSession) ?? null;
  const snapshot = data?.conversationSnapshots.find((item) => item.sessionId === selectedSession) ?? null;
  const measured = filteredMeasured ?? data?.measured;
  const selectedRow = conversationRows.find((row) => row.snapshot.sessionId === selectedSession) ?? conversationRows[0] ?? null;

  const scenarioOptions = useMemo(() => {
    const labels = (data?.conversationSnapshots ?? [])
      .filter((item) => item.source === "live")
      .map((item) => scenarioLabelFor(item, data?.scenarios ?? []));
    return ["all", ...unique(labels)];
  }, [data]);

  async function finishAndEvaluate() {
    if (!session) return;
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error || "The conversation could not be evaluated.");
      return;
    }
    await load();
  }

  async function saveReview() {
    if (!session) return;
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        human: { languageStatus, note, pronunciationNote: pronunciation },
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error || "The review was not saved.");
      return;
    }
    await load();
  }

  function openConversation(sessionId: string, scrollTo?: string) {
    setSelectedSession(sessionId);
    setView("detail");
    if (scrollTo) {
      window.setTimeout(() => {
        document.getElementById(`turn-${scrollTo}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }

  const evaluatedCount = conversationRows.filter((row) => row.snapshot.evaluated).length;
  const draftCount = conversationRows.filter((row) => !row.snapshot.evaluated).length;

  const enrichedDecisions = useMemo(() => {
    const list = measured?.productDecisions ?? [];
    if (!data) return list;
    const bySession = new Map(data.conversationSnapshots.map((item) => [item.sessionId, item]));
    return list.map((decision) => ({
      ...decision,
      relatedChats: (decision.relatedChats ?? []).map((chat) => {
        const snap = bySession.get(chat.sessionId);
        const orderId = chat.orderId ?? snap?.orderId ?? null;
        const scenarioLabel = snap ? scenarioLabelFor(snap, data.scenarios) : chat.scenarioId;
        return {
          ...chat,
          orderId,
          label: orderId || scenarioLabel || chat.label,
        };
      }),
    }));
  }, [measured, data]);

  const previewDecisions = enrichedDecisions.slice(0, 3);
  const activeDecision = enrichedDecisions.find((item) => item.id === activeDecisionId) ?? null;

  function openDecision(id: string) {
    setActiveDecisionId(id);
    setDecisionModalOpen(true);
  }

  function openDecisionChat(sessionId: string) {
    setDecisionModalOpen(false);
    openConversation(sessionId);
  }

  return (
    <div className="dashboard pm-dash">
      <div className="pm-head">
        <div>
          <h1 className="pm-title">Voice agent performance</h1>
          <p className="muted">Decision view: what to fix next. Hover the info icons for metric definitions.</p>
        </div>
        <div className="actions pm-tabs">
          <button className={view === "overview" ? "secondary" : "ghost"} onClick={() => setView("overview")}>
            Overview
          </button>
          <button className={view === "detail" ? "secondary" : "ghost"} onClick={() => setView("detail")}>
            Conversation detail
          </button>
        </div>
      </div>

      {error ? <div className="banner banner-danger">{error}</div> : null}
      {data ? (
        <p className="muted pm-meta">
          Policy {data.policyVersion} · Rubric {data.rubricVersion} · {data.models.agent} / {data.models.transcription} / {data.models.tts}
        </p>
      ) : null}

      {view === "overview" && data && measured ? (
        <>
          <div className="filters pm-filters">
            <Select
              label="Time range"
              value={timeRange}
              onChange={setTimeRange}
              options={[
                ["all", "All time"],
                ["7d", "Last 7 days"],
                ["30d", "Last 30 days"],
              ]}
            />
            <Select
              label="Language"
              value={filterLanguage}
              onChange={setFilterLanguage}
              options={[
                ["all", "All languages"],
                ["en", "English"],
                ["hi", "Hindi"],
                ["hinglish", "Hinglish"],
                ["uncertain", "Uncertain"],
              ]}
            />
            <Select
              label="Scenario"
              value={filterScenario}
              onChange={setFilterScenario}
              options={scenarioOptions.map((value) => [value, value === "all" ? "All scenarios" : value])}
            />
            <Select
              label="Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                ["all", "All statuses"],
                ["pass", "Pass"],
                ["needs_review", "Needs review"],
                ["in_progress", "In progress"],
                ["fail", "Fail"],
              ]}
            />
          </div>

          <div className="pm-kpi-row">
            <Kpi
              icon="doc"
              label="Evaluated runs"
              value={String(measured.runCount)}
              hint="Live scored conversations only"
              tip="Ended live sessions that produced an eval run. Drafts and fixture previews are excluded from measured rates."
            />
            <Kpi
              icon="chart"
              label="Overall pass rate"
              value={measured.passRate === null ? "—" : `${Math.round(measured.passRate * 100)}%`}
              hint={measured.passRate === null ? undefined : `${measured.passCount} of ${measured.runCount} passed`}
              tip="Product launch bar. Pass = published headline and no fail on gated criteria (policy, grounding, action, identity, task). A high score with a failed gate is still not a pass."
            />
            <Kpi
              icon="shield"
              label="Policy accuracy"
              value={pct(measured.policyAccuracyRate)}
              tip="% of assessed runs that passed policy accuracy. Gaps mean wrong quotes or bad retrieval."
            />
            <Kpi
              icon="gear"
              label="Action correctness"
              value={pct(measured.actionCorrectnessRate)}
              tip="% of assessed runs that passed action safety. Gaps mean unsafe tickets, duplicates, or missing approval."
            />
            <Kpi
              icon="bolt"
              label="Median response"
              value={measured.medianLatencyMs === null ? "—" : `${(measured.medianLatencyMs / 1000).toFixed(1)}s`}
              tip="Median end-to-end turn latency across measured sessions. Useful for voice UX, not quality."
            />
          </div>
          {data.customerFeedback ? (
            <div className="pm-kpi-row feedback-kpis">
              <Kpi
                icon="chart"
                label="Satisfaction rate"
                value={data.customerFeedback.satisfactionRate === null ? "—" : `${Math.round(data.customerFeedback.satisfactionRate * 100)}%`}
                hint={`${data.customerFeedback.satisfactionLabel} submitted`}
                tip="Customers who said they were satisfied ÷ submitted feedback forms."
              />
              <Kpi
                icon="doc"
                label="Feedback response rate"
                value={data.customerFeedback.responseRate === null ? "—" : `${Math.round(data.customerFeedback.responseRate * 100)}%`}
                hint={`${data.customerFeedback.responseLabel} ended`}
                tip="Submitted feedback ÷ ended conversations (skips count separately)."
              />
              <Kpi
                icon="shield"
                label="Customer-reported resolution"
                value={data.customerFeedback.resolutionRate === null ? "—" : `${Math.round(data.customerFeedback.resolutionRate * 100)}%`}
                hint={`${data.customerFeedback.resolutionLabel} yes · partly ${data.customerFeedback.resolutionPartlyCount} · no ${data.customerFeedback.resolutionNoCount}`}
                tip="Share of submitted feedback marked fully resolved (yes)."
              />
            </div>
          ) : null}
          <p className="muted pm-note">
            {measured.note}
            {measured.draftCount > 0 ? ` ${measured.draftCount} in-progress draft${measured.draftCount === 1 ? "" : "s"} stay out of measured rates.` : ""}
          </p>
          {data.customerFeedback ? <p className="muted pm-note">{data.customerFeedback.note}</p> : null}

          <div className="pm-mid pm-mid-decisions">
            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>
                  Rubric strength <InfoTip text="Pass share per criterion among assessed runs. Use the weakest high-weight bar to pick the next product fix." />
                </h2>
                <p>Where the agent is strong or weak — use this to pick the next product fix.</p>
              </div>
              <CriterionHealthChart rows={measured.criterionHealth ?? []} />
            </section>
            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>
                  Pass rate over time <InfoTip text="Share of measured runs that overall-pass each day — not average headline. Pass requires published score and no gated failures." />
                </h2>
                <p>Share of measured runs that overall-pass each day (not average headline).</p>
              </div>
              <PassTrendChart points={measured.passTrend ?? []} />
            </section>
            <section className="panel pm-attention">
              <div className="panel-head">
                <h2>
                  Recommended product decisions{" "}
                  <InfoTip text="Prioritized from weak criteria and recurring failure patterns. Open a decision to see linked chats that illustrate the issue." />
                </h2>
                <p>Top fixes with chat evidence. Expand for full detail.</p>
              </div>
              {previewDecisions.length === 0 ? (
                <p className="muted">Not enough measured failures to recommend a change yet.</p>
              ) : (
                <>
                  <ul className="pm-decision-list">
                    {previewDecisions.map((item) => (
                      <li key={item.id} className={`pm-decision pm-decision-${item.priority}`}>
                        <div className="pm-decision-head">
                          <span className="pm-priority">{item.priority}</span>
                          <strong>{item.title}</strong>
                        </div>
                        <p className="pm-decision-why">{item.why}</p>
                        <div className="pm-decision-meta">
                          <span>
                            {item.relatedChats?.length ?? 0} linked chat{(item.relatedChats?.length ?? 0) === 1 ? "" : "s"}
                          </span>
                          <button type="button" className="ghost pm-decision-open" onClick={() => openDecision(item.id)}>
                            View details
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {enrichedDecisions.length > 3 ? (
                    <button
                      type="button"
                      className="secondary pm-decision-more"
                      onClick={() => {
                        setActiveDecisionId(enrichedDecisions[0]?.id ?? null);
                        setDecisionModalOpen(true);
                      }}
                    >
                      View all {enrichedDecisions.length} decisions
                    </button>
                  ) : null}
                </>
              )}
            </section>
          </div>

          <div className="pm-bottom">
            <section className="panel pm-table-panel">
              <div className="panel-head">
                <h2>
                  Recent conversations{" "}
                  <InfoTip text="Live customer runs only. When there are more than 50, results are paginated (50 per page). Drafts stay separate from measured performance." />
                </h2>
                <p>
                  Live customer runs only.
                  {conversationTotal > CONVERSATION_PAGE_SIZE
                    ? ` Showing ${pagedConversationRows.length} of ${conversationTotal} (page ${Math.min(conversationPage, conversationPageCount)} of ${conversationPageCount}).`
                    : null}
                </p>
              </div>
              <div className="actions pm-table-tabs">
                <button className={tableTab === "all" ? "secondary" : "ghost"} onClick={() => setTableTab("all")}>
                  All runs ({conversationTotal})
                </button>
                <button className={tableTab === "evaluated" ? "secondary" : "ghost"} onClick={() => setTableTab("evaluated")}>
                  Evaluated ({evaluatedCount})
                </button>
                <button className={tableTab === "draft" ? "secondary" : "ghost"} onClick={() => setTableTab("draft")}>
                  In progress ({draftCount})
                </button>
              </div>
              {conversationTotal === 0 ? (
                <p>No live conversations match these filters.</p>
              ) : (
                <>
                  <div className="pm-table-wrap">
                    <table className="pm-table">
                      <thead>
                        <tr>
                          <th>Case ID</th>
                          <th>Language</th>
                          <th>Scenario</th>
                          <th>
                            Status{" "}
                            <InfoTip text="Pass = published headline and no gated criterion failed. Needs review = scored but not a pass. In progress = draft, not in measured rates." />
                          </th>
                          <th>
                            Score{" "}
                            <InfoTip text="Headline quality of assessed criteria (0–100). Hidden when assessed % is under 80% so thin chats cannot look like strong launches." />
                          </th>
                          <th>
                            Assessed %{" "}
                            <InfoTip text="Share of rubric weight that was graded — a trust gate for the score, not a second quality grade. ≥80% required to publish a score." />
                          </th>
                          <th>Issues</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedConversationRows.map((row) => {
                          const issues = row.snapshot.criteria.filter((item) => item.status === "fail").length;
                          const active = selectedRow?.snapshot.sessionId === row.snapshot.sessionId;
                          return (
                            <tr
                              key={row.snapshot.sessionId}
                              className={active ? "pm-row-active" : undefined}
                              onClick={() => setSelectedSession(row.snapshot.sessionId)}
                            >
                              <td>{row.snapshot.orderId || "—"}</td>
                              <td>{languageName(row.snapshot.language)}</td>
                              <td>{row.scenarioLabel}</td>
                              <td>
                                <StatusPill status={row.status} />
                              </td>
                              <td>{row.snapshot.score.headline === null ? "—" : `${row.snapshot.score.headline}/100`}</td>
                              <td>
                                {row.snapshot.score.coverage === null
                                  ? "—"
                                  : `${Math.round(row.snapshot.score.coverage * 100)}%`}
                              </td>
                              <td>{row.snapshot.evaluated ? issues : "—"}</td>
                              <td>{formatWhen(row.snapshot.updatedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {conversationPageCount > 1 ? (
                    <div className="pm-pager">
                      <button
                        type="button"
                        className="ghost"
                        disabled={conversationPage <= 1}
                        onClick={() => setConversationPage((page) => Math.max(1, page - 1))}
                      >
                        Previous
                      </button>
                      <span className="muted">
                        Page {Math.min(conversationPage, conversationPageCount)} of {conversationPageCount}
                      </span>
                      <button
                        type="button"
                        className="ghost"
                        disabled={conversationPage >= conversationPageCount}
                        onClick={() => setConversationPage((page) => Math.min(conversationPageCount, page + 1))}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>

            <aside className="panel pm-scorecard-panel">
              {selectedRow ? (
                <SelectedScorecard
                  snapshot={selectedRow.snapshot}
                  run={selectedRow.run}
                  status={selectedRow.status}
                  scenarioLabel={selectedRow.scenarioLabel}
                  onOpen={() => openConversation(selectedRow.snapshot.sessionId)}
                  onEvidence={(turnId) => openConversation(selectedRow.snapshot.sessionId, turnId)}
                />
              ) : (
                <>
                  <div className="panel-head">
                    <h2>Selected-run scorecard</h2>
                    <p>Select a conversation to inspect criterion points and evidence.</p>
                  </div>
                  <p className="muted">No live run selected.</p>
                </>
              )}
            </aside>
          </div>

          {decisionModalOpen ? (
            <DecisionModal
              decisions={enrichedDecisions}
              activeId={activeDecision?.id ?? enrichedDecisions[0]?.id ?? null}
              onSelect={setActiveDecisionId}
              onClose={() => setDecisionModalOpen(false)}
              onOpenChat={openDecisionChat}
            />
          ) : null}
        </>
      ) : null}

      {view === "detail" ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Conversation evaluation</h2>
            <p>Simple checks first; technical evidence is available underneath for explainability.</p>
          </div>
          <div className="actions">
            {(data?.conversationSnapshots ?? []).map((item, index) => (
              <button
                key={item.sessionId}
                className="ghost"
                onClick={() => {
                  setSelectedSession(item.sessionId);
                }}
              >
                {index === 0 ? "Latest" : item.orderId || "Conversation"} · {item.evaluated ? "Evaluated" : "In progress"}
              </button>
            ))}
          </div>
          {session && snapshot ? (
            <>
              <div className={snapshot.evaluated ? "banner banner-teal" : "banner banner-amber"}>
                <strong>{snapshot.evaluated ? "Evaluation saved" : "Draft checks—not included in measured performance"}</strong>
                <p>{nextAction(snapshot)}</p>
                {!snapshot.evaluated ? (
                  <button className="primary" onClick={() => void finishAndEvaluate()}>
                    Finish conversation & save evaluation
                  </button>
                ) : null}
              </div>
              {snapshot.agentStyle ? (
                <p className="muted pm-style-snap">
                  Style used for this chat: {snapshot.agentStyle.tone} · {snapshot.agentStyle.responseLength} · empathy{" "}
                  {snapshot.agentStyle.empathyLevel} · {snapshot.agentStyle.languageMode} · voice {snapshot.agentStyle.voice}
                </p>
              ) : null}
              {snapshot.liveSentiment || snapshot.liveIssueFocus ? (
                <p className="muted pm-style-snap">
                  Live customer tone: {formatSentimentLabel(snapshot.liveSentiment)}
                  {snapshot.liveIssueFocus ? ` · Focus: ${snapshot.liveIssueFocus.replaceAll("_", " ")}` : ""}
                </p>
              ) : null}
              <Trace
                turns={session.turns}
                simulated={session.source !== "live"}
                measured={snapshot.evaluated && session.source === "live"}
                score={run?.score ?? snapshot.score}
                criteria={run?.criteria ?? snapshot.criteria}
                uncertainties={run?.uncertainties ?? snapshot.uncertainties}
                overallPass={snapshot.evaluated ? isPass(snapshot, run) : false}
                feedbackDisplay={snapshot.feedbackDisplay}
                feedback={snapshot.feedback}
              />
            </>
          ) : (
            <p>Choose a live conversation to inspect.</p>
          )}
          {session && snapshot?.evaluated ? (
            <form
              className="review-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveReview();
              }}
            >
              <h3>Human review</h3>
              <p className="muted">This updates language quality and keeps the original score.</p>
              <label className="field">
                Language quality
                <select value={languageStatus} onChange={(event) => setLanguageStatus(event.target.value)}>
                  <option value="pass">pass</option>
                  <option value="partial">partial</option>
                  <option value="fail">fail</option>
                  <option value="not_assessable">not assessable</option>
                </select>
              </label>
              <label className="field">
                Reviewer note
                <textarea value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <label className="field">
                Pronunciation note
                <textarea value={pronunciation} onChange={(event) => setPronunciation(event.target.value)} />
              </label>
              <button className="secondary" type="submit">
                Save human review
              </button>
              {run?.aiJudge ? <p className="muted">An AI judge note is labeled separately from this human correction.</p> : null}
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function SelectedScorecard({
  snapshot,
  run,
  status,
  scenarioLabel,
  onOpen,
  onEvidence,
}: {
  snapshot: ConversationSnapshot;
  run: Run | null;
  status: RowStatus;
  scenarioLabel: string;
  onOpen: () => void;
  onEvidence: (turnId: string) => void;
}) {
  const score = run?.score ?? snapshot.score;
  const criteria = run?.criteria ?? snapshot.criteria;
  const failed = criteria.filter((item) => item.status === "fail");

  return (
    <div className="pm-selected">
      <div className="pm-selected-head">
        <div>
          <h2>{snapshot.orderId || snapshot.sessionId.slice(0, 8)}</h2>
          <StatusPill status={status} />
        </div>
        <p className="muted">
          {languageName(snapshot.language)} · {scenarioLabel} · {formatWhen(snapshot.updatedAt)} · {snapshot.turnCount} message
          {snapshot.turnCount === 1 ? "" : "s"}
          {snapshot.liveSentiment ? ` · Tone: ${formatSentimentLabel(snapshot.liveSentiment)}` : ""}
        </p>
        <div className="actions">
          <button className="secondary" type="button" onClick={onOpen}>
            Open conversation
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              const first = failed[0]?.evidence[0]?.label.match(/T\d+/)?.[0];
              onOpen();
              if (first) onEvidence(first);
            }}
          >
            View trace
          </button>
        </div>
      </div>

      {!snapshot.evaluated ? (
        <div className="banner banner-amber">
          <strong>In progress · draft checks only</strong>
          <p>Finish and evaluate before this conversation counts toward measured rates.</p>
        </div>
      ) : null}

      <div className="pm-score-summary">
        <div>
          <b>{score.headline === null ? "—" : score.headline}</b>
          <span>/100</span>
        </div>
        <div>
          <b>{score.coverage === null ? "—" : `${Math.round(score.coverage * 100)}%`}</b>
          <span>assessed %</span>
        </div>
      </div>

      <h3>Scorecard</h3>
      <div className="pm-bars">
        {criteria.map((item) => {
          const points = pointsDisplay(item.status, item.weight);
          return (
            <div key={item.criterion} className="pm-bar-row">
              <div className="pm-bar-label">
                <span>
                  {LABELS[item.criterion] || item.criterion} ({item.weight})
                </span>
                <span>
                  {points.assessed ? `${points.earned}/${points.weight}` : item.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="pm-bar-track">
                <div
                  className={`pm-bar-fill ${item.status === "fail" ? "fail" : item.status === "pass" || item.status === "partial" ? "ok" : "muted"}`}
                  style={{ width: `${points.assessed ? Math.max(4, (points.earned / points.weight) * 100) : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {failed.length > 0 ? (
        <>
          <h3>Why this failed</h3>
          <div className="pm-why">
            {failed.flatMap((item) =>
              item.evidence.map((evidence) => {
                const turnId = evidence.label.match(/T\d+/)?.[0];
                return (
                  <button
                    key={`${item.criterion}-${evidence.label}`}
                    type="button"
                    className="pm-evidence-link"
                    onClick={() => (turnId ? onEvidence(turnId) : onOpen())}
                  >
                    <strong>{evidence.label}</strong>
                    <span>{evidence.quote}</span>
                    <small>
                      {LABELS[item.criterion] || item.criterion}: {item.rationale}
                    </small>
                  </button>
                );
              }),
            )}
          </div>
        </>
      ) : snapshot.evaluated ? (
        <p className="muted">No failed criteria on this measured run.</p>
      ) : null}

      <CustomerFeedbackPanel display={snapshot.feedbackDisplay} feedback={snapshot.feedback} />
    </div>
  );
}

function Trace({
  turns,
  simulated,
  measured = false,
  score,
  criteria,
  uncertainties,
  overallPass,
  feedbackDisplay,
  feedback,
}: {
  turns: Turn[];
  simulated: boolean;
  measured?: boolean;
  score?: Score;
  criteria?: Criterion[];
  uncertainties?: string[];
  overallPass?: boolean;
  feedbackDisplay?: FeedbackDisplay;
  feedback?: ConversationSnapshot["feedback"];
}) {
  return (
    <div>
      <h3>Overall result</h3>
      <p>
        {simulated ? (
          <span className="pill">Simulated</span>
        ) : measured ? (
          overallPass ? (
            <span className="pill pill-pass">Measured · Pass</span>
          ) : (
            <span className="pill pill-partial">Measured · Needs review</span>
          )
        ) : (
          <span className="pill pill-partial">Live · draft</span>
        )}{" "}
        {score ? <ScoreLine score={score} /> : null}
      </p>
      <p className="muted">
        The score uses only checks that can actually be assessed. An incorrect escalation or privacy fail cannot count as an overall pass.
      </p>
      {criteria ? (
        <Scorecard
          criteria={criteria}
          onJump={(turnId) => document.getElementById(`turn-${turnId}`)?.scrollIntoView({ behavior: "smooth" })}
        />
      ) : null}
      <CustomerFeedbackPanel display={feedbackDisplay} feedback={feedback} />
      {uncertainties && uncertainties.length > 0 ? <p>Uncertainty: {uncertainties.join(" ")}</p> : null}
      <h3>Message-by-message checks</h3>
      {turns.map((turn) => (
        <article key={turn.id} id={`turn-${turn.id}`} className="trace">
          <h3>
            Message {turn.id.replace("T", "")} · {languageName(turn.language)}
          </h3>
          <p>
            <strong>Customer</strong> {turn.customerText}
          </p>
          {turn.corrected && turn.originalTranscript ? <p className="muted">Original transcript: {turn.originalTranscript}</p> : null}
          <p>
            <strong>Agent</strong> {turn.responseText}
          </p>
          <TurnChecks turn={turn} />
          {turn.approval ? <p>Approval recorded.</p> : null}
          {turn.ticket ? (
            <p>
              Mock ticket {turn.ticket.ticketId} ({turn.ticket.type}) {turn.ticket.created ? "created" : "already existed"}.
            </p>
          ) : null}
          {turn.uncertainties.length > 0 ? <p>Uncertainty: {turn.uncertainties.join(" ")}</p> : null}
          <details>
            <summary>Show technical evidence</summary>
            <p className="search-query">
              <strong>English policy-search query</strong> {turn.normalizedQuery}
            </p>
            <p className="muted">Retrieved {turn.retrieved.map((policy) => policy.id).join(", ") || "nothing"}.</p>
            {turn.retrieved.map((policy) => (
              <blockquote key={policy.id} className="quote">
                {policy.id} {policy.version}: {policy.quote}
              </blockquote>
            ))}
            {turn.tools.map((tool) => (
              <p key={tool.name} className="mono">
                {tool.name}: {tool.available ? JSON.stringify(tool.facts) : tool.reason}
              </p>
            ))}
            <p className="muted">
              Reply {turn.responseSource}. Citations {turn.citations.map((citation) => `${citation.policyId} ${citation.version}`).join(", ") || "none"}.
            </p>
            <p className="muted">
              Latency: speech-to-text {turn.latency.stt ?? "—"} ms · policy search {turn.latency.retrieval} ms · reply {turn.latency.model ?? "—"} ms · voice{" "}
              {turn.latency.tts ?? "—"} ms · total {turn.latency.total ?? "—"} ms. Usage: {turn.usage.inputTokens ?? "—"} input tokens,{" "}
              {turn.usage.outputTokens ?? "—"} output tokens.
            </p>
          </details>
        </article>
      ))}
    </div>
  );
}

function TurnChecks({ turn }: { turn: Turn }) {
  const citationIds = new Set(turn.retrieved.map((policy) => policy.id));
  const citationsValid = turn.citations.every((citation) => citationIds.has(citation.policyId));
  const toolsAvailable = turn.tools.filter((tool) => tool.available).length;
  const action = turn.ticket
    ? {
        label: turn.approval?.approved ? "Pass" : "Fail",
        tone: turn.approval?.approved ? "pass" : "fail",
        detail: turn.approval?.approved
          ? `Ticket ${turn.ticket.ticketId} was created after approval.`
          : "A ticket appears without recorded approval.",
      }
    : turn.proposedAction
      ? { label: "Waiting", tone: "partial", detail: "The agent proposed an action and is waiting for customer approval." }
      : { label: "Pass", tone: "pass", detail: "No unsupported action was taken." };

  const voice =
    turn.speech.status === "generated" && turn.speech.playback === "played"
      ? { label: "Pass", tone: "pass", detail: "The AI voice was generated and played." }
      : turn.speech.status === "error"
        ? { label: "Fail", tone: "fail", detail: "Voice generation or playback failed." }
        : { label: "Not complete", tone: "partial", detail: `Voice status: ${turn.speech.status.replaceAll("_", " ")}.` };

  const checks = [
    {
      title: "Speech understood",
      label: turn.stt ? (turn.corrected ? "Corrected" : "Captured") : "Typed",
      tone: turn.corrected ? "pass" : "partial",
      detail: turn.stt
        ? turn.corrected
          ? "The customer corrected the transcript before sending."
          : "The transcript was sent without correction. Accuracy needs a human reference to score."
        : "The customer typed this message, so speech recognition was not used.",
    },
    {
      title: "Privacy",
      label: "Pass",
      tone: "pass",
      detail: turn.disclosed
        ? "Order details were shared for the signed-in customer profile."
        : "No private order details were revealed in this message.",
    },
    {
      title: "Policy evidence",
      label: turn.citations.length === 0 ? "Not needed" : citationsValid ? "Pass" : "Review",
      tone: turn.citations.length === 0 ? "partial" : citationsValid ? "pass" : "fail",
      detail:
        turn.citations.length === 0
          ? "This reply did not rely on a policy citation."
          : citationsValid
            ? `The reply is backed by ${turn.citations.map((item) => item.policyId).join(", ")}.`
            : "A cited policy was not found in the retrieved evidence.",
    },
    {
      title: "Verified case facts",
      label: turn.disclosed ? (toolsAvailable === 3 ? "Pass" : "Review") : "Not applicable",
      tone: turn.disclosed && toolsAvailable < 3 ? "fail" : turn.disclosed ? "pass" : "partial",
      detail: turn.disclosed
        ? `${toolsAvailable} of 3 order, return, and refund lookups supplied the facts.`
        : "No order facts were disclosed, so case grounding was not needed.",
    },
    { title: "Action safety", ...action },
    { title: "Voice reply", ...voice },
  ];

  return (
    <div className="turn-checks">
      {checks.map((check) => (
        <div className="turn-check" key={check.title}>
          <div className="qa-top">
            <strong>{check.title}</strong>
            <span className={`pill pill-${check.tone}`}>{check.label}</span>
          </div>
          <small>{check.detail}</small>
        </div>
      ))}
    </div>
  );
}

function Scorecard({ criteria, onJump }: { criteria: Criterion[]; onJump?: (turnId: string) => void }) {
  return (
    <div>
      {criteria.map((item) => (
        <article key={item.criterion} className="qa">
          <div className="qa-top">
            <h3>
              {LABELS[item.criterion] || item.criterion} · {item.weight}
            </h3>
            <span className={`pill pill-${item.status}`}>{item.status}</span>
          </div>
          <p>
            <strong>Why:</strong> {item.rationale}
          </p>
          <p className="muted">
            Source: {item.source === "ai_judge" ? "AI judge" : item.source === "human" ? "Human review" : "Deterministic check"}
          </p>
          {item.evidence.map((evidence) => {
            const turnId = evidence.label.match(/T\d+/)?.[0];
            return (
              <blockquote key={evidence.label} className="quote">
                {onJump && turnId ? (
                  <button type="button" className="linkish" onClick={() => onJump(turnId)}>
                    {evidence.label}
                  </button>
                ) : (
                  <strong>{evidence.label}</strong>
                )}
                : {evidence.quote}
              </blockquote>
            );
          })}
        </article>
      ))}
    </div>
  );
}

function CustomerFeedbackPanel({
  display,
  feedback,
}: {
  display?: FeedbackDisplay;
  feedback?: ConversationSnapshot["feedback"];
}) {
  const view =
    display ??
    (feedback?.status === "submitted"
      ? {
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
        }
      : { label: "No feedback", satisfied: "No feedback", resolved: "No feedback", comment: null });

  return (
    <section className="customer-feedback-panel">
      <h3>Customer feedback</h3>
      <p className="muted">Survey answers stay separate from the agent evaluation score and evidence.</p>
      <div className="meta-grid">
        <div>
          <strong>Satisfied</strong>
          {view.satisfied}
        </div>
        <div>
          <strong>Issue resolved</strong>
          {view.resolved}
        </div>
        <div>
          <strong>Survey status</strong>
          {view.label === "Skipped" ? "No feedback" : view.label}
        </div>
      </div>
      {view.comment ? (
        <blockquote className="quote">
          <strong>Comment</strong> {view.comment}
        </blockquote>
      ) : (
        <p className="muted">No optional comment.</p>
      )}
    </section>
  );
}

function ScoreLine({ score }: { score: Score }) {
  if (score.label === "incomplete") {
    return (
      <span>
        Incomplete: only {Math.round((score.coverage ?? 0) * 100)}% of rubric weight was assessable (need ≥80% to publish a
        headline).
      </span>
    );
  }
  if (score.label === "needs_review") return <span>Needs review. {score.reason}</span>;
  if (score.headline === null) return <span>{score.reason || "No headline score."}</span>;
  return (
    <span>
      Headline {score.headline}/100 · assessed {Math.round((score.coverage ?? 0) * 100)}% of rubric (
      {score.assessedWeight}/{score.applicableWeight} pts graded)
    </span>
  );
}

function StatusPill({ status }: { status: RowStatus }) {
  const label = status === "needs_review" ? "Needs review" : status === "in_progress" ? "In progress" : status === "pass" ? "Pass" : "Fail";
  const tone = status === "pass" ? "pass" : status === "in_progress" ? "partial" : status === "needs_review" ? "partial" : "fail";
  return <span className={`pill pill-${tone}`}>{label}</span>;
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="pm-info-tip">
      <button type="button" className="pm-info-btn" aria-label="More information" title={text}>
        i
      </button>
      <span className="pm-info-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tip,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  tip?: string;
}) {
  return (
    <div className={`pm-kpi pm-kpi-${icon}`}>
      <span className="pm-kpi-icon" aria-hidden />
      <div>
        <b>{value}</b>
        {hint ? <small>{hint}</small> : null}
        <span className="pm-kpi-label">
          {label}
          {tip ? <InfoTip text={tip} /> : null}
        </span>
      </div>
    </div>
  );
}

type DecisionItem = NonNullable<Measured["productDecisions"]>[number];

function DecisionModal({
  decisions,
  activeId,
  onSelect,
  onClose,
  onOpenChat,
}: {
  decisions: DecisionItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onOpenChat: (sessionId: string) => void;
}) {
  const active = decisions.find((item) => item.id === activeId) ?? decisions[0] ?? null;
  if (!active) return null;
  return (
    <div className="pm-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-decision-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pm-modal-head">
          <div>
            <p className="muted">Product decisions</p>
            <h2 id="pm-decision-title">Recommended changes</h2>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pm-modal-body">
          <aside className="pm-modal-nav">
            <ul>
              {decisions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.id === active.id ? "pm-modal-nav-active" : undefined}
                    onClick={() => onSelect(item.id)}
                  >
                    <span className={`pm-priority pm-priority-${item.priority}`}>{item.priority}</span>
                    <strong>{item.title}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="pm-modal-detail">
            <span className={`pm-priority pm-priority-${active.priority}`}>{active.priority}</span>
            <h3>{active.title}</h3>
            <p>{active.why}</p>
            <p className="pm-decision-action">{active.action}</p>
            <h4>
              Related chats{" "}
              <InfoTip text="Live conversations that illustrate this decision. Open one to inspect turns, evidence, and scorecard." />
            </h4>
            {(active.relatedChats ?? []).length === 0 ? (
              <p className="muted">No linked chats for this recommendation yet.</p>
            ) : (
              <ul className="pm-related-chats">
                {(active.relatedChats ?? []).map((chat) => (
                  <li key={chat.runId}>
                    <button type="button" className="ghost" onClick={() => onOpenChat(chat.sessionId)}>
                      <strong>{chat.orderId || chat.label}</strong>
                      <span>{chat.scenarioId || chat.sessionId.slice(0, 8)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CriterionHealthChart({ rows }: { rows: NonNullable<Measured["criterionHealth"]> }) {
  if (rows.length === 0) return <p className="muted">No assessed criteria in this filter yet.</p>;
  return (
    <div className="pm-health">
      {rows.map((row) => {
        const pctValue = row.passRate === null ? 0 : Math.round(row.passRate * 100);
        const tone = row.passRate === null ? "muted" : pctValue >= 90 ? "ok" : pctValue >= 70 ? "warn" : "fail";
        return (
          <div key={row.criterion} className="pm-health-row" title={row.productSignal}>
            <div className="pm-health-label">
              <strong>{row.label}</strong>
              <span>
                {row.passRate === null ? "Not assessed" : `${pctValue}% pass`} · {row.weight} pts · {row.assessedCount} run
                {row.assessedCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="pm-health-track">
              <div className={`pm-health-fill ${tone}`} style={{ width: `${row.passRate === null ? 0 : pctValue}%` }} />
            </div>
            <p className="pm-health-signal">{row.productSignal}</p>
          </div>
        );
      })}
    </div>
  );
}

function PassTrendChart({ points }: { points: NonNullable<Measured["passTrend"]> }) {
  if (points.length === 0) return <p className="muted">No measured runs in this filter.</p>;
  const width = 320;
  const height = 140;
  const pad = 16;
  const coords = points.map((point, index) => {
    const x = pad + (points.length === 1 ? (width - pad * 2) / 2 : (index / (points.length - 1)) * (width - pad * 2));
    const rate = point.passRate ?? 0;
    const y = height - pad - rate * (height - pad * 2);
    return { ...point, x, y };
  });
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  return (
    <div className="pm-svg-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="pm-svg" role="img" aria-label="Pass rate trend">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="pm-axis" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="pm-axis" />
        <path d={path} className="pm-line" fill="none" />
        {coords.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r={3.5} className="pm-dot">
            <title>
              {point.date}: {point.passCount}/{point.runCount} pass (
              {point.passRate === null ? "—" : `${Math.round(point.passRate * 100)}%`})
            </title>
          </circle>
        ))}
      </svg>
      <div className="pm-chart-labels">
        {points.map((point) => (
          <span key={point.date}>{shortDate(point.date)}</span>
        ))}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | [string, string]>;
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const [val, text] = typeof option === "string" ? [option, option] : option;
          return (
            <option key={val} value={val}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function nextAction(snapshot: ConversationSnapshot): string {
  if (snapshot.pendingAction) return "Next: ask the customer to approve or decline the proposed support action.";
  if (!snapshot.evaluated) return "Next: finish and evaluate this conversation to save its result.";
  const failed = snapshot.criteria.find((item) => item.status === "fail");
  if (failed) return `Next: review ${LABELS[failed.criterion] || failed.criterion.toLowerCase()} — ${failed.rationale}`;
  const unassessed = snapshot.criteria.find((item) => item.status === "not_assessable");
  if (unassessed) return `Next: add evidence or a human review for ${LABELS[unassessed.criterion] || unassessed.criterion.toLowerCase()}.`;
  return "Next: this run is ready to use as evaluated demo evidence.";
}

function languageName(value: string): string {
  if (value === "en") return "English";
  if (value === "hi") return "Hindi";
  if (value === "hinglish") return "Hinglish";
  return "Language uncertain";
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function timeCutoff(range: string): number | null {
  if (range === "7d") return Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (range === "30d") return Date.now() - 30 * 24 * 60 * 60 * 1000;
  return null;
}

function scenarioLabelFor(snapshot: ConversationSnapshot, scenarios: ScenarioRow[]): string {
  if (snapshot.scenarioId) {
    return scenarios.find((item) => item.id === snapshot.scenarioId)?.title ?? snapshot.scenarioId;
  }
  const issue = snapshot.criteria.find((item) => item.criterion === "task_outcome")?.rationale;
  if (snapshot.orderId?.startsWith("VW-1002") || /refund|payment/i.test(issue || "")) return "Returns";
  if (snapshot.pendingAction === "logistics") return "Pickup";
  if (snapshot.pendingAction === "human_review") return "Human review";
  return snapshot.orderId ? "Order support" : "General";
}

function rowStatus(snapshot: ConversationSnapshot, run: Run | null): RowStatus {
  if (!snapshot.evaluated) return "in_progress";
  if (isPass(snapshot, run)) return "pass";
  if (snapshot.score.label === "incomplete") return "needs_review";
  if (snapshot.criteria.some((item) => item.status === "fail")) return "needs_review";
  if (snapshot.score.label === "needs_review") return "needs_review";
  return "fail";
}

function isPass(snapshot: ConversationSnapshot, run: Run | null): boolean {
  const score = run?.score ?? snapshot.score;
  const criteria = run?.criteria ?? snapshot.criteria;
  if (score.label !== "score" || score.headline === null) return false;
  return !criteria.some((item) => GATE.has(item.criterion) && item.status === "fail");
}

function pointsDisplay(status: string, weight: number): { earned: number; weight: number; assessed: boolean } {
  if (status === "not_applicable") return { earned: 0, weight: 0, assessed: false };
  if (status === "not_assessable") return { earned: 0, weight, assessed: false };
  const factor = status === "pass" ? 1 : status === "partial" ? 0.5 : 0;
  return { earned: weight * factor, weight, assessed: true };
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function shortDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(5);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function summarizeClient(runs: Run[], snapshots: ConversationSnapshot[], draftCount: number): Measured {
  const statusOf = (run: Run, id: string) => run.criteria.find((item) => item.criterion === id)?.status;
  const passCount = runs.filter((run) => {
    const snapshot = snapshots.find((item) => item.sessionId === run.sessionId);
    return snapshot ? isPass(snapshot, run) : false;
  }).length;
  const accuracy = (id: string) => {
    const assessed = runs.filter((run) => {
      const status = statusOf(run, id);
      return status === "pass" || status === "partial" || status === "fail";
    });
    if (assessed.length === 0) return null;
    return assessed.filter((run) => statusOf(run, id) === "pass").length / assessed.length;
  };
  const rate = (id: string) => (runs.length ? runs.filter((run) => statusOf(run, id) === "fail").length / runs.length : null);
  const byDay = new Map<string, number[]>();
  for (const run of runs) {
    const date = (run.createdAt ?? snapshots.find((item) => item.sessionId === run.sessionId)?.updatedAt ?? "").slice(0, 10);
    if (!date) continue;
    const list = byDay.get(date) ?? [];
    if (run.score.headline !== null) list.push(run.score.headline);
    byDay.set(date, list);
  }
  const scoreTrend = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      averageScore: scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10 : null,
      runCount: scores.length,
    }));
  const failDays = new Map<string, { policy: number; action_safety: number; identity: number; other: number }>();
  for (const run of runs) {
    const date = (run.createdAt ?? "").slice(0, 10) || "unknown";
    const bucket = failDays.get(date) ?? { policy: 0, action_safety: 0, identity: 0, other: 0 };
    for (const item of run.criteria.filter((criterion) => criterion.status === "fail")) {
      if (item.criterion === "policy_accuracy") bucket.policy += 1;
      else if (item.criterion === "action_safety") bucket.action_safety += 1;
      else if (item.criterion === "identity_privacy") bucket.identity += 1;
      else bucket.other += 1;
    }
    failDays.set(date, bucket);
  }
  const criterionOrder = [
    ["policy_accuracy", "Policy accuracy", 25, "Wrong policy quotes confuse shoppers — fix retrieval and citations."],
    ["case_grounding", "Case grounding", 20, "Invented dates or amounts break trust — ground every fact in the case record."],
    ["action_safety", "Action correctness", 20, "Unsafe tickets create ops load — tighten eligibility and approval."],
    ["identity_privacy", "Identity and privacy", 15, "Cross-customer leaks are ship blockers — never answer another profile."],
    ["task_outcome", "Task completion", 10, "Missed asks drive repeat contacts — answer the latest question first."],
    ["language_quality", "Language quality", 10, "Hard-to-follow replies raise handle time — keep voice answers short."],
  ] as const;
  const criterionHealth = criterionOrder.map(([criterion, label, weight, productSignal]) => {
    const assessed = runs.filter((run) => {
      const status = statusOf(run, criterion);
      return status === "pass" || status === "partial" || status === "fail";
    });
    const passN = assessed.filter((run) => statusOf(run, criterion) === "pass").length;
    const failN = assessed.filter((run) => statusOf(run, criterion) === "fail").length;
    return {
      criterion,
      label,
      weight,
      assessedCount: assessed.length,
      passCount: passN,
      failCount: failN,
      passRate: assessed.length ? passN / assessed.length : null,
      productSignal,
    };
  });
  const passTrend = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date]) => {
      const dayRuns = runs.filter((run) => (run.createdAt ?? "").slice(0, 10) === date);
      const dayPass = dayRuns.filter((run) => {
        const snapshot = snapshots.find((item) => item.sessionId === run.sessionId);
        return snapshot ? isPass(snapshot, run) : false;
      }).length;
      return {
        date,
        passCount: dayPass,
        runCount: dayRuns.length,
        passRate: dayRuns.length ? dayPass / dayRuns.length : null,
      };
    });
  const productDecisions = criterionHealth
    .filter((item) => item.failCount > 0 || (item.passRate !== null && item.passRate < 0.9))
    .sort((a, b) => (a.passRate ?? 1) - (b.passRate ?? 1))
    .slice(0, 8)
    .map((item) => {
      const related = runs
        .filter((run) => statusOf(run, item.criterion) === "fail")
        .slice(0, 8)
        .map((run) => {
          const snap = snapshots.find((entry) => entry.sessionId === run.sessionId);
          return {
            sessionId: run.sessionId,
            runId: run.id,
            orderId: snap?.orderId ?? null,
            scenarioId: run.scenarioId,
            label: snap?.orderId || run.scenarioId || run.sessionId.slice(0, 8),
          };
        });
      return {
        id: `criterion-${item.criterion}`,
        priority: ((item.passRate ?? 1) < 0.7 ? "high" : (item.passRate ?? 1) < 0.85 ? "medium" : "watch") as
          | "high"
          | "medium"
          | "watch",
        title: `Strengthen ${item.label.toLowerCase()}`,
        why: `${item.failCount} fail${item.failCount === 1 ? "" : "s"} across ${item.assessedCount} assessed run${item.assessedCount === 1 ? "" : "s"}.`,
        action: item.productSignal,
        evidenceCount: item.failCount || item.assessedCount,
        relatedChats: related,
      };
    });

  return {
    runCount: runs.length,
    draftCount,
    passRate: runs.length ? passCount / runs.length : null,
    passCount,
    policyAccuracyRate: accuracy("policy_accuracy"),
    actionCorrectnessRate: accuracy("action_safety"),
    policyErrorRate: rate("policy_accuracy"),
    unsupportedClaimRate: rate("case_grounding"),
    incorrectEscalationRate: rate("action_safety"),
    humanHandoffRate: null,
    headlines: runs.map((run) => run.score.headline),
    incompleteCount: runs.filter((run) => run.score.label === "incomplete").length,
    needsReviewCount: runs.filter((run) => {
      const snapshot = snapshots.find((item) => item.sessionId === run.sessionId);
      return snapshot ? !isPass(snapshot, run) : true;
    }).length,
    latencyMs: null,
    medianLatencyMs: null,
    latencySamples: 0,
    usage: runs.reduce(
      (sum, run) => ({
        inputTokens: sum.inputTokens + run.usage.inputTokens,
        outputTokens: sum.outputTokens + run.usage.outputTokens,
        audioSeconds: sum.audioSeconds + run.usage.audioSeconds,
      }),
      { inputTokens: 0, outputTokens: 0, audioSeconds: 0 },
    ),
    byLanguage: { en: 0, hi: 0, hinglish: 0, uncertain: 0 },
    scoreTrend,
    failuresByCategory: [...failDays.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts })),
    passTrend,
    criterionHealth,
    productDecisions,
    needsAttention: [],
    failures: [],
    note: `Filtered to ${runs.length} measured run${runs.length === 1 ? "" : "s"}.`,
  };
}
