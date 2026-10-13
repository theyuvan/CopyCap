const STATUS_STYLES: Record<string, string> = {
  WAITING: "blend-neutral-soft text-muted",
  COPYABLE: "blend-success-soft text-success",
  LIMITED_CAPACITY: "blend-warning-soft text-warning",
  DEGRADING: "blend-warning-soft text-warning",
  OUTSIDE_POLICY: "blend-danger-soft text-danger",
  EXPIRED: "blend-neutral-soft text-muted-dim",
  EXIT_ACTIVE: "blend-info-soft text-info",
  WAITING_FOR_ENTRY: "blend-neutral-soft text-muted",
  ENTRY_ACTIVE: "blend-success-soft text-success",
  POSITION_ACTIVE: "blend-info-soft text-info",
  CLOSED: "blend-neutral-soft text-muted-dim",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "blend-neutral-soft text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium tracking-wide ${style}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
