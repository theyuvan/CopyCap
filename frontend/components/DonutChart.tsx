"use client";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** Simple SVG donut built from stroke-dasharray arcs — real computed proportions, no chart library. */
export function DonutChart({ segments, size = 160 }: { segments: DonutSegment[]; size?: number }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-dim" style={{ width: size, height: size }}>
        No data yet
      </div>
    );
  }

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = s.value / total;
      const dash = fraction * circumference;
      const arc = (
        <circle
          key={s.label}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={s.color}
          strokeWidth={14}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={-offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      );
      offset += dash;
      return arc;
    });

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size}>
        {arcs}
      </svg>
      <div className="space-y-2 text-sm">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="font-mono-nums text-ink">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
