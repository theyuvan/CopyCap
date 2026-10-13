import type { Address } from "@mirrorcap/shared-types";
import type { PrivyPolicy } from "./policy.js";

export interface PrivyClientConfig {
  appId: string;
  appSecret: string;
  apiBase?: string;
}

export interface PrivyWallet {
  id: string;
  address: Address;
  chain_type: string;
  policy_ids: string[];
}

export interface PrivyPolicyRecord extends PrivyPolicy {
  id: string;
}

export interface PrivyLinkedAccount {
  type: string;
  address?: string;
  chain_type?: string;
  wallet_client_type?: string;
  connector_type?: string;
}

export interface PrivyUser {
  id: string;
  linked_accounts: PrivyLinkedAccount[];
}

export interface EvmTransaction {
  to: Address;
  data?: string;
  value?: string;
  gas_limit?: string;
  gas_price?: string;
  max_fee_per_gas?: string;
  max_priority_fee_per_gas?: string;
  nonce?: number;
  chain_id: number;
}

export class PrivyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PrivyApiError";
  }

  /** Privy's policy engine refused to sign — the request reached Privy but violated the wallet's policy. */
  get isPolicyViolation(): boolean {
    return (this.body as { code?: string } | undefined)?.code === "policy_violation";
  }
}

/** Thin client over Privy's REST API (wallets, policies, users). Auth is HTTP Basic with the app secret. */
export class PrivyClient {
  private readonly apiBase: string;
  private readonly authHeader: string;

  constructor(private readonly config: PrivyClientConfig) {
    this.apiBase = config.apiBase ?? "https://api.privy.io/v1";
    this.authHeader = `Basic ${Buffer.from(`${config.appId}:${config.appSecret}`).toString("base64")}`;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "privy-app-id": this.config.appId,
      "Content-Type": "application/json",
    };
    if (idempotencyKey) headers["privy-idempotency-key"] = idempotencyKey;

    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed: unknown = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const message =
        (parsed as { error?: string; message?: string } | undefined)?.error ??
        (parsed as { message?: string } | undefined)?.message ??
        text ??
        res.statusText;
      throw new PrivyApiError(`Privy ${method} ${path} failed (${res.status}): ${message}`, res.status, parsed);
    }
    return parsed as T;
  }

  createPolicy(policy: PrivyPolicy): Promise<PrivyPolicyRecord> {
    return this.request<PrivyPolicyRecord>("POST", "/policies", policy);
  }

  getPolicy(policyId: string): Promise<PrivyPolicyRecord> {
    return this.request<PrivyPolicyRecord>("GET", `/policies/${policyId}`);
  }

  updatePolicy(policyId: string, update: Pick<PrivyPolicy, "name" | "rules">): Promise<PrivyPolicyRecord> {
    return this.request<PrivyPolicyRecord>("PATCH", `/policies/${policyId}`, update);
  }

  /** `externalId` is write-once at Privy; with the idempotency key it makes retries return the same wallet. */
  createWallet(params: {
    displayName: string;
    externalId: string;
    policyIds: string[];
    idempotencyKey: string;
  }): Promise<PrivyWallet> {
    return this.request<PrivyWallet>(
      "POST",
      "/wallets",
      {
        chain_type: "ethereum",
        display_name: params.displayName.slice(0, 100),
        external_id: params.externalId,
        policy_ids: params.policyIds,
      },
      params.idempotencyKey,
    );
  }

  getWallet(walletId: string): Promise<PrivyWallet> {
    return this.request<PrivyWallet>("GET", `/wallets/${walletId}`);
  }

  /** Signs with the wallet's key inside Privy (after its policy allows it) and broadcasts. */
  async sendTransaction(walletId: string, tx: EvmTransaction): Promise<{ hash: string; transactionId?: string }> {
    const res = await this.request<{ data: { hash: string; transaction_id?: string } }>(
      "POST",
      `/wallets/${walletId}/rpc`,
      {
        method: "eth_sendTransaction",
        caip2: `eip155:${tx.chain_id}`,
        chain_type: "ethereum",
        params: { transaction: tx },
      },
    );
    if (!res?.data?.hash) throw new PrivyApiError("Privy returned no transaction hash.", 502, res);
    return { hash: res.data.hash, transactionId: res.data.transaction_id };
  }

  getUser(userId: string): Promise<PrivyUser> {
    return this.request<PrivyUser>("GET", `/users/${encodeURIComponent(userId)}`);
  }
}

/** Every EVM address the user has proven control of through Privy, embedded wallet first. */
export function ethereumWalletsOf(user: PrivyUser): Address[] {
  return user.linked_accounts
    .filter((a) => a.type === "wallet" && a.chain_type === "ethereum" && a.address)
    .sort((a, b) => Number(b.connector_type === "embedded") - Number(a.connector_type === "embedded"))
    .map((a) => a.address as Address);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
