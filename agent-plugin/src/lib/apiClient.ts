const API_BASE = process.env.MIRRORCAP_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MirrorCap API ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export const mirrorcapApi = {
  listStrategies: () => request<any[]>("/strategies"),
  getStrategy: (id: string) => request<any>(`/strategies/${id}`),
  follow: (id: string, body: unknown) =>
    request<any>(`/strategies/${id}/follow`, { method: "POST", body: JSON.stringify(body) }),
  analyze: (id: string, wallet: string, notional: number) =>
    request<any>(`/strategies/${id}/analyze?wallet=${wallet}&notional=${notional}`),
  recordPosition: (id: string, body: unknown) =>
    request<any>(`/strategies/${id}/positions`, { method: "POST", body: JSON.stringify(body) }),
};
