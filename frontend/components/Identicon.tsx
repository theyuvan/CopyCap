function hashSeed(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  return hash || 1;
}

// mulberry32 — tiny deterministic PRNG, seeded from the address so the same wallet always renders the same avatar.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jazzicon-style deterministic avatar generated from a wallet address — no photo system exists, so this is the honest substitute: same address always renders identically, different addresses look visually distinct. */
export function Identicon({ address, size = 40 }: { address: string; size?: number }) {
  const rand = mulberry32(hashSeed(address));
  const baseHue = Math.floor(rand() * 360);

  const shapes = Array.from({ length: 3 }, (_, i) => {
    const hue = (baseHue + 40 + i * (rand() * 60 + 40)) % 360;
    const cx = rand() * size;
    const cy = rand() * size;
    const r = size * (0.35 + rand() * 0.35);
    return { hue, cx, cy, r, key: i };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 rounded-full">
      <defs>
        <clipPath id={`identicon-clip-${address}`}>
          <circle cx={size / 2} cy={size / 2} r={size / 2} />
        </clipPath>
      </defs>
      <g clipPath={`url(#identicon-clip-${address})`}>
        <rect width={size} height={size} fill={`hsl(${baseHue}, 55%, 22%)`} />
        {shapes.map((s) => (
          <circle key={s.key} cx={s.cx} cy={s.cy} r={s.r} fill={`hsl(${s.hue}, 65%, 55%)`} fillOpacity={0.85} />
        ))}
      </g>
    </svg>
  );
}
