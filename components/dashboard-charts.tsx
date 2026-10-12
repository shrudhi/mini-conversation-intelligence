"use client";

type Point = { date: string; value: number | null; label?: string };
type MixItem = { key: string; label: string; count: number; share: number };
type SeriesPoint = { date: string; conversations: number; tickets: number; handoffs: number };

export function LineChart({
  points,
  ariaLabel,
  valueFormat = (value) => String(value),
  yMax,
}: {
  points: Point[];
  ariaLabel: string;
  valueFormat?: (value: number) => string;
  yMax?: number;
}) {
  if (points.length === 0) return <p className="muted">No data yet.</p>;
  const width = 360;
  const height = 150;
  const pad = 18;
  const max = yMax ?? Math.max(...points.map((point) => point.value ?? 0), 1);
  const coords = points.map((point, index) => {
    const x = pad + (points.length === 1 ? (width - pad * 2) / 2 : (index / (points.length - 1)) * (width - pad * 2));
    const ratio = (point.value ?? 0) / max;
    const y = height - pad - ratio * (height - pad * 2);
    return { ...point, x, y };
  });
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = `${path} L ${coords.at(-1)!.x} ${height - pad} L ${coords[0]!.x} ${height - pad} Z`;
  return (
    <div className="pm-svg-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="pm-svg" role="img" aria-label={ariaLabel}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="pm-axis" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="pm-axis" />
        <path d={area} className="obs-area" />
        <path d={path} className="pm-line" fill="none" />
        {coords.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r={3.5} className="pm-dot">
            <title>
              {point.date}: {point.value === null ? "—" : valueFormat(point.value)}
              {point.label ? ` · ${point.label}` : ""}
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

export function MultiBarChart({ series }: { series: SeriesPoint[] }) {
  if (series.length === 0) return <p className="muted">No volume yet.</p>;
  const width = 380;
  const height = 160;
  const pad = 18;
  const max = Math.max(...series.flatMap((item) => [item.conversations, item.tickets, item.handoffs]), 1);
  const groupWidth = (width - pad * 2) / series.length;
  return (
    <div className="pm-svg-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="pm-svg" role="img" aria-label="Conversation volume">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="pm-axis" />
        {series.map((item, index) => {
          const baseX = pad + index * groupWidth + groupWidth * 0.18;
          const barW = groupWidth * 0.2;
          const bars = [
            { key: "conversations", value: item.conversations, className: "obs-bar-a" },
            { key: "tickets", value: item.tickets, className: "obs-bar-b" },
            { key: "handoffs", value: item.handoffs, className: "obs-bar-c" },
          ];
          return bars.map((bar, barIndex) => {
            const h = (bar.value / max) * (height - pad * 2);
            const x = baseX + barIndex * (barW + 2);
            const y = height - pad - h;
            return (
              <rect key={`${item.date}-${bar.key}`} x={x} y={y} width={barW} height={Math.max(h, 0)} className={bar.className}>
                <title>
                  {item.date}: {bar.key} {bar.value}
                </title>
              </rect>
            );
          });
        })}
      </svg>
      <div className="obs-legend">
        <span>
          <i className="obs-swatch a" /> Conversations
        </span>
        <span>
          <i className="obs-swatch b" /> Tickets
        </span>
        <span>
          <i className="obs-swatch c" /> Handoffs
        </span>
      </div>
      <div className="pm-chart-labels">
        {series.map((item) => (
          <span key={item.date}>{shortDate(item.date)}</span>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({ items, ariaLabel }: { items: MixItem[]; ariaLabel: string }) {
  if (items.length === 0) return <p className="muted">No mix data yet.</p>;
  const size = 160;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors = ["#1f6b5c", "#c2811a", "#2f5d8c", "#b42318", "#6b7280", "#7c5cbf"];
  return (
    <div className="obs-donut-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="obs-donut" role="img" aria-label={ariaLabel}>
        <circle cx={size / 2} cy={size / 2} r={radius} className="obs-donut-track" strokeWidth={stroke} />
        {items.map((item, index) => {
          const length = item.share * circumference;
          const circle = (
            <circle
              key={item.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colors[index % colors.length]}
              strokeWidth={stroke}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>
                {item.label}: {item.count} ({Math.round(item.share * 100)}%)
              </title>
            </circle>
          );
          offset += length;
          return circle;
        })}
      </svg>
      <ul className="obs-donut-legend">
        {items.map((item, index) => (
          <li key={item.key}>
            <i style={{ background: colors[index % colors.length] }} />
            <span>
              {item.label} · {Math.round(item.share * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalBars({
  rows,
}: {
  rows: Array<{ key: string; label: string; value: number; display: string; tone?: "ok" | "warn" | "fail" | "muted" }>;
}) {
  if (rows.length === 0) return <p className="muted">No stage data yet.</p>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="pm-health">
      {rows.map((row) => (
        <div key={row.key} className="pm-health-row">
          <div className="pm-health-label">
            <strong>{row.label}</strong>
            <span>{row.display}</span>
          </div>
          <div className="pm-health-track">
            <div
              className={`pm-health-fill ${row.tone ?? "ok"}`}
              style={{ width: `${Math.round((row.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function shortDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(5);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
