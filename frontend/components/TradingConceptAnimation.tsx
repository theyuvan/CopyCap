"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  t: number;
}

interface Annotation {
  start: number;
  end: number;
  text: string;
  label: string;
}

// Logical drawing resolution — scaled responsively via CSS, not re-derived per container size.
const WIDTH = 860;
const HEIGHT = 440;
const TOTAL_DURATION = 18;

const CANDLES: Candle[] = [
  { o: 280, h: 320, l: 250, c: 260, t: 0.5 },
  { o: 260, h: 290, l: 210, c: 220, t: 1.2 },
  { o: 220, h: 250, l: 150, c: 160, t: 1.9 },
  { o: 160, h: 180, l: 120, c: 140, t: 2.6 },
  { o: 140, h: 150, l: 80, c: 90, t: 3.3 },
  { o: 90, h: 180, l: 80, c: 170, t: 4.2 },
  { o: 170, h: 230, l: 160, c: 220, t: 5.0 },
  { o: 220, h: 280, l: 210, c: 270, t: 5.8 },
  { o: 270, h: 310, l: 250, c: 260, t: 6.6 },
  { o: 260, h: 350, l: 250, c: 340, t: 7.4 },
  { o: 340, h: 380, l: 320, c: 370, t: 8.2 },
  { o: 370, h: 390, l: 300, c: 310, t: 9.0 },
  { o: 310, h: 330, l: 240, c: 250, t: 9.8 },
  { o: 250, h: 270, l: 200, c: 210, t: 10.6 },
  { o: 210, h: 280, l: 200, c: 270, t: 11.5 },
  { o: 270, h: 370, l: 260, c: 360, t: 12.5 },
  { o: 360, h: 420, l: 350, c: 410, t: 13.5 },
];

const ANNOTATIONS: Annotation[] = [
  { start: 1.5, end: 3.2, text: "Break of Structure (BoS)", label: "1. Break of Structure" },
  { start: 3.3, end: 4.8, text: "Liquidity Sweep", label: "2. Liquidity Sweep" },
  { start: 5.0, end: 6.8, text: "Change of Character (CHoCH)", label: "3. CHoCH" },
  { start: 7.0, end: 9.5, text: "Demand Zone", label: "4. Demand Zone" },
  { start: 9.6, end: 11.2, text: "Pullback", label: "5. Pullback" },
  { start: 11.3, end: 13.5, text: "Confirmation (RR = 1:3)", label: "6. RR = 1:3 Setup" },
];

const COLOR_SUCCESS = "#34d399";
const COLOR_DANGER = "#f87171";
const COLOR_WARNING = "#fbbf24";
const COLOR_CHOCH = "#38bdf8";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  alpha: number;
  color: string;
}

function makeParticles(): Particle[] {
  return Array.from({ length: 35 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT,
    size: Math.random() * 2.5 + 0.5,
    speedX: (Math.random() - 0.5) * 0.4,
    speedY: (Math.random() - 0.5) * 0.4,
    alpha: Math.random() * 0.6 + 0.2,
    color: Math.random() > 0.5 ? COLOR_SUCCESS : COLOR_DANGER,
  }));
}

/**
 * Original canvas price-action animation (Break of Structure / Liquidity
 * Sweep / CHoCH / Demand Zone / RR setup) — ported from a standalone HTML
 * prototype into a React component, restyled onto this app's design tokens,
 * made responsive, and trimmed down to just the animated chart.
 */
export function TradingConceptAnimation({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationBoxRef = useRef<HTMLDivElement>(null);
  const annotationTextRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>(makeParticles());
  const timeRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number>();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    function render(animationTime: number) {
      ctx!.clearRect(0, 0, WIDTH, HEIGHT);

      const bgGradient = ctx!.createRadialGradient(WIDTH / 2, HEIGHT / 2, 50, WIDTH / 2, HEIGHT / 2, 500);
      bgGradient.addColorStop(0, "#1c1a18");
      bgGradient.addColorStop(1, "#0a0908");
      ctx!.fillStyle = bgGradient;
      ctx!.fillRect(0, 0, WIDTH, HEIGHT);

      ctx!.strokeStyle = "rgba(243,241,236,0.04)";
      ctx!.lineWidth = 1;
      for (let x = 0; x < WIDTH; x += 40) {
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, HEIGHT);
        ctx!.stroke();
      }
      for (let y = 0; y < HEIGHT; y += 40) {
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(WIDTH, y);
        ctx!.stroke();
      }

      for (const p of particlesRef.current) {
        p.y += p.speedY;
        p.x += p.speedX;
        if (p.y < 0) p.y = HEIGHT;
        if (p.y > HEIGHT) p.y = 0;
        if (p.x < 0) p.x = WIDTH;
        if (p.x > WIDTH) p.x = 0;

        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = p.alpha * 0.5;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      if (animationTime >= 7.0) {
        const a = Math.min(1, (animationTime - 7.0) * 2);
        ctx!.fillStyle = `rgba(52, 211, 153, ${0.15 * a})`;
        ctx!.strokeStyle = `rgba(52, 211, 153, ${0.5 * a})`;
        ctx!.lineWidth = 1.5;
        ctx!.setLineDash([4, 4]);
        ctx!.fillRect(150, 240, 550, 80);
        ctx!.strokeRect(150, 240, 550, 80);
        ctx!.setLineDash([]);
        ctx!.fillStyle = `rgba(243, 241, 236, ${0.8 * a})`;
        ctx!.font = "bold 13px 'JetBrains Mono', monospace";
        ctx!.fillText("DEMAND ZONE", 165, 290);
      }

      if (animationTime >= 11.3) {
        const a = Math.min(1, (animationTime - 11.3) * 2);
        ctx!.fillStyle = `rgba(52, 211, 153, ${0.25 * a})`;
        ctx!.strokeStyle = `rgba(52, 211, 153, ${0.8 * a})`;
        ctx!.lineWidth = 2;
        ctx!.fillRect(520, 80, 280, 160);
        ctx!.strokeRect(520, 80, 280, 160);
        ctx!.fillStyle = "#f3f1ec";
        ctx!.font = "bold 18px 'JetBrains Mono', monospace";
        ctx!.fillText("RR = 1:3", 615, 165);
      }

      if (animationTime >= 1.5 && animationTime < 4.8) {
        ctx!.strokeStyle = COLOR_WARNING;
        ctx!.lineWidth = 2;
        ctx!.setLineDash([6, 6]);
        ctx!.beginPath();
        ctx!.moveTo(100, 280);
        ctx!.lineTo(380, 280);
        ctx!.stroke();
        ctx!.setLineDash([]);
      }

      if (animationTime >= 3.3 && animationTime < 5.5) {
        ctx!.strokeStyle = COLOR_DANGER;
        ctx!.lineWidth = 2;
        ctx!.strokeRect(330, 310, 60, 50);
      }

      if (animationTime >= 5.0 && animationTime < 8.5) {
        ctx!.strokeStyle = COLOR_CHOCH;
        ctx!.lineWidth = 2;
        ctx!.setLineDash([4, 4]);
        ctx!.beginPath();
        ctx!.moveTo(250, 220);
        ctx!.lineTo(500, 220);
        ctx!.stroke();
        ctx!.setLineDash([]);
      }

      const startX = 80;
      const candleWidth = 28;
      const candleSpacing = 42;

      CANDLES.forEach((c, index) => {
        if (animationTime < c.t) return;

        const x = startX + index * candleSpacing;
        const yHigh = HEIGHT - c.h;
        const yLow = HEIGHT - c.l;
        const yOpen = HEIGHT - c.o;
        const yClose = HEIGHT - c.c;

        const isGreen = c.c <= c.o;
        const color = isGreen ? COLOR_SUCCESS : COLOR_DANGER;

        ctx!.shadowColor = color;
        ctx!.shadowBlur = 12;
        ctx!.strokeStyle = color;
        ctx!.fillStyle = color;
        ctx!.lineWidth = 2;

        ctx!.beginPath();
        ctx!.moveTo(x + candleWidth / 2, yHigh);
        ctx!.lineTo(x + candleWidth / 2, yLow);
        ctx!.stroke();

        const bodyY = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(Math.abs(yOpen - yClose), 4);
        ctx!.fillRect(x, bodyY, candleWidth, bodyHeight);
        ctx!.strokeRect(x, bodyY, candleWidth, bodyHeight);

        ctx!.shadowBlur = 0;
      });
    }

    function updateAnnotation(animationTime: number) {
      const current = ANNOTATIONS.find((a) => animationTime >= a.start && animationTime <= a.end);
      if (annotationBoxRef.current) annotationBoxRef.current.style.opacity = current ? "1" : "0";
      if (current && annotationTextRef.current) annotationTextRef.current.textContent = current.text;
    }

    function tick(timestamp: number) {
      if (lastTsRef.current === null) lastTsRef.current = timestamp;
      const dt = (timestamp - lastTsRef.current) / 1000;
      lastTsRef.current = timestamp;

      if (!reducedMotion) {
        timeRef.current += dt;
        if (timeRef.current > TOTAL_DURATION) timeRef.current = 0;
      }

      render(timeRef.current);
      updateAnnotation(timeRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion]);

  return (
    <div className={`relative overflow-hidden rounded-lg border border-border-strong bg-bg-elevated/80 shadow-glow ${className ?? ""}`}>
      <div className="relative" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="block h-full w-full" />

        <div
          ref={annotationBoxRef}
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 opacity-0 transition-opacity duration-500"
        >
          <div
            ref={annotationTextRef}
            className="rounded-lg border border-success/40 bg-panel/90 px-5 py-2.5 font-mono-nums text-sm font-semibold uppercase tracking-widest text-success shadow-glow-success backdrop-blur-md sm:text-base"
          />
        </div>
      </div>
    </div>
  );
}
