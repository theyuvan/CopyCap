"use client";

import { useEffect, useState } from "react";

function format(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/**
 * Live-updating relative timestamp. Starts blank and fills in on mount
 * (rather than computing during the initial render) so the server-rendered
 * HTML and the first client render always match — computing immediately
 * would drift between when the server rendered and when the client
 * hydrates, and React flags that as a hydration mismatch.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(format(iso));
    const interval = setInterval(() => setLabel(format(iso)), 15000);
    return () => clearInterval(interval);
  }, [iso]);

  return <span>{label ?? " "}</span>;
}
