"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";

export function DetailTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-border">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="detail-tab-underline"
                  className="absolute -bottom-px left-0 right-0 h-[2px] bg-accent shadow-glow"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} className={tab.id === active ? "block" : "hidden"}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
