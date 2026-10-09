const STATUS_STYLES: Record<string, string> = {
  WAITING: "bg-slate-700 text-slate-200",
  COPYABLE: "bg-emerald-700 text-emerald-100",
  LIMITED_CAPACITY: "bg-amber-700 text-amber-100",
  DEGRADING: "bg-orange-700 text-orange-100",
  OUTSIDE_POLICY: "bg-rose-700 text-rose-100",
  EXPIRED: "bg-zinc-700 text-zinc-200",
  EXIT_ACTIVE: "bg-sky-700 text-sky-100",
  WAITING_FOR_ENTRY: "bg-slate-700 text-slate-200",
  ENTRY_ACTIVE: "bg-emerald-700 text-emerald-100",
  POSITION_ACTIVE: "bg-sky-700 text-sky-100",
  CLOSED: "bg-zinc-700 text-zinc-200",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-700 text-slate-200";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium tracking-wide ${style}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
