import { ethers } from "ethers";

/**
 * Bridges the real Kuru SDK (which expects an ethers.Signer to call
 * `.sendTransaction()` on) to MetaMask Agent Wallet's policy-gated
 * `wallet-submit` path — WITHOUT ever holding a private key.
 *
 * Kuru's IOC.placeMarket / GTC.placeLimit build calldata via
 * `orderbook.interface.encodeFunctionData(...)`, then call
 * `signer.sendTransaction(tx)` and `receipt = await tx.wait(1)`. This class
 * intercepts exactly that call and forwards the populated `{to, data, value}`
 * to the caller-supplied `submit` function, which — inside the agent-plugin —
 * is `ctx.walletExecutor(io, "<command-id>")`. `signTransaction` and
 * `signMessage` are deliberately unimplemented: nothing in this process is
 * allowed to produce a raw signature.
 */
export type TxSubmitFn = (tx: ethers.utils.Deferrable<ethers.providers.TransactionRequest>) => Promise<{
  hash: string;
}>;

export class AgentWalletSigner extends ethers.Signer {
  private readonly address: string;
  private readonly submit: TxSubmitFn;

  constructor(address: string, provider: ethers.providers.Provider, submit: TxSubmitFn) {
    super();
    this.address = address;
    this.submit = submit;
    // ethers v5 declares `provider` as readonly on the base class; this is
    // the standard way subclasses outside the ethers package set it.
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
    throw new Error(
      "AgentWalletSigner never signs locally. Submission and signing happen inside MetaMask Agent Wallet via wallet-submit.",
    );
  }

  async signMessage(): Promise<string> {
    throw new Error("AgentWalletSigner never signs locally; use MetaMask Agent Wallet.");
  }

  connect(provider: ethers.providers.Provider): AgentWalletSigner {
    return new AgentWalletSigner(this.address, provider, this.submit);
  }

  override async sendTransaction(
    transaction: ethers.utils.Deferrable<ethers.providers.TransactionRequest>,
  ): Promise<ethers.providers.TransactionResponse> {
    const { hash } = await this.submit(transaction);
    const provider = this.provider as ethers.providers.JsonRpcProvider;

    return {
      hash,
      from: this.address,
      confirmations: 0,
      nonce: 0,
      gasLimit: ethers.BigNumber.from(0),
      value: ethers.BigNumber.from(0),
      data: "0x",
      chainId: 0,
      wait: async (confirmations?: number) => provider.waitForTransaction(hash, confirmations ?? 1),
    } as unknown as ethers.providers.TransactionResponse;
  }
}
