/**
 * @file tests/client.fromenv.test.ts
 * Unit tests for {@link VeriTixClient.fromEnvironment} (issue #157).
 */

import { VeriTixClient } from '../src/client';
import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';
import { MAINNET_PASSPHRASE, TESTNET_PASSPHRASE } from '../src/utils/network';
import { createMockKeypair } from './helpers/mocks';

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const VALID_TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';

describe('VeriTixClient.fromEnvironment', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('with minimum env (testnet defaults)', () => {
    it('returns a VeriTixClient configured for testnet', () => {
      const c = VeriTixClient.fromEnvironment({ VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID });
      expect(c).toBeInstanceOf(VeriTixClient);
      expect(c.config.network).toBe('testnet');
      expect(c.config.contractId).toBe(FAKE_CONTRACT_ID);
      expect(c.config.networkPassphrase).toBe(TESTNET_PASSPHRASE);
      expect(c.config.rpcUrl).toBe(VALID_TESTNET_RPC_URL);
    });

    it('is read-only when no secret is supplied', () => {
      const c = VeriTixClient.fromEnvironment({ VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID });
      expect(c.isReadOnly()).toBe(true);
    });

    it('trims whitespace around VERITIX_CONTRACT_ID', () => {
      const c = VeriTixClient.fromEnvironment({
        VERITIX_CONTRACT_ID: `  ${FAKE_CONTRACT_ID}  `,
      });
      expect(c.config.contractId).toBe(FAKE_CONTRACT_ID);
    });
  });

  describe('with mainnet env', () => {
    it('selects the mainnet network defaults', () => {
      const c = VeriTixClient.fromEnvironment({
        VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID,
        STELLAR_NETWORK: 'mainnet',
      });
      expect(c.config.network).toBe('mainnet');
      expect(c.config.networkPassphrase).toBe(MAINNET_PASSPHRASE);
      expect(c.config.contractId).toBe(FAKE_CONTRACT_ID);
    });

    it('accepts the STELLAR_NETWORK value in mixed case', () => {
      const c = VeriTixClient.fromEnvironment({
        VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID,
        STELLAR_NETWORK: 'MainNet',
      });
      expect(c.config.network).toBe('mainnet');
    });
  });

  describe('with secret key', () => {
    it('attaches a Keypair so the client is no longer read-only', () => {
      const secret = createMockKeypair().secret();
      const c = VeriTixClient.fromEnvironment({
        VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID,
        VERITIX_SECRET_KEY: secret,
      });
      expect(c.isReadOnly()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Overrides
  // -------------------------------------------------------------------------

  describe('overrides', () => {
    it('uses VERITIX_RPC_URL instead of the network default', () => {
      const customRpc = 'https://my-private-rpc.example.com';
      const c = VeriTixClient.fromEnvironment({
        VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID,
        VERITIX_RPC_URL: customRpc,
      });
      expect(c.config.rpcUrl).toBe(customRpc);
    });

    it('uses VERITIX_NETWORK_PASSPHRASE instead of the network default', () => {
      const customPassphrase = 'Standalone Network ; February 2025';
      const c = VeriTixClient.fromEnvironment({
        VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID,
        VERITIX_NETWORK_PASSPHRASE: customPassphrase,
      });
      expect(c.config.networkPassphrase).toBe(customPassphrase);
    });

    it('treats empty-string overrides as "not set" and keeps the network default', () => {
      const c = VeriTixClient.fromEnvironment({
        VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID,
        VERITIX_RPC_URL: '',
        VERITIX_NETWORK_PASSPHRASE: '',
      });
      expect(c.config.rpcUrl).toBe(VALID_TESTNET_RPC_URL);
      expect(c.config.networkPassphrase).toBe(TESTNET_PASSPHRASE);
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation failures', () => {
    it('throws VeriTixError if VERITIX_CONTRACT_ID is missing', () => {
      expect(() => VeriTixClient.fromEnvironment({})).toThrow(VeriTixError);
      expect(() => VeriTixClient.fromEnvironment({})).toThrow(/VERITIX_CONTRACT_ID/);
    });

    it('throws VeriTixError with InvalidAddress if VERITIX_CONTRACT_ID is whitespace', () => {
      try {
        VeriTixClient.fromEnvironment({ VERITIX_CONTRACT_ID: '   ' });
        fail('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(VeriTixError);
        expect((err as VeriTixError).code).toBe(VeriTixErrorCode.InvalidAddress);
      }
    });

    it('throws VeriTixError when STELLAR_NETWORK is not testnet or mainnet', () => {
      try {
        VeriTixClient.fromEnvironment({
          VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID,
          STELLAR_NETWORK: 'fakenet',
        });
        fail('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(VeriTixError);
        expect((err as VeriTixError).code).toBe(VeriTixErrorCode.InvalidAddress);
        expect(String((err as Error).message)).toMatch(/STELLAR_NETWORK/);
      }
    });

    it('throws VeriTixError when VERITIX_SECRET_KEY is malformed', () => {
      try {
        VeriTixClient.fromEnvironment({
          VERITIX_CONTRACT_ID: FAKE_CONTRACT_ID,
          VERITIX_SECRET_KEY: 'not-a-real-stellar-secret',
        });
        fail('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(VeriTixError);
        expect((err as VeriTixError).code).toBe(VeriTixErrorCode.InvalidAddress);
        expect(String((err as Error).message)).toMatch(/VERITIX_SECRET_KEY/);
      }
    });
  });
});
