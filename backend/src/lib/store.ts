import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FollowerPolicy, Position, Strategy } from "@mirrorcap/shared-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../../data/store.json");

interface StoreShape {
  strategies: Strategy[];
  followers: FollowerPolicy[];
  positions: Position[];
  /** `${wallet}:${yyyy-mm-dd}` -> cumulative quote notional spent that day. */
  dailyOutflow: Record<string, number>;
}

function emptyStore(): StoreShape {
  return { strategies: [], followers: [], positions: [], dailyOutflow: {} };
}

function load(): StoreShape {
  if (!fs.existsSync(DATA_FILE)) return emptyStore();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return { ...emptyStore(), ...JSON.parse(raw) };
  } catch {
    return emptyStore();
  }
}

function persist(store: StoreShape) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

// Simple in-memory cache backed by a JSON file. MVP stores strategy metadata
// offchain by design (OVERALL.md #30) — a custom strategy contract is
// explicitly out of scope for this build.
let store = load();

export function getStrategies(): Strategy[] {
  return store.strategies;
}

export function getStrategy(id: string): Strategy | undefined {
  return store.strategies.find((s) => s.id === id);
}

export function upsertStrategy(strategy: Strategy): void {
  const idx = store.strategies.findIndex((s) => s.id === strategy.id);
  if (idx >= 0) store.strategies[idx] = strategy;
  else store.strategies.push(strategy);
  persist(store);
}

export function getFollowerPolicy(strategyId: string, wallet: string): FollowerPolicy | undefined {
  return store.followers.find((f) => f.strategyId === strategyId && f.wallet === wallet);
}

export function getFollowersForStrategy(strategyId: string): FollowerPolicy[] {
  return store.followers.filter((f) => f.strategyId === strategyId);
}

export function upsertFollowerPolicy(policy: FollowerPolicy): void {
  const idx = store.followers.findIndex(
    (f) => f.strategyId === policy.strategyId && f.wallet === policy.wallet,
  );
  if (idx >= 0) store.followers[idx] = policy;
  else store.followers.push(policy);
  persist(store);
}

export function getPositionsForStrategy(strategyId: string): Position[] {
  return store.positions.filter((p) => p.strategyId === strategyId);
}

export function getPosition(id: string): Position | undefined {
  return store.positions.find((p) => p.id === id);
}

export function upsertPosition(position: Position): void {
  const idx = store.positions.findIndex((p) => p.id === position.id);
  if (idx >= 0) store.positions[idx] = position;
  else store.positions.push(position);
  persist(store);
}

function dayKey(wallet: string, now: Date): string {
  return `${wallet}:${now.toISOString().slice(0, 10)}`;
}

export function getDailyOutflow(wallet: string, now: Date): number {
  return store.dailyOutflow[dayKey(wallet, now)] ?? 0;
}

export function addDailyOutflow(wallet: string, now: Date, amount: number): void {
  const key = dayKey(wallet, now);
  store.dailyOutflow[key] = (store.dailyOutflow[key] ?? 0) + amount;
  persist(store);
}

/** Test-only: resets the in-process store without touching the JSON file. */
export function __resetStoreForTests(): void {
  store = emptyStore();
}
