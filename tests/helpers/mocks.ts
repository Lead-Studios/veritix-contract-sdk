/**
 * @file tests/helpers/mocks.ts
 * Reusable factory helpers for unit tests — issue #140.
 *
 * Centralises mock creation so individual test files don't each have to
 * wire up a `SorobanRpc.Server`, `NetworkConfig`, and `VeriTixClient`.
 */

import { Keypair, xdr } from '@stellar/stellar-sdk';
import type { SorobanRpc } from '@stellar/stellar-sdk';
import type { NetworkConfig } from '../../src/types/index';
import { VeriTixClient } from '../../src/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
/**
 * Deterministic test secret — never use on real networks.
 * Derived from a fixed all-`0x07` ed25519 seed, so the public key is always
 * GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57.
 */
const TEST_SECRET = 'SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X';

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

// ---------------------------------------------------------------------------
// Issue #3 — canonical `make*` factories
//
// These are the names test files should reach for. They wrap the `create*`
// factories above (kept for the existing call-sites) and add helpers for the
// two mock shapes every write/read test needs: a successful transaction
// round-trip, and a simulation that returns a specific ScVal.
// ---------------------------------------------------------------------------

/**
 * Returns a jest-mocked `SorobanRpc.Server`.
 *
 * Defaults are the happy path: a ledger at sequence 1000, an empty simulation
 * result, and a transaction that is accepted and confirmed. Override any
 * method per-test with `server.simulateTransaction.mockResolvedValue(...)`.
 */
export function makeMockServer(
  overrides: Record<string, jest.Mock> = {},
): jest.Mocked<SorobanRpc.Server> {
  return createMockServer(overrides) as unknown as jest.Mocked<SorobanRpc.Server>;
}

/**
 * Returns a deterministic `Keypair` — the same public key on every call, so
 * tests can assert against it directly.
 */
export function makeMockKeypair(): Keypair {
  return createMockKeypair();
}

/**
 * Returns a `VeriTixClient` that is already "connected" (mock server injected,
 * `connected` flag set, ledger cache warm) and able to sign.
 *
 * @param keypair - Signer to attach. Defaults to {@link makeMockKeypair}.
 */
export function makeConnectedClient(keypair: Keypair = makeMockKeypair()): VeriTixClient {
  const client = new VeriTixClient(createMockConfig(), keypair);
  attachMockServer(client, makeMockServer());
  return client;
}

/**
 * Returns a connected `VeriTixClient` with **no** keypair, so write operations
 * throw `VeriTixErrorCode.ReadOnlyClient`.
 */
export function makeReadOnlyClient(): VeriTixClient {
  const client = new VeriTixClient(createMockConfig());
  attachMockServer(client, makeMockServer());
  return client;
}

/**
 * Points a mock server at a transaction that is accepted (`PENDING`) and then
 * confirmed (`SUCCESS`) on the next poll.
 */
export function mockSuccessfulTransaction(server: jest.Mocked<SorobanRpc.Server>): void {
  const s = server as unknown as Record<string, jest.Mock>;
  s.sendTransaction.mockResolvedValue({ hash: 'mock-hash', status: 'PENDING' });
  s.getTransaction.mockResolvedValue({
    status: 'SUCCESS',
    hash: 'mock-hash',
    ledger: 1000,
    returnValue: xdr.ScVal.scvVoid(),
  });
}

/**
 * Points a mock server's `simulateTransaction` at a specific return value,
 * shaped the way `SorobanRpc.Api.SimulateTransactionSuccessResponse` is read
 * by the SDK's transaction helpers.
 */
export function mockSimulationResult(
  server: jest.Mocked<SorobanRpc.Server>,
  returnValue: xdr.ScVal,
): void {
  const s = server as unknown as Record<string, jest.Mock>;
  s.simulateTransaction.mockResolvedValue({
    result: { retval: returnValue, auth: [] },
    transactionData: {},
    minResourceFee: '100',
    latestLedger: 1000,
  });
}

/**
 * Injects a mock server into a client and marks it connected.
 * Mirrors the field-injection pattern used across the existing test files.
 */
function attachMockServer(client: VeriTixClient, server: jest.Mocked<SorobanRpc.Server>): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (client as any).server = server;
  (client as any).connected = true;
  (client as any).ledgerCache = { sequence: 1000, fetchedAt: Date.now() };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
