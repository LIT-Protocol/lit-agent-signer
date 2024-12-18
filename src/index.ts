import * as LitJsSdk from '@lit-protocol/lit-node-client-nodejs';
import {
  LitNetwork,
  LIT_RPC,
  AuthMethodScope,
  AuthMethodType,
  LIT_ABILITY,
} from '@lit-protocol/constants';
import { ethers } from 'ethers';
import {
  LitActionResource,
  LitPKPResource,
  createSiweMessage,
  generateAuthSig,
} from '@lit-protocol/auth-helpers';
import { LitContracts } from '@lit-protocol/contracts-sdk';
import {
  ExecuteJsResponse,
  LIT_NETWORKS_KEYS,
  MintWithAuthResponse,
  SigResponse,
} from '@lit-protocol/types';
import { getSessionSigs } from './utils';
import { LocalStorage } from 'node-localstorage';
// @ts-expect-error we are trying to inject a global
global.localStorage = new LocalStorage('./lit-session-storage');
// @ts-expect-error assigning the global to a local variable
const localStorage = global.localStorage as LocalStorage;

export class LitClient {
  litNodeClient: LitJsSdk.LitNodeClientNodeJs | null = null;
  ethersWallet: ethers.Wallet | null = null;
  private pkp: MintWithAuthResponse<ethers.ContractReceipt>['pkp'] | null =
    null;

  /**
   * Initialize the SDK
   * @param authKey The authentication key
   * @returns A Promise that resolves to a new LitClient instance
   */
  static async create(
    authKey: string,
    {
      litNetwork = LitNetwork.DatilDev,
      debug = false,
    }: {
      litNetwork?: LIT_NETWORKS_KEYS;
      debug?: boolean;
    } = {}
  ): Promise<LitClient> {
    const client = new LitClient();
    client.litNodeClient = new LitJsSdk.LitNodeClientNodeJs({
      litNetwork,
      debug,
    });
    await client.litNodeClient.connect();

    client.ethersWallet = new ethers.Wallet(
      authKey,
      new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
    );

    // Load PKP from storage if it exists
    const pkp = localStorage.getItem('pkp');
    if (pkp) {
      client.pkp = JSON.parse(
        pkp
      ) as MintWithAuthResponse<ethers.ContractReceipt>['pkp'];
    }

    return client;
  }

  private constructor() {}

  /**
   * Check if the client is ready
   */
  isReady(): boolean {
    if (!this.litNodeClient) {
      throw new Error('LitNodeClient not initialized');
    }
    return this.litNodeClient.ready;
  }

  /**
   * Execute JavaScript code
   */
  async executeJs({
    code,
    jsParams,
  }: {
    code: string;
    jsParams: object;
  }): Promise<ExecuteJsResponse> {
    if (!this.litNodeClient) {
      throw new Error('LitNodeClient not initialized');
    }
    try {
      if (!code) {
        throw new Error('No code provided');
      }

      const sessionSigs = await getSessionSigs(this);

      return this.litNodeClient.executeJs({
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
  async createWallet(): Promise<MintWithAuthResponse<ethers.ContractReceipt>> {
    if (!this.litNodeClient || !this.ethersWallet) {
      throw new Error('Client not properly initialized');
    }

    const contractClient = new LitContracts({
      signer: this.ethersWallet,
      network: this.litNodeClient.config.litNetwork,
      debug: this.litNodeClient.config.debug,
    });
    await contractClient.connect();

    const toSign = await createSiweMessage({
      uri: 'sdk://createWallet',
      expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
      resources: [
        {
          resource: new LitActionResource('*'),
          ability: LIT_ABILITY.LitActionExecution,
        },
        {
          resource: new LitPKPResource('*'),
          ability: LIT_ABILITY.PKPSigning,
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
    localStorage.setItem('pkp', JSON.stringify(mintInfo.pkp));
    this.pkp = mintInfo.pkp;
    return mintInfo;
  }

  /**
   * Get the PKP
   */
  getPkp() {
    const pkp = localStorage.getItem('pkp');
    return pkp
      ? (JSON.parse(pkp) as MintWithAuthResponse<ethers.ContractReceipt>['pkp'])
      : null;
  }

  /**
   * Sign a message
   */
  async sign({ toSign }: { toSign: string }): Promise<SigResponse> {
    if (!this.litNodeClient || !this.pkp) {
      throw new Error('Client not properly initialized or PKP not set');
    }

    const sessionSigs = await getSessionSigs(this);

    const signingResult = await this.litNodeClient.pkpSign({
      pubKey: this.pkp.publicKey,
      sessionSigs,
      toSign: ethers.utils.arrayify(toSign),
    });

    return signingResult;
  }

  /**
   * Disconnect the client and cleanup
   */
  async disconnect() {
    if (this.litNodeClient) {
      await this.litNodeClient.disconnect();
    }
  }
}
