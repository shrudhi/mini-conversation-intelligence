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
          setError(payload.error || "The performance dashboard could not be loaded.");
          return;
        }
        setData(payload);
      })
      .catch(() => setError("The performance dashboard could not be loaded."));
  }, []);

  const ops = data?.observability;
  const measured = data?.measured;
  const feedback = data?.customerFeedback;

  return (
    <div className="dashboard pm-dash obs-dash">
      <div className="pm-head">
        <div>
          <h1 className="pm-title">Performance dashboard</h1>
          <p className="muted">
            Decision layer for Care voice: quality, latency, escalation, and customer outcomes in one view. Hover the info
            icons for metric definitions.
          </p>
        </div>
        {onOpenSupportQa ? (
          <div className="actions pm-tabs">
            <button type="button" className="secondary" onClick={onOpenSupportQa}>
              Open conversation review
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
            <Kpi
              label="Conversations"
              value={String(ops.opsKpis.conversations)}
              hint={`${ops.opsKpis.endedConversations} ended`}
              tip="Total live Care conversations in this portfolio. Ended chats are the ones that can receive a survey and count toward CSAT."
            />
            <Kpi
              label="Pass rate"
              value={pct(measured.passRate)}
              hint={measured.passRate === null ? undefined : `${measured.passCount}/${measured.runCount} passed`}
              tip="Share of scored live runs that overall-pass. Pass = published headline score and no fail on gated criteria (policy, grounding, action, identity, task). Launch bar: investigate if below 60%."
            />
            <Kpi
              label="CSAT"
              value={pct(feedback.satisfactionRate)}
              hint={feedback.satisfactionLabel}
              tip="Customer satisfaction: satisfied=yes ÷ submitted feedback forms. Skipped surveys do not count as unsatisfied."
            />
            <Kpi
              label="Resolution"
              value={pct(feedback.resolutionRate)}
              hint={feedback.resolutionLabel}
              tip="Share of submitted feedback marked fully resolved (yes). Partly and no stay out of this rate."
            />
            <Kpi
              label="Ticket rate"
              value={pct(ops.opsKpis.ticketRate)}
              hint={`${ops.opsKpis.autoTicketCount} tickets`}
              tip="Share of live conversations that created a support ticket (payment, logistics, or human review). Spikes often track overdue refunds."
            />
            <Kpi
              label="P95 latency"
              value={ops.opsKpis.p95LatencyMs === null ? "—" : `${(ops.opsKpis.p95LatencyMs / 1000).toFixed(1)}s`}
              hint={
                ops.opsKpis.avgHandleTimeMs === null
                  ? undefined
                  : `AHT ${(ops.opsKpis.avgHandleTimeMs / 1000).toFixed(1)}s`
              }
              tip="95th percentile end-to-end turn latency (STT + retrieval + model + TTS). AHT is average handle time across turns in a conversation. High P95 means the worst turns feel slow."
            />
          </div>

          <div className="obs-grid">
            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>
                  Conversation volume{" "}
                  <InfoTip text="Daily count of live chats vs tickets created and human handoffs. Use this to see load and how often Care automates vs escalates." />
                </h2>
                <p>Daily chats vs tickets and human handoffs — watch load and automation share.</p>
              </div>
              <MultiBarChart series={ops.conversationVolume} />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>
                  Pass rate trend{" "}
                  <InfoTip text="Share of scored runs that overall-pass each day — not average headline. A drop of more than ~10 points day-over-day is worth investigating." />
                </h2>
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
                <h2>
                  Median turn latency{" "}
                  <InfoTip text="Median end-to-end time for a single voice/text turn. Rising median usually means slower speech-to-text, model reply, or text-to-speech." />
                </h2>
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
                <h2>
                  Latency by stage{" "}
                  <InfoTip text="Average time spent in each pipeline stage. UI warns when STT ≥ 0.8s, agent reply ≥ 1.2s, or TTS ≥ 1.5s. Fix the tallest bar first." />
                </h2>
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
                <h2>
                  Language mix{" "}
                  <InfoTip text="Share of turns in English, Hindi, Hinglish, or uncertain. Helps plan bilingual Care capacity and TTS quality focus." />
                </h2>
                <p>Where bilingual Care capacity is used.</p>
              </div>
              <DonutChart items={ops.languageMix} ariaLabel="Language mix" />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>
                  Live sentiment{" "}
                  <InfoTip text="Detected customer tone during the chat. Escalating or frustrated share signals when auto-ticket and empathy policy matter most. Watch if that share exceeds ~30%." />
                </h2>
                <p>Escalating / frustrated share signals when auto-ticket and empathy policy matter most.</p>
              </div>
              <DonutChart items={ops.sentimentMix} ariaLabel="Sentiment mix" />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>
                  Ticket mix{" "}
                  <InfoTip text="Where tickets go: payment support, logistics/pickup, human review, or no ticket. Shows automation destinations for Care ops." />
                </h2>
                <p>Automation destinations — payment, logistics, or human review.</p>
              </div>
              <DonutChart items={ops.ticketMix} ariaLabel="Ticket mix" />
            </section>

            <section className="panel pm-chart-panel">
              <div className="panel-head">
                <h2>
                  Issue focus{" "}
                  <InfoTip text="What customers are calling about (refund, pickup, QC, etc.). Dominant issues above ~40% share are candidates for FAQ or policy investment." />
                </h2>
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
                <h2>
                  Rubric strength{" "}
                  <InfoTip text="Pass share per gated criterion among assessed runs. Bars: ≥90% green, ≥70% amber, below 70% red. Fix the weakest high-weight bar first." />
                </h2>
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
                <h2>
                  Recommended product decisions{" "}
                  <InfoTip text="Prioritized roadmap hints from weak criteria, recurring failure patterns, incomplete scorecards, and low overall pass rate. High = fix first." />
                </h2>
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
            <StripStat
              value={pct(ops.opsKpis.handoffRate)}
              label="Human handoff rate"
              tip="Share of live chats that offered or created a human-review path. Lower is better unless policy requires a human."
            />
            <StripStat
              value={pct(ops.opsKpis.escalatingShare)}
              label="Escalating / frustrated share"
              tip="Share of conversations with escalating or frustrated live tone. Watch if above ~30% of volume."
            />
            <StripStat
              value={pct(feedback.responseRate)}
              label={`Survey response · ${feedback.responseLabel}`}
              tip="Submitted feedback ÷ ended live conversations. Skips count separately and do not lower CSAT."
            />
            <StripStat
              value={pct(measured.policyAccuracyRate)}
              label="Policy accuracy"
              tip="% of assessed runs that passed policy accuracy. Gaps mean wrong quotes or weak policy retrieval."
            />
            <StripStat
              value={pct(measured.actionCorrectnessRate)}
              label="Action correctness"
              tip="% of assessed runs that passed action safety. Gaps mean unsafe tickets, duplicates, or wrong escalation type."
            />
            <StripStat
              value={measured.medianLatencyMs === null ? "—" : `${(measured.medianLatencyMs / 1000).toFixed(1)}s`}
              label="Median response"
              tip="Median end-to-end turn latency across measured sessions. Useful for voice UX, separate from quality pass rate."
            />
          </div>
        </>
      ) : !error ? (
        <p className="muted">Loading performance dashboard…</p>
      ) : null}
    </div>
  );
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

function Kpi({ label, value, hint, tip }: { label: string; value: string; hint?: string; tip: string }) {
  return (
    <div className="pm-kpi pm-kpi-chart">
      <span className="pm-kpi-icon" aria-hidden />
      <b>{value}</b>
      <span className="pm-kpi-label">
        {label}
        <InfoTip text={tip} />
      </span>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function StripStat({ value, label, tip }: { value: string; label: string; tip: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>
        {label}
        <InfoTip text={tip} />
      </span>
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
