interface CurvePoint {
  requestedNotional: number;
  expectedDeviationBps: number | null;
  status: string;
}

const STATUS_COLOR: Record<string, string> = {
  COPYABLE: "#34d399",
  DEGRADING: "#fb923c",
  LIMITED_CAPACITY: "#fbbf24",
  OUTSIDE_POLICY: "#f87171",
};

/** Plain inline SVG — no chart library needed for a handful of points, and it renders server-side with zero client JS. */
export function CapacityCurveChart({ points }: { points: CurvePoint[] }) {
  const width = 640;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 36, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxDeviation = Math.max(10, ...points.map((p) => p.expectedDeviationBps ?? 0));
  const xFor = (i: number) => padding.left + (i / Math.max(1, points.length - 1)) * plotW;
  const yFor = (v: number) => padding.top + plotH - (v / maxDeviation) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.expectedDeviationBps ?? 0)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl" role="img" aria-label="Capacity curve">
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={padding.top + plotH}
        stroke="#232935"
      />
      <line
        x1={padding.left}
        y1={padding.top + plotH}
        x2={padding.left + plotW}
        y2={padding.top + plotH}
        stroke="#232935"
      />
      <path d={pathD} fill="none" stroke="#64748b" strokeWidth={2} />
      {points.map((p, i) => (
        <g key={p.requestedNotional}>
          <circle
            cx={xFor(i)}
            cy={yFor(p.expectedDeviationBps ?? 0)}
            r={5}
            fill={STATUS_COLOR[p.status] ?? "#8b94a7"}
          />
          <text x={xFor(i)} y={height - 10} fontSize={11} fill="#8b94a7" textAnchor="middle">
            {p.requestedNotional >= 1000 ? `${p.requestedNotional / 1000}K` : p.requestedNotional}
          </text>
          <text
            x={xFor(i)}
            y={yFor(p.expectedDeviationBps ?? 0) - 10}
            fontSize={11}
            fill="#e6e9ef"
            textAnchor="middle"
          >
            {(p.expectedDeviationBps ?? 0).toFixed(1)}bps
          </text>
        </g>
      ))}
      <text x={padding.left} y={14} fontSize={11} fill="#8b94a7">
        deviation (bps)
      </text>
    </svg>
  );
}
