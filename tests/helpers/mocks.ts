/**
 * @file tests/helpers/mocks.ts
 * Reusable factory helpers for unit tests — issue #140.
 *
 * Centralises mock creation so individual test files don't each have to
 * wire up a `SorobanRpc.Server`, `NetworkConfig`, and `VeriTixClient`.
 */

import { Keypair } from '@stellar/stellar-sdk';
import type { NetworkConfig } from '../../src/types/index';
import { VeriTixClient } from '../../src/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
/** Deterministic test secret — never use on real networks */
const TEST_SECRET = 'SCZANGBA5RLRPGKVK3GS4TNCG7SXALKVXBKEB7DRMU5G9CPMZRSGKF7';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Returns a jest-mocked `SorobanRpc.Server` with sensible defaults.
 * Pass `overrides` to change specific method implementations.
 */
export function createMockServer(overrides: Record<string, jest.Mock> = {}): jest.Mocked<any> {
  const defaults: Record<string, jest.Mock> = {
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
    simulateTransaction: jest.fn().mockResolvedValue({ result: null }),
    sendTransaction: jest.fn().mockResolvedValue({ hash: 'mock-hash', status: 'PENDING' }),
    getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 1000 }),
  };
  return { ...defaults, ...overrides };
}

/**
 * Returns a testnet `NetworkConfig` with a fake contract ID.
 * Pass `overrides` to change specific fields.
 */
export function createMockConfig(overrides: Partial<NetworkConfig> = {}): NetworkConfig {
  return {
    network: 'testnet',
    contractId: FAKE_CONTRACT,
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    ...overrides,
  };
}

/**
 * Returns a `VeriTixClient` with its internal server replaced by a mock,
 * so tests never hit the real RPC.
 * Pass `overrides` to change the mock server methods.
 */
export function createMockClient(
  overrides: Record<string, jest.Mock> = {},
): VeriTixClient {
  const config = createMockConfig();
  const client = new VeriTixClient(config);
  const mockServer = createMockServer(overrides);
  // Inject directly — mirrors the pattern used in client.test.ts
  (client as any).server = mockServer;
  (client as any).connected = true;
  (client as any).ledgerCache = { sequence: 1000, fetchedAt: Date.now() };
  return client;
}

/**
 * Returns a deterministic `Keypair` suitable for test assertions.
 * The keypair is always the same so tests can assert on its public key.
 */
export function createMockKeypair(): Keypair {
  return Keypair.fromSecret(TEST_SECRET);
}
