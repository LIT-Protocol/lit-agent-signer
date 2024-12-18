import { LitClient } from '../index';

describe('LitClient Integration Tests', () => {
  let litClient: LitClient;

  beforeAll(async () => {
    // Ensure you have the environment variable set
    if (!process.env.LIT_AUTH_KEY) {
      throw new Error('LIT_AUTH_KEY environment variable is required');
    }

    litClient = await LitClient.create(process.env.LIT_AUTH_KEY!);
    // Wait for client to be ready
    await new Promise((resolve) => {
      const checkReady = () => {
        try {
          const ready = litClient.isReady();
          if (ready) {
            resolve(true);
          } else {
            setTimeout(checkReady, 500);
          }
        } catch (e) {
          setTimeout(checkReady, 500);
        }
      };
      checkReady();
    });
  }, 30000); // Increased timeout for network operations

  afterAll(async () => {
    if (litClient) {
      await litClient.disconnect();
    }
  });

  describe('Basic Operations', () => {
    it('should confirm client is ready', () => {
      const ready = litClient.isReady();
      expect(ready).toBe(true);
    });

    it('should execute JavaScript code', async () => {
      const result = await litClient.executeJs({
        code: `
          (async () => {
            Lit.Actions.setResponse({"response": "Hello from Lit Protocol!" });
          })()
        `,
        jsParams: {},
      });

      expect(result).toHaveProperty('response');
      expect(result.response).toBe('Hello from Lit Protocol!');
    }, 10000);
  });

  describe('Wallet Operations', () => {
    it('should create a wallet and sign a message', async () => {
      // Create a new wallet
      const walletInfo = await litClient.createWallet();
      expect(walletInfo).toBeDefined();
      expect(walletInfo.pkp).toBeDefined();
      expect(walletInfo.pkp.publicKey).toBeDefined();

      // Verify PKP is stored
      const storedPkp = litClient.getPkp();
      expect(storedPkp).toBeDefined();
      expect(storedPkp.publicKey).toBe(walletInfo.pkp.publicKey);

      // Sign a message
      const messageToSign =
        '0x8111e78458fec7fb123fdfe3c559a1f7ae33bf21bf81d1bad589e9422c648cbd';
      const signResult = await litClient.sign({
        toSign: messageToSign,
      });

      expect(signResult).toBeDefined();
      expect(signResult.signature).toBeDefined();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid JavaScript execution', async () => {
      await expect(async () => {
        // we have to do this crazy try catch rethrow thing
        // because the lit client throws an error that is not an instance of Error
        // and jest does not handle it well
        try {
          await litClient.executeJs({
            code: 'invalid javascript code!!!',
            jsParams: {},
          });
        } catch (error) {
          throw new Error(JSON.stringify(error));
        }
      }).rejects.toThrow(
        '{"message":"There was an error getting the signing shares from the nodes","errorCode":"unknown_error"}'
      );
    }, 10000);
  });
});
