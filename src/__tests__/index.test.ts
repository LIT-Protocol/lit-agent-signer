import { LitClient } from '../index';

describe('LitClient Integration Tests', () => {
  let litClient: LitClient;

  beforeAll(async () => {
    // Ensure you have the environment variable set
    if (!process.env.LIT_PYTHON_SDK_PRIVATE_KEY) {
      throw new Error(
        'LIT_PYTHON_SDK_PRIVATE_KEY environment variable is required'
      );
    }

    litClient = new LitClient();
    // Wait for client to be ready
    await new Promise((resolve) => {
      const checkReady = () => {
        try {
          const { ready } = litClient.isReady();
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

  describe('Basic Operations', () => {
    it('should confirm client is ready', () => {
      const { ready } = litClient.isReady();
      expect(ready).toBe(true);
    });

    it('should execute JavaScript code', async () => {
      const result = await litClient.executeJs({
        code: `
          (async () => {
            return { result: "Hello from Lit Protocol!" };
          })()
        `,
        jsParams: {},
      });

      expect(result).toHaveProperty('result');
      expect(result.result).toBe('Hello from Lit Protocol!');
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
      const messageToSign = 'Hello, Lit Protocol!';
      const signResult = await litClient.sign({
        toSign: messageToSign,
      });

      expect(signResult).toBeDefined();
      expect(signResult.signature).toBeDefined();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid JavaScript execution', async () => {
      await expect(
        litClient.executeJs({
          code: 'invalid javascript code!!!',
          jsParams: {},
        })
      ).rejects.toThrow();
    }, 10000);

    it('should handle empty code execution', async () => {
      await expect(
        litClient.executeJs({
          code: '',
          jsParams: {},
        })
      ).rejects.toThrow('No code provided');
    });
  });
});
