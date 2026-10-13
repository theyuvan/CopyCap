"use client";

import { motion, useReducedMotion } from "framer-motion";

interface Orb {
  size: number;
  color: string;
  top: string;
  left: string;
  duration: number;
  delay: number;
  xRange: number;
  yRange: number;
}

const ORBS: Orb[] = [
  { size: 420, color: "var(--accent-glow)", top: "-10%", left: "8%", duration: 22, delay: 0, xRange: 60, yRange: 40 },
  { size: 320, color: "var(--success-glow)", top: "40%", left: "68%", duration: 26, delay: 2, xRange: -50, yRange: 55 },
  { size: 260, color: "var(--accent-glow)", top: "60%", left: "18%", duration: 19, delay: 4, xRange: 45, yRange: -35 },
  { size: 300, color: "var(--success-glow)", top: "5%", left: "55%", duration: 24, delay: 1, xRange: -40, yRange: 45 },
];

/**
 * Purely decorative, slow-drifting glow orbs behind hero content — gives the
 * page a soft, alive ambience (long, loose loops; never a sharp motion) without
 * competing with the live chart or text. Disabled under prefers-reduced-motion.
 */
export function FloatingAmbient({ className }: { className?: string }) {
  const reducedMotion = useReducedMotion();

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`} aria-hidden>
      {ORBS.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            top: orb.top,
            left: orb.left,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: "blur(40px)",
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
          animate={
            reducedMotion
              ? { opacity: 0.6 }
              : {
                  x: [0, orb.xRange, 0, -orb.xRange, 0],
                  y: [0, orb.yRange, 0, -orb.yRange, 0],
                  rotate: [0, 6, 0, -6, 0],
                  opacity: [0.5, 0.75, 0.5, 0.75, 0.5],
                }
          }
          transition={
            reducedMotion
              ? { duration: 0.6 }
              : { duration: orb.duration, delay: orb.delay, repeat: Infinity, ease: "easeInOut" }
          }
        />
      ))}
    </div>
  );
}
