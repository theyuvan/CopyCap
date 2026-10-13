"use client";

import { useWallet } from "@/components/WalletProvider";

/** A plain wallet-address text input that auto-fills from the connected wallet when empty. */
export function WalletInput({
  name,
  defaultValue,
  className,
  placeholder = "0x...",
}: {
  name: string;
  defaultValue?: string;
  className?: string;
  placeholder?: string;
}) {
  const { address } = useWallet();
  return (
    <input
      name={name}
      defaultValue={defaultValue || address || ""}
      placeholder={placeholder}
      key={defaultValue || address || "empty"}
      className={className}
    />
  );
}
