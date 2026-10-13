export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "accent" | "success" | "danger";
}) {
  const accentClass = accent === "accent" ? "text-accent" : accent === "success" ? "text-success" : accent === "danger" ? "text-danger" : "text-ink";
  return (
    <div>
      <div className="text-xs text-muted-dim">{label}</div>
      <div className={`mt-1 font-mono-nums text-2xl font-bold tracking-tight ${accentClass}`}>{value}</div>
    </div>
  );
}
