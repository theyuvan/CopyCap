"use client";

import { useId, useMemo, useRef, useState } from "react";

const COLOR_MAP = {
  success: "#34d399",
  danger: "#f87171",
  accent: "#d4ff72",
};

interface Coord {
  x: number;
  y: number;
  value: number;
}

/** Catmull-Rom -> cubic Bezier conversion, so even a handful of points reads as a smooth flowing curve. */
function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return "";
  if (coords.length === 2) return `M ${coords[0].x} ${coords[0].y} L ${coords[1].x} ${coords[1].y}`;
  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Splits a coord list into above-zero / below-zero runs, inserting an interpolated point exactly at each zero crossing. */
function splitAtZero(coords: Coord[]): { points: Coord[]; positive: boolean }[] {
  if (coords.length === 0) return [];
  const segments: { points: Coord[]; positive: boolean }[] = [];
  let current: Coord[] = [coords[0]];
  let currentPositive = coords[0].value >= 0;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const prevPositive = prev.value >= 0;
    const currPositive = curr.value >= 0;
    if (prevPositive !== currPositive) {
      const t = prev.value / (prev.value - curr.value);
      const cross: Coord = { x: prev.x + t * (curr.x - prev.x), y: prev.y + t * (curr.y - prev.y), value: 0 };
      current.push(cross);
      segments.push({ points: current, positive: currentPositive });
      current = [cross];
      currentPositive = currPositive;
    }
    current.push(curr);
  }
  segments.push({ points: current, positive: currentPositive });
  return segments;
}

/** Flat inline line/area chart — the full 3D chart is reserved for hero/detail capacity views. */
export function Sparkline({
  points,
  labels,
  pointLabels,
  formatValue,
  color = "success",
  width = 120,
  height = 40,
  showZeroLine = false,
  smooth = false,
  biColor = false,
}: {
  points: number[];
  labels?: string[];
  /** One label per point (e.g. a full date), shown in the hover tooltip. Enables hover when provided. */
  pointLabels?: string[];
  formatValue?: (value: number) => string;
  color?: "success" | "danger" | "accent";
  width?: number;
  height?: number;
  showZeroLine?: boolean;
  smooth?: boolean;
  /** Renders above-zero in success green and below-zero in danger red, split exactly at each crossing — like a real equity curve, not one flat color regardless of sign. */
  biColor?: boolean;
}) {
  const gradientId = useId();
  const posGradientId = useId();
  const negGradientId = useId();
  const stroke = COLOR_MAP[color];
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { linePath, areaPath, zeroY, coords, segments } = useMemo(() => {
    if (points.length < 2) {
      return { linePath: "", areaPath: "", zeroY: null as number | null, coords: [] as Coord[], segments: [] as ReturnType<typeof splitAtZero> };
    }
    const min = Math.min(...points, showZeroLine ? 0 : Infinity);
    const max = Math.max(...points, showZeroLine ? 0 : -Infinity);
    const range = max - min || 1;
    const coords: Coord[] = points.map((p, i) => ({
      x: (i / (points.length - 1)) * width,
      y: height - ((p - min) / range) * height,
      value: p,
    }));
    const line = smooth
      ? smoothPath(coords)
      : coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
    const area = `${line} L ${width} ${height} L 0 ${height} Z`;
    const zero = showZeroLine && min <= 0 && max >= 0 ? height - ((0 - min) / range) * height : null;
    const hasBothSigns = points.some((p) => p >= 0) && points.some((p) => p < 0);
    const segments = biColor && zero !== null && hasBothSigns ? splitAtZero(coords) : [];
    return { linePath: line, areaPath: area, zeroY: zero, coords, segments };
  }, [points, width, height, showZeroLine, smooth, biColor]);

  if (!linePath) return <div style={{ width, height }} />;

  const hoverEnabled = Boolean(pointLabels);
  const useSegments = segments.length > 0;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!hoverEnabled || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const step = width / Math.max(1, points.length - 1);
    const idx = Math.min(points.length - 1, Math.max(0, Math.round(relX / step)));
    setHoverIndex(idx);
  }

  const hover = hoverIndex !== null ? coords[hoverIndex] : null;
  const hoverColor = hover ? (hover.value >= 0 ? COLOR_MAP.success : COLOR_MAP.danger) : stroke;
  const tooltipLeft = hover ? Math.min(Math.max(hover.x, 55), width - 55) : 0;
  const tooltipTop = hover ? Math.max(hover.y - 34, 0) : 0;

  return (
    <div style={{ width }} className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.4" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          {useSegments && zeroY !== null && (
            <>
              <linearGradient id={posGradientId} x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={COLOR_MAP.success} stopOpacity="0.35" />
                <stop offset={Math.min(1, Math.max(0, zeroY / height))} stopColor={COLOR_MAP.success} stopOpacity="0" />
              </linearGradient>
              <linearGradient id={negGradientId} x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
                <stop offset={Math.min(1, Math.max(0, zeroY / height))} stopColor={COLOR_MAP.danger} stopOpacity="0" />
                <stop offset="1" stopColor={COLOR_MAP.danger} stopOpacity="0.35" />
              </linearGradient>
            </>
          )}
        </defs>
        {zeroY !== null && (
          <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="rgba(243,241,236,0.15)" strokeDasharray="3 4" />
        )}

        {useSegments && zeroY !== null ? (
          segments.map((seg, i) => {
            const segColor = seg.positive ? COLOR_MAP.success : COLOR_MAP.danger;
            const segLine = smooth ? smoothPath(seg.points) : seg.points.map((c, j) => `${j === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
            const first = seg.points[0];
            const last = seg.points[seg.points.length - 1];
            const segArea = `${segLine} L ${last.x.toFixed(2)} ${zeroY} L ${first.x.toFixed(2)} ${zeroY} Z`;
            return (
              <g key={i}>
                <path d={segArea} fill={`url(#${seg.positive ? posGradientId : negGradientId})`} />
                <path d={segLine} fill="none" stroke={segColor} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })
        ) : (
          <>
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={0} y2={height} stroke="rgba(243,241,236,0.2)" strokeDasharray="2 3" />
            <circle cx={hover.x} cy={hover.y} r={3.5} fill={hoverColor} stroke="#0a0908" strokeWidth={1.5} />
          </>
        )}
        {hoverEnabled && <rect x={0} y={0} width={width} height={height} fill="transparent" />}
      </svg>
      {hover && pointLabels && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-sm border border-border-strong bg-bg-elevated px-2.5 py-1.5 text-[10px] shadow-lg"
          style={{ left: tooltipLeft, top: tooltipTop, transform: "translate(-50%, -100%)" }}
        >
          <div className="text-muted-dim">{pointLabels[hoverIndex!]}</div>
          <div className="font-mono-nums font-semibold text-ink">
            {formatValue ? formatValue(points[hoverIndex!]) : points[hoverIndex!].toFixed(2)}
          </div>
        </div>
      )}
      {labels && (
        <div className="mt-1 flex justify-between font-mono-nums text-[10px] text-muted-dim">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
