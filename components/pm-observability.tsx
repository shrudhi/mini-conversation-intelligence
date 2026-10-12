"use client";

import { useEffect, useState } from "react";
import { DonutChart, HorizontalBars, LineChart, MultiBarChart } from "@/components/dashboard-charts";

type Observability = {
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
  note: string;
};

type Measured = {
  runCount: number;
  passRate: number | null;
  passCount: number;
  policyAccuracyRate: number | null;
  actionCorrectnessRate: number | null;
  medianLatencyMs: number | null;
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
  }>;
  note: string;
};

type Feedback = {
  satisfactionRate: number | null;
  satisfactionLabel: string;
  responseRate: number | null;
  responseLabel: string;
  resolutionRate: number | null;
  resolutionLabel: string;
  note: string;
};

type Payload = {
  usingDemoPortfolio?: boolean;
  demoNote?: string | null;
  measured: Measured;
  observability: Observability;
  customerFeedback: Feedback;
  policyVersion: string;
  rubricVersion: string;
};

export function PmObservability({ onOpenSupportQa }: { onOpenSupportQa?: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/evaluate")
      .then(async (response) => {
        const payload = (await response.json()) as Payload & { error?: string };
        if (!response.ok) {
          setError(payload.error || "Observability could not be loaded.");
          return;
        }
        setData(payload);
      })
      .catch(() => setError("Observability could not be loaded."));
  }, []);

  const ops = data?.observability;
  const measured = data?.measured;
  const feedback = data?.customerFeedback;

  return (
    <div className="dashboard pm-dash obs-dash">
      <div className="pm-head">
        <div>
          <h1 className="pm-title">PM observability</h1>
          <p className="muted">
            Decision layer for Care voice: quality, latency, escalation, and customer outcomes in one view.
          </p>
        </div>
        {onOpenSupportQa ? (
          <div className="actions pm-tabs">
            <button type="button" className="secondary" onClick={onOpenSupportQa}>
              Open Support QA
            </button>
          </div>
        ) : null}
      </div>

      {error ? <div className="banner banner-danger">{error}</div> : null}
      {data?.usingDemoPortfolio ? (
        <div className="banner banner-amber">
          <strong>Sample portfolio data</strong>
          <p>{data.demoNote || "Charts use fixture scenarios until you end a live evaluated chat."}</p>
        </div>
      ) : null}

      {data && ops && measured && feedback ? (
        <>
          <p className="muted pm-meta">
            Policy {data.policyVersion} · Rubric {data.rubricVersion} · {ops.note}
          </p>

          <div className="pm-kpi-row">
            <Kpi label="Conversations" value={String(ops.opsKpis.conversations)} hint={`${ops.opsKpis.endedConversations} ended`} />
            <Kpi
              label="Pass rate"
              value={pct(measured.passRate)}
              hint={measured.passRate === null ? undefined : `${measured.passCount}/${measured.runCount} passed`}
            />
            <Kpi label="CSAT" value={pct(feedback.satisfactionRate)} hint={feedback.satisfactionLabel} />
            <Kpi label="Resolution" value={pct(feedback.resolutionRate)} hint={feedback.resolutionLabel} />
            <Kpi label="Ticket rate" value={pct(ops.opsKpis.ticketRate)} hint={`${ops.opsKpis.autoTicketCount} tickets`} />
            <Kpi
              label="P95 latency"
              value={ops.opsKpis.p95LatencyMs === null ? "—" : `${(ops.opsKpis.p95LatencyMs / 1000).toFixed(1)}s`}
              hint={
                ops.opsKpis.avgHandleTimeMs === null
                  ? undefined
                  : `AHT ${(ops.opsKpis.avgHandleTimeMs / 1000).toFixed(1)}s`
              }
            />
          </div>

          <div className="obs-grid">
            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>Conversation volume</h2>
                <p>Daily chats vs tickets and human handoffs — watch load and automation share.</p>
              </div>
              <MultiBarChart series={ops.conversationVolume} />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>Pass rate trend</h2>
                <p>Share of scored runs that clear gated quality criteria.</p>
              </div>
              <LineChart
                ariaLabel="Pass rate trend"
                yMax={1}
                valueFormat={(value) => `${Math.round(value * 100)}%`}
                points={measured.passTrend.map((point) => ({
                  date: point.date,
                  value: point.passRate,
                  label: `${point.passCount}/${point.runCount}`,
                }))}
              />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>Median turn latency</h2>
                <p>Voice UX health — rising latency usually means slower STT/TTS or model turns.</p>
              </div>
              <LineChart
                ariaLabel="Latency trend"
                valueFormat={(value) => `${(value / 1000).toFixed(1)}s`}
                points={ops.latencyTrend.map((point) => ({
                  date: point.date,
                  value: point.medianMs,
                  label: `${point.samples} samples`,
                }))}
              />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>Latency by stage</h2>
                <p>Where time is spent in a typical turn — prioritize the tallest bar.</p>
              </div>
              <HorizontalBars
                rows={[
                  {
                    key: "stt",
                    label: "Speech to text",
                    value: ops.latencyStages.sttMs ?? 0,
                    display: ms(ops.latencyStages.sttMs),
                    tone: toneMs(ops.latencyStages.sttMs, 800),
                  },
                  {
                    key: "retrieval",
                    label: "Policy retrieval",
                    value: ops.latencyStages.retrievalMs ?? 0,
                    display: ms(ops.latencyStages.retrievalMs),
                    tone: "ok",
                  },
                  {
                    key: "model",
                    label: "Agent reply",
                    value: ops.latencyStages.modelMs ?? 0,
                    display: ms(ops.latencyStages.modelMs),
                    tone: toneMs(ops.latencyStages.modelMs, 1200),
                  },
                  {
                    key: "tts",
                    label: "Text to speech",
                    value: ops.latencyStages.ttsMs ?? 0,
                    display: ms(ops.latencyStages.ttsMs),
                    tone: toneMs(ops.latencyStages.ttsMs, 1500),
                  },
                ]}
              />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>Language mix</h2>
                <p>Where bilingual Care capacity is used.</p>
              </div>
              <DonutChart items={ops.languageMix} ariaLabel="Language mix" />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>Live sentiment</h2>
                <p>Escalating / frustrated share signals when auto-ticket and empathy policy matter most.</p>
              </div>
              <DonutChart items={ops.sentimentMix} ariaLabel="Sentiment mix" />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>Ticket mix</h2>
                <p>Automation destinations — payment, logistics, or human review.</p>
              </div>
              <DonutChart items={ops.ticketMix} ariaLabel="Ticket mix" />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>Issue focus</h2>
                <p>What customers are calling about — use this for policy and FAQ investment.</p>
              </div>
              <HorizontalBars
                rows={ops.issueMix.map((item) => ({
                  key: item.key,
                  label: item.label,
                  value: item.count,
                  display: `${item.count} · ${Math.round(item.share * 100)}%`,
                  tone: "ok",
                }))}
              />
            </section>
          </div>

          <div className="obs-grid obs-grid-decisions">
            <section className="panel">
              <div className="panel-head">
                <h2>Rubric strength</h2>
                <p>Weakest high-weight criterion is usually the next product fix.</p>
              </div>
              <div className="pm-health">
                {(measured.criterionHealth ?? []).map((row) => {
                  const pctValue = row.passRate === null ? 0 : Math.round(row.passRate * 100);
                  const tone = row.passRate === null ? "muted" : pctValue >= 90 ? "ok" : pctValue >= 70 ? "warn" : "fail";
                  return (
                    <div key={row.criterion} className="pm-health-row" title={row.productSignal}>
                      <div className="pm-health-label">
                        <strong>{row.label}</strong>
                        <span>{row.passRate === null ? "Not assessed" : `${pctValue}% pass`}</span>
                      </div>
                      <div className="pm-health-track">
                        <div className={`pm-health-fill ${tone}`} style={{ width: `${pctValue}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel pm-attention">
              <div className="panel-head">
                <h2>Recommended product decisions</h2>
                <p>Prioritized from quality gates, failures, and ops pressure.</p>
              </div>
              {(measured.productDecisions ?? []).length === 0 ? (
                <p className="muted">Not enough signal to recommend a change yet.</p>
              ) : (
                <ul className="pm-decision-list">
                  {measured.productDecisions.slice(0, 4).map((item) => (
                    <li key={item.id} className={`pm-decision pm-decision-${item.priority}`}>
                      <div className="pm-decision-head">
                        <span className="pm-priority">{item.priority}</span>
                        <strong>{item.title}</strong>
                      </div>
                      <p className="pm-decision-why">{item.why}</p>
                      <p className="muted">{item.action}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="obs-kpi-strip">
            <div>
              <strong>{pct(ops.opsKpis.handoffRate)}</strong>
              <span>Human handoff rate</span>
            </div>
            <div>
              <strong>{pct(ops.opsKpis.escalatingShare)}</strong>
              <span>Escalating / frustrated share</span>
            </div>
            <div>
              <strong>{pct(feedback.responseRate)}</strong>
              <span>Survey response · {feedback.responseLabel}</span>
            </div>
            <div>
              <strong>{pct(measured.policyAccuracyRate)}</strong>
              <span>Policy accuracy</span>
            </div>
            <div>
              <strong>{pct(measured.actionCorrectnessRate)}</strong>
              <span>Action correctness</span>
            </div>
            <div>
              <strong>
                {measured.medianLatencyMs === null ? "—" : `${(measured.medianLatencyMs / 1000).toFixed(1)}s`}
              </strong>
              <span>Median response</span>
            </div>
          </div>
        </>
      ) : !error ? (
        <p className="muted">Loading observability…</p>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="pm-kpi pm-kpi-chart">
      <span className="pm-kpi-icon" aria-hidden />
      <b>{value}</b>
      <span className="pm-kpi-label">{label}</span>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

function ms(value: number | null): string {
  if (value === null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

function toneMs(value: number | null, warnAt: number): "ok" | "warn" | "fail" | "muted" {
  if (value === null) return "muted";
  if (value >= warnAt * 1.4) return "fail";
  if (value >= warnAt) return "warn";
  return "ok";
}
