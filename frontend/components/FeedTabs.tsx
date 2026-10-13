"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { StrategyCard } from "@/components/StrategyCard";
import { RevealStagger } from "@/components/Reveal";
import type { StrategyDetail } from "@/lib/api";

const TABS = [
  { id: "all", label: "All Strategies", match: () => true },
  { id: "active", label: "Entry Active", match: (s: StrategyDetail) => s.lifecycleState === "ENTRY_ACTIVE" },
  { id: "position", label: "In Position", match: (s: StrategyDetail) => s.lifecycleState === "POSITION_ACTIVE" },
  { id: "waiting", label: "Waiting", match: (s: StrategyDetail) => s.lifecycleState === "WAITING_FOR_ENTRY" },
  { id: "closed", label: "Closed", match: (s: StrategyDetail) => ["CLOSED", "EXPIRED"].includes(s.lifecycleState) },
];

export function FeedTabs({
  strategies,
  followerCounts,
}: {
  strategies: StrategyDetail[];
  followerCounts: Record<string, number>;
}) {
  const [active, setActive] = useState("all");

  const filtered = useMemo(() => {
    const tab = TABS.find((t) => t.id === active) ?? TABS[0];
    return strategies.filter(tab.match);
  }, [strategies, active]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((tab) => {
          const count = strategies.filter(tab.match).length;
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`relative px-4 py-2.5 text-sm transition-colors ${
                isActive ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 font-mono-nums text-xs text-muted-dim">{count}</span>
              {isActive && (
                <motion.div
                  layoutId="feed-tab-underline"
                  className="absolute -bottom-px left-0 right-0 h-[2px] bg-accent shadow-glow"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-panel p-8 text-center text-sm text-muted">
          No strategies in this state right now.
        </div>
      ) : (
        <RevealStagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <StrategyCard key={s.id} strategy={s} followerCount={followerCounts[s.id] ?? 0} />
          ))}
        </RevealStagger>
      )}
    </div>
  );
}
