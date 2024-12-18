import { LitClient } from '.';

import {
  LitAbility,
  LitActionResource,
  LitPKPResource,
  createSiweMessage,
  generateAuthSig,
} from '@lit-protocol/auth-helpers';

export async function getSessionSigs(litClient: LitClient) {
  if (!litClient.litNodeClient) {
    throw new Error('Lit Node Client not properly initialized');
  }
  if (!litClient.ethersWallet) {
    throw new Error('Ethers Wallet not properly initialized');
  }
  // get session sigs
  const sessionSigs = await litClient.litNodeClient.getSessionSigs({
    chain: 'ethereum',
    expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
    resourceAbilityRequests: [
      {
        resource: new LitActionResource('*'),
        ability: LitAbility.LitActionExecution,
      },
      {
        resource: new LitPKPResource('*'),
        ability: LitAbility.PKPSigning,
      },
    ],
    authNeededCallback: async ({
      uri,
      expiration,
      resourceAbilityRequests,
    }) => {
      const toSign = await createSiweMessage({
        uri,
        expiration,
        resources: resourceAbilityRequests,
        walletAddress: await litClient.ethersWallet!.getAddress(),
        nonce: await litClient.litNodeClient!.getLatestBlockhash(),
        litNodeClient: litClient.litNodeClient,
      });

      return await generateAuthSig({
        signer: litClient.ethersWallet!,
        toSign,
      });
    },
  });
  return sessionSigs;
}
