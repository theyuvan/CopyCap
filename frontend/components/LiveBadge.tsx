export function LiveBadge({ label = "Monad Testnet" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-panel px-3 py-1 text-xs text-muted">
      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
      {label}
    </span>
  );
}
