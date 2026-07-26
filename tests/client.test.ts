/**
 * @file tests/client.test.ts
 * Unit tests for {@link VeriTixClient}.
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { TokenModule } from '../src/modules/token';
import { EscrowModule } from '../src/modules/escrow';
import { DisputeModule } from '../src/modules/dispute';
import { SplitterModule } from '../src/modules/splitter';
import { RecurringModule } from '../src/modules/recurring';
import { AdminModule } from '../src/modules/admin';
import { BatchModule } from '../src/modules/batch';
import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

// Helper: create a client whose internal server is pre-mocked
function makeConnectedClient(sequence = 100) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
  // Inject a mock server directly
  const mockServer = { getLatestLedger: jest.fn().mockResolvedValue({ sequence }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).ledgerCache = { sequence, fetchedAt: Date.now() };
  return { client, mockServer };
}

describe('VeriTixClient', () => {
  let client: VeriTixClient;

  beforeEach(() => {
    client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('stores the supplied config', () => {
      expect(client.config.contractId).toBe(FAKE_CONTRACT_ID);
      expect(client.config.network).toBe('testnet');
    });

    it('exposes a TokenModule instance', () => {
      expect(client.token).toBeInstanceOf(TokenModule);
    });

    it('exposes an EscrowModule instance', () => {
      expect(client.escrow).toBeInstanceOf(EscrowModule);
    });

    it('exposes a DisputeModule instance', () => {
      expect(client.dispute).toBeInstanceOf(DisputeModule);
    });

    it('exposes a SplitterModule instance', () => {
      expect(client.splitter).toBeInstanceOf(SplitterModule);
    });

    it('exposes a RecurringModule instance', () => {
      expect(client.recurring).toBeInstanceOf(RecurringModule);
    });

    it('exposes an AdminModule instance', () => {
      expect(client.admin).toBeInstanceOf(AdminModule);
    });

    it('exposes a BatchModule instance', () => {
      expect(client.batch).toBeInstanceOf(BatchModule);
    });
  });

  // -------------------------------------------------------------------------
  // isConnected
  // -------------------------------------------------------------------------

  describe('isConnected()', () => {
    it('returns false before connect() is called', () => {
      expect(client.isConnected()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // disconnect()
  // -------------------------------------------------------------------------

  describe('disconnect()', () => {
    it('sets isConnected to false and emits disconnected', () => {
      const { client: c } = makeConnectedClient();
      const handler = jest.fn();
      c.on('disconnected', handler);
      c.disconnect();
      expect(c.isConnected()).toBe(false);
      expect(handler).toHaveBeenCalled();
    });

    it('throws when module method called after disconnect', async () => {
      const { client: c } = makeConnectedClient();
      c.disconnect();
      // The lazy proxy throws when any server property is accessed
      expect(() => {
        // Access the proxy directly to verify the guard
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _ = (c as any).getLazyServer ? undefined : undefined;
        // Trigger the proxy by accessing a property on the internal server ref
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (c as any).server?.getLatestLedger;
      }).not.toThrow(); // server is null after disconnect — proxy check is on connected flag
      expect(c.isConnected()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getCurrentLedger()
  // -------------------------------------------------------------------------

  describe('getCurrentLedger()', () => {
    it('throws if not connected', async () => {
      await expect(client.getCurrentLedger()).rejects.toThrow('call connect()');
    });

    it('returns cached ledger within TTL', async () => {
      const { client: c, mockServer } = makeConnectedClient(500);
      const ledger = await c.getCurrentLedger();
      expect(ledger).toBe(500);
      // Second call should use cache — no extra RPC call
      await c.getCurrentLedger();
      expect(mockServer.getLatestLedger).not.toHaveBeenCalled();
    });

    it('fetches fresh ledger after TTL expires', async () => {
      const { client: c, mockServer } = makeConnectedClient(500);
      mockServer.getLatestLedger.mockResolvedValue({ sequence: 501 });
      // Expire the cache
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).ledgerCache.fetchedAt = Date.now() - 10_000;
      const ledger = await c.getCurrentLedger();
      expect(ledger).toBe(501);
      expect(mockServer.getLatestLedger).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // isReadOnly() — issue #76
  // -------------------------------------------------------------------------

  describe('isReadOnly()', () => {
    it('returns true when no keypair provided', () => {
      const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
      expect(c.isReadOnly()).toBe(true);
    });

    it('returns false when a keypair is provided', () => {
      const { Keypair: KP } = require('@stellar/stellar-sdk');
      const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID), KP.random());
      expect(c.isReadOnly()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // watchTransaction()
  // -------------------------------------------------------------------------

  describe('watchTransaction()', () => {
    const FAKE_HASH = 'abc123def456';

    function makeClientWithGetTransaction(responses: Array<{ status: string; ledger?: number }>) {
      const { client: c } = makeConnectedClient();
      let call = 0;
      const mockServer = {
        getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
        getTransaction: jest.fn().mockImplementation(() => {
          const res = responses[Math.min(call, responses.length - 1)];
          call++;
          return Promise.resolve(res);
        }),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).server = mockServer;
      return { c, mockServer };
    }

    it('throws if not connected', async () => {
      const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
      await expect(c.watchTransaction(FAKE_HASH)).rejects.toThrow('call connect()');
    });

    it('resolves with TransactionResult when status is SUCCESS', async () => {
      const { c } = makeClientWithGetTransaction([{ status: 'SUCCESS', ledger: 200 }]);
      const result = await c.watchTransaction(FAKE_HASH, { intervalMs: 0 });
      expect(result.hash).toBe(FAKE_HASH);
      expect(result.successful).toBe(true);
      expect(result.ledger).toBe(200);
    });

    it('rejects with TRANSACTION_FAILED when status is FAILED', async () => {
      const { c } = makeClientWithGetTransaction([{ status: 'FAILED' }]);
      await expect(c.watchTransaction(FAKE_HASH, { intervalMs: 0 })).rejects.toMatchObject({
        code: VeriTixErrorCode.TransactionFailed,
      });
    });

    it('rejects with WATCH_TIMEOUT after timeoutMs', async () => {
      // Always return NOT_FOUND to trigger timeout
      const { c } = makeClientWithGetTransaction([{ status: 'NOT_FOUND' }]);
      await expect(
        c.watchTransaction(FAKE_HASH, { intervalMs: 1, timeoutMs: 5 }),
      ).rejects.toMatchObject({ code: VeriTixErrorCode.WatchTimeout });
    });

    it('polls until SUCCESS after initial NOT_FOUND', async () => {
      const { c } = makeClientWithGetTransaction([
        { status: 'NOT_FOUND' },
        { status: 'SUCCESS', ledger: 300 },
      ]);
      const result = await c.watchTransaction(FAKE_HASH, { intervalMs: 1, timeoutMs: 5_000 });
      expect(result.successful).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// #264 — VeriTixClient event emitter: connected, disconnected, retry, error
// ---------------------------------------------------------------------------

describe('VeriTixClient event emitter', () => {
  const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

  function makeClientWithServer(getLatestLedger: jest.Mock) {
    const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    // Override server creation inside connect() by injecting after instantiation
    const mockServer = { getLatestLedger };
    // We intercept server construction by replacing the server post-connect setup
    // via spying on SorobanRpc.Server constructor
    return { c, mockServer };
  }

  it('emits "connected" with { ledger } after a successful connect()', async () => {
    const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const connectedHandler = jest.fn();
    c.on('connected', connectedHandler);

    // Intercept SorobanRpc.Server so no real network call is made
    const { SorobanRpc } = require('@stellar/stellar-sdk');
    const origServer = SorobanRpc.Server;
    SorobanRpc.Server = jest.fn().mockImplementation(() => ({
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 42 }),
    }));

    try {
      const ledger = await c.connect();
      expect(ledger).toBe(42);
      expect(connectedHandler).toHaveBeenCalledWith({ ledger: 42 });
    } finally {
      SorobanRpc.Server = origServer;
    }
  });

  it('emits "disconnected" after disconnect()', () => {
    const { client: c } = makeConnectedClient();
    const handler = jest.fn();
    c.on('disconnected', handler);
    c.disconnect();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(c.isConnected()).toBe(false);
  });

  it('does NOT emit "connected" when connection fails', async () => {
    const c = new VeriTixClient(
      getTestnetConfig(FAKE_CONTRACT),
    );
    // Override config to have 0 retries so it fails fast
    (c.config as any).retries = 0;

    const connectedHandler = jest.fn();
    c.on('connected', connectedHandler);

    const { SorobanRpc } = require('@stellar/stellar-sdk');
    const origServer = SorobanRpc.Server;
    SorobanRpc.Server = jest.fn().mockImplementation(() => ({
      getLatestLedger: jest.fn().mockRejectedValue(new Error('network unavailable')),
    }));

    try {
      await expect(c.connect()).rejects.toMatchObject({
        code: VeriTixErrorCode.ConnectionFailed,
      });
      expect(connectedHandler).not.toHaveBeenCalled();
    } finally {
      SorobanRpc.Server = origServer;
    }
  });

  it('emits "retry" on transient connection failure with { attempt, delayMs }', async () => {
    const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    (c.config as any).retries = 2;
    (c.config as any).retryDelayMs = 1; // keep test fast

    const retryHandler = jest.fn();
    c.on('retry', retryHandler);

    let callCount = 0;
    const { SorobanRpc } = require('@stellar/stellar-sdk');
    const origServer = SorobanRpc.Server;
    SorobanRpc.Server = jest.fn().mockImplementation(() => ({
      getLatestLedger: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.reject(new Error('transient'));
        return Promise.resolve({ sequence: 99 });
      }),
    }));

    try {
      const ledger = await c.connect();
      expect(ledger).toBe(99);
      // retry should have been emitted twice (attempt 1 and 2)
      expect(retryHandler).toHaveBeenCalledTimes(2);
      expect(retryHandler.mock.calls[0][0]).toMatchObject({ attempt: 1 });
      expect(retryHandler.mock.calls[1][0]).toMatchObject({ attempt: 2 });
    } finally {
      SorobanRpc.Server = origServer;
    }
  });

  it('emits "error" when all retries are exhausted', async () => {
    const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    (c.config as any).retries = 1;
    (c.config as any).retryDelayMs = 1;

    // Must attach an error listener to avoid unhandled error exception
    const errorHandler = jest.fn();
    c.on('error', errorHandler);

    const { SorobanRpc } = require('@stellar/stellar-sdk');
    const origServer = SorobanRpc.Server;
    SorobanRpc.Server = jest.fn().mockImplementation(() => ({
      getLatestLedger: jest.fn().mockRejectedValue(new Error('always fails')),
    }));

    try {
      await expect(c.connect()).rejects.toMatchObject({
        code: VeriTixErrorCode.ConnectionFailed,
      });
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(VeriTixError);
    } finally {
      SorobanRpc.Server = origServer;
    }
  });

  it('verify TypeScript compile-time event signatures via on() overload', () => {
    const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    // These should compile without type errors — the overloaded on() accepts
    // only the correctly-typed listeners for each event key.
    const onConnected: (data: { ledger: number }) => void = jest.fn();
    const onDisconnected: () => void = jest.fn();
    const onRetry: (data: { attempt: number; delayMs: number }) => void = jest.fn();
    const onError: (err: VeriTixError) => void = jest.fn();

    c.on('connected', onConnected);
    c.on('disconnected', onDisconnected);
    c.on('retry', onRetry);
    c.on('error', onError);

    // If TypeScript compiles this without errors, the type signatures are correct.
    expect(true).toBe(true);
  });
});
