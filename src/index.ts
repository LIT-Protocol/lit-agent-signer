const LitJsSdk = require("@lit-protocol/lit-node-client-nodejs");
const {
  LitNetwork,
  LIT_RPC,
  AuthMethodScope,
  AuthMethodType,
  ProviderType,
} = require("@lit-protocol/constants");
const ethers = require("ethers");
const {
  LitAbility,
  LitActionResource,
  LitPKPResource,
  createSiweMessage,
  generateAuthSig,
} = require("@lit-protocol/auth-helpers");
const { LitContracts } = require("@lit-protocol/contracts-sdk");
const { getSessionSigs } = require("./utils");

// Replace localStorage with a simple in-memory store if not in Node environment
let storage = typeof localStorage !== "undefined" ? localStorage : new Map();

export class LitClient {
  private litNodeClient: typeof LitJsSdk.LitNodeClientNodeJs | null = null;
  private ethersWallet: typeof ethers.Wallet | null = null;
  private pkp: any = null;

  /**
   * Initialize the SDK
   */
  constructor() {
    this.litNodeClient = new LitJsSdk.LitNodeClientNodeJs({
      litNetwork: LitNetwork.DatilDev,
    });
    this.litNodeClient.connect();

    this.ethersWallet = new ethers.Wallet(
      process.env.LIT_PYTHON_SDK_PRIVATE_KEY,
      new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
    );

    // Load PKP from storage if it exists
    const pkp =
      storage instanceof Map ? storage.get("pkp") : storage.getItem("pkp");
    if (pkp) {
      this.pkp = JSON.parse(pkp);
    }
  }

  /**
   * Check if the client is ready
   */
  isReady(): { ready: boolean } {
    if (!this.litNodeClient) {
      throw new Error("LitNodeClient not initialized");
    }
    try {
      return {
        ready: this.litNodeClient.ready,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to check ready status: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Execute JavaScript code
   */
  async executeJs({ code, jsParams }: { code: string; jsParams: any }) {
    if (!this.litNodeClient) {
      throw new Error("LitNodeClient not initialized");
    }
    try {
      if (!code) {
        throw new Error("No code provided");
      }

      const sessionSigs = await getSessionSigs(this);

      return await this.litNodeClient.executeJs({
        sessionSigs,
        code,
        jsParams,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to execute JS: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create a new wallet
   */
  async createWallet() {
    if (!this.litNodeClient || !this.ethersWallet) {
      throw new Error("Client not properly initialized");
    }

    const contractClient = new LitContracts({
      signer: this.ethersWallet,
      litNodeClient: this.litNodeClient,
      network: LitNetwork.DatilDev,
      debug: true,
    });
    await contractClient.connect();

    const toSign = await createSiweMessage({
      uri: "sdk://createWallet",
      expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
      resources: [
        {
          resource: new LitActionResource("*"),
          ability: LitAbility.LitActionExecution,
        },
        {
          resource: new LitPKPResource("*"),
          ability: LitAbility.PKPSigning,
        },
      ],
      walletAddress: this.ethersWallet.address,
      nonce: await this.litNodeClient.getLatestBlockhash(),
      litNodeClient: this.litNodeClient,
    });

    const authSig = await generateAuthSig({
      signer: this.ethersWallet,
      toSign,
    });

    const authMethod = {
      authMethodType: AuthMethodType.EthWallet,
      accessToken: JSON.stringify(authSig),
    };

    const mintInfo = await contractClient.mintWithAuth({
      authMethod: authMethod,
      scopes: [AuthMethodScope.SignAnything],
    });

    // Save to storage
    if (storage instanceof Map) {
      storage.set("pkp", JSON.stringify(mintInfo.pkp));
    } else {
      storage.setItem("pkp", JSON.stringify(mintInfo.pkp));
    }
    this.pkp = mintInfo.pkp;

    return mintInfo;
  }

  /**
   * Get the PKP
   */
  getPkp() {
    const pkp =
      storage instanceof Map ? storage.get("pkp") : storage.getItem("pkp");
    return pkp ? JSON.parse(pkp) : null;
  }

  /**
   * Sign a message
   */
  async sign({ toSign }: { toSign: string }) {
    if (!this.litNodeClient || !this.pkp) {
      throw new Error("Client not properly initialized or PKP not set");
    }

    const sessionSigs = await getSessionSigs(this);

    const signingResult = await this.litNodeClient.pkpSign({
      pubKey: this.pkp.publicKey,
      sessionSigs,
      toSign: ethers.utils.arrayify(toSign),
    });

    return { signature: signingResult };
  }
}
