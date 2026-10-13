"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { shortAddress } from "@/lib/identity";

export function WalletConnectButton() {
  const { address, label, connecting, error, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (address) {
    return (
      <div ref={rootRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-border-strong bg-panel px-4 py-2 font-mono-nums text-xs transition-colors hover:border-accent"
          title={label ? `${label} · ${address}` : address}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {shortAddress(address)}
        </button>
        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-48 overflow-hidden rounded-lg border border-border-strong bg-panel shadow-lg">
            {label && <div className="truncate border-b border-border px-3 py-2 text-xs text-muted-dim">{label}</div>}
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard can be unavailable (insecure context, permissions) — the menu stays open either way */
                }
              }}
              className="block w-full px-3 py-2 text-left font-mono-nums text-xs text-ink transition-colors hover:bg-white/5"
            >
              {copied ? "Copied ✓" : "Copy address"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                disconnect();
              }}
              className="block w-full px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10"
            >
              Disconnect wallet
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="hidden text-xs text-danger sm:inline">{error}</span>}
      <button
        onClick={connect}
        disabled={connecting}
        className="nav-mono rounded-full border border-border-strong px-4 py-2 text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {connecting ? "Loading…" : "Sign in"}
      </button>
    </div>
  );
}
