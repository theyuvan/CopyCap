import { ethers } from "ethers";

/**
 * An ethers.Signer for the Kuru SDK that never holds a key: the SDK's
 * `sendTransaction` calls are forwarded to `submit`, which hands the
 * transaction to an external signer (a Privy server wallet) that signs and
 * broadcasts it. Local signing is deliberately unsupported.
 */
export interface RelayTransaction {
  to: string;
  data?: string;
  value?: ethers.BigNumber;
  gasLimit?: ethers.BigNumber;
  gasPrice?: ethers.BigNumber;
  maxFeePerGas?: ethers.BigNumber;
  maxPriorityFeePerGas?: ethers.BigNumber;
  nonce?: number;
}

export type TxSubmitFn = (tx: RelayTransaction) => Promise<{ hash: string }>;

export class RelaySigner extends ethers.Signer {
  private readonly address: string;
  private readonly submit: TxSubmitFn;

  constructor(address: string, provider: ethers.providers.Provider, submit: TxSubmitFn) {
    super();
    this.address = address;
    this.submit = submit;
    // ethers v5 declares `provider` readonly on the base class; this is how subclasses set it.
    Object.defineProperty(this, "provider", {
      value: provider,
      enumerable: true,
      configurable: true,
      writable: false,
    });
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async signTransaction(): Promise<string> {
    throw new Error("RelaySigner never signs locally; transactions are signed by the external wallet.");
  }

  async signMessage(): Promise<string> {
    throw new Error("RelaySigner never signs locally; transactions are signed by the external wallet.");
  }

  connect(provider: ethers.providers.Provider): RelaySigner {
    return new RelaySigner(this.address, provider, this.submit);
  }

  override async sendTransaction(
    transaction: ethers.utils.Deferrable<ethers.providers.TransactionRequest>,
  ): Promise<ethers.providers.TransactionResponse> {
    const tx = await ethers.utils.resolveProperties(transaction);
    if (!tx.to) throw new Error("RelaySigner only relays calls to an existing contract or address.");

    const big = (v: ethers.BigNumberish | undefined) => (v === undefined || v === null ? undefined : ethers.BigNumber.from(v));
    const { hash } = await this.submit({
      to: tx.to,
      data: tx.data === undefined ? undefined : ethers.utils.hexlify(tx.data),
      value: big(tx.value),
      gasLimit: big(tx.gasLimit),
      gasPrice: big(tx.gasPrice),
      maxFeePerGas: big(tx.maxFeePerGas),
      maxPriorityFeePerGas: big(tx.maxPriorityFeePerGas),
      nonce: tx.nonce === undefined ? undefined : ethers.BigNumber.from(tx.nonce).toNumber(),
    });
    const provider = this.provider as ethers.providers.Provider;

    return {
      hash,
      from: this.address,
      confirmations: 0,
      nonce: 0,
      gasLimit: ethers.BigNumber.from(0),
      value: big(tx.value) ?? ethers.BigNumber.from(0),
      data: "0x",
      chainId: 0,
      // Matches ethers' own behaviour: a reverted transaction rejects instead of resolving.
      wait: async (confirmations?: number) => {
        const receipt = await provider.waitForTransaction(hash, confirmations ?? 1);
        if (receipt.status === 0) {
          throw Object.assign(new Error(`Transaction ${hash} reverted on-chain.`), { receipt, code: "CALL_EXCEPTION" });
        }
        return receipt;
      },
    } as unknown as ethers.providers.TransactionResponse;
  }
}
