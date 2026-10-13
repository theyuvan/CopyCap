"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { PrivyProvider, usePrivy, useSendTransaction } from "@privy-io/react-auth";

interface WalletContextValue {
  address: string | null;
  /** Email or social handle the user signed in with, if any. */
  label: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Bearer token for API calls that act on the user's behalf. */
  getAccessToken: () => Promise<string>;
  /** Sends a Monad testnet transaction from the user's Privy embedded wallet, with Privy's confirmation UI. */
  sendTransaction: (tx: { to: string; data?: string; value?: bigint; description: string }) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export const MONAD_TESTNET = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: { default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" } },
  testnet: true,
} as const;

function PrivyWalletBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { sendTransaction: privySend } = useSendTransaction();

  const address = authenticated ? (user?.wallet?.address ?? null) : null;
  const label = user?.email?.address ?? user?.google?.email ?? null;

  const getToken = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in to continue.");
    return token;
  }, [getAccessToken]);

  const sendTransaction = useCallback<WalletContextValue["sendTransaction"]>(
    async ({ to, data, value, description }) => {
      const { hash } = await privySend(
        { to, data: data as `0x${string}` | undefined, value, chainId: MONAD_TESTNET.id },
        { uiOptions: { description }, address: address ?? undefined },
      );
      return hash;
    },
    [privySend, address],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      label,
      connecting: !ready,
      error: null,
      connect: async () => login(),
      disconnect: () => void logout(),
      getAccessToken: getToken,
      sendTransaction,
    }),
    [address, label, ready, login, logout, getToken, sendTransaction],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function MissingPrivyConfig({ children }: { children: React.ReactNode }) {
  const value = useMemo<WalletContextValue>(
    () => ({
      address: null,
      label: null,
      connecting: false,
      error: "Sign-in unavailable: NEXT_PUBLIC_PRIVY_APP_ID is not set.",
      connect: async () => {},
      disconnect: () => {},
      getAccessToken: async () => {
        throw new Error("Sign-in unavailable: NEXT_PUBLIC_PRIVY_APP_ID is not set.");
      },
      sendTransaction: async () => {
        throw new Error("Sign-in unavailable: NEXT_PUBLIC_PRIVY_APP_ID is not set.");
      },
    }),
    [],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Privy sign-in: email or Google get an embedded wallet created on first
 * login (requires "Create wallets on login" enabled for Ethereum in the
 * Privy dashboard's embedded-wallet settings); "wallet" lets someone connect
 * an existing wallet (e.g. MetaMask) directly, using that wallet's own
 * address as their identity instead.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <MissingPrivyConfig>{children}</MissingPrivyConfig>;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["wallet", "email", "google"],
        appearance: { theme: "dark", accentColor: "#d4ff72" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: MONAD_TESTNET,
        supportedChains: [MONAD_TESTNET],
      }}
    >
      <PrivyWalletBridge>{children}</PrivyWalletBridge>
    </PrivyProvider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
