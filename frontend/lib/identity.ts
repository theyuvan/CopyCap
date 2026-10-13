/** Deterministic cosmetic identity for a raw wallet address — no off-chain name registry exists, so the address itself stays the source of truth and is always shown in full somewhere on the page. */
export function shortAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function initials(address: string): string {
  return address.slice(2, 4).toUpperCase();
}

const HUES = [4, 24, 142, 199, 262, 330, 48];

export function avatarHue(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  return HUES[hash % HUES.length];
}

export function avatarStyle(address: string): { backgroundColor: string; color: string } {
  const hue = avatarHue(address);
  return {
    backgroundColor: `hsla(${hue}, 70%, 55%, 0.16)`,
    color: `hsl(${hue}, 70%, 65%)`,
  };
}

const HANDLE_ADJECTIVES = [
  "Crimson", "Silent", "Golden", "Swift", "Quiet", "Iron", "Amber", "Northern",
  "Lunar", "Rapid", "Steel", "Violet", "Copper", "Arctic", "Solar", "Hidden",
];
const HANDLE_NOUNS = [
  "Falcon", "Otter", "Comet", "Wolf", "Hawk", "Fox", "Raven", "Lynx",
  "Tiger", "Heron", "Badger", "Osprey", "Panther", "Eagle", "Viper", "Stag",
];

function hashAddress(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * Deterministic cosmetic handle derived from the address — purely a display
 * nickname (same wallet always gets the same one), never a claim of verified
 * identity. The raw address is still shown everywhere alongside it, since
 * that's the actual on-chain identity this system tracks.
 */
export function generateHandle(address: string): string {
  const hash = hashAddress(address);
  const adjective = HANDLE_ADJECTIVES[hash % HANDLE_ADJECTIVES.length];
  // Unsigned shift (>>>), not signed (>>) — hash can exceed 2^31, and a
  // signed shift sign-extends that into a negative number, which turns
  // "negative % 16" into a negative index — array[-3] is undefined, which
  // is exactly how "Golden undefined" happened for some addresses.
  const noun = HANDLE_NOUNS[(hash >>> 8) % HANDLE_NOUNS.length];
  return `${adjective} ${noun}`;
}
