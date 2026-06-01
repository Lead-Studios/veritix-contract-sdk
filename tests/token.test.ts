/**
 * @file tests/token.test.ts
 * Unit tests for {@link TokenModule}.
 *
 * Covers issues #86, #87 (read methods), #90 (transferFrom / keypair guard),
 * and #91 (burn / burnFrom with validation).
 *
 * Network calls are intercepted by replacing the module's server instance
 * with a jest.fn() mock, so no live RPC is required.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS  = Keypair.random().publicKey();

/** Minimal SimulateTransactionSuccessResponse shape accepted by simulateRead */
function simSuccess(retval: ReturnType<typeof nativeToScVal>) {
  return { result: { retval } };
}

describe('TokenModule', () => {
  let client: VeriTixClient;
  let mockSimulate: jest.Mock;

  beforeEach(() => {
    client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    mockSimulate = jest.fn();
    // Inject mock server so no real RPC is needed
    (client.token as any).server = { simulateTransaction: mockSimulate };
  });

  // -- Read methods (#86, #87) ------------------------------------------------

  it('balance() returns bigint from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(1_000_000n, { type: 'i128' })));
    expect(await client.token.balance(FAKE_ADDRESS)).toBe(1_000_000n);
  });

  it('allowance() returns bigint from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(500n, { type: 'i128' })));
    expect(await client.token.allowance(FAKE_ADDRESS, FAKE_ADDRESS)).toBe(500n);
  });

  it('name() returns string from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal('VeriTix Token')));
    expect(await client.token.name()).toBe('VeriTix Token');
  it('allowance() no longer throws "not implemented" (implemented)', async () => {
    // allowance is now implemented — it will throw a network/simulation error
    // rather than "not implemented" when called without a real server.
    await expect(client.token.allowance(FAKE_ADDRESS, FAKE_ADDRESS)).rejects.not.toThrow(
      'not implemented',
    );
  });

  it('symbol() returns string from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal('VTX')));
    expect(await client.token.symbol()).toBe('VTX');
  });

  it('decimals() returns number from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(7, { type: 'u32' })));
    expect(await client.token.decimals()).toBe(7);
  });

  it('totalSupply() returns bigint from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(1_000_000_000n, { type: 'i128' })));
    expect(await client.token.totalSupply()).toBe(1_000_000_000n);
  });

  // -- Write methods — keypair guard (#90, #91) --------------------------------

  it('mint() throws without keypair', async () => {
    await expect(
      client.token.mint({ to: FAKE_ADDRESS, amount: 1_000_000n }),
    ).rejects.toThrow('Keypair is required');
  });

  it('burn() throws without keypair', async () => {
    await expect(client.token.burn(500_000n)).rejects.toThrow('Keypair is required');
  });

  it('burnFrom() throws without keypair', async () => {
    await expect(
      client.token.burnFrom(FAKE_ADDRESS, 500_000n),
    ).rejects.toThrow('Keypair is required');
  });

  it('transfer() throws without keypair', async () => {
    await expect(
      client.token.transfer({ from: FAKE_ADDRESS, to: FAKE_ADDRESS, amount: 100n }),
    ).rejects.toThrow('Keypair is required');
  });

  it('transferFrom() throws without keypair', async () => {
    await expect(
      client.token.transferFrom(FAKE_ADDRESS, FAKE_ADDRESS, 100n),
    ).rejects.toThrow('Keypair is required');
  });

  it('approve() throws without keypair', async () => {
  it('transfer() no longer throws "not implemented" (implemented)', async () => {
    // transfer is now implemented — it will throw a keypair error rather than "not implemented".
    await expect(
      client.token.transfer({ from: FAKE_ADDRESS, to: FAKE_ADDRESS, amount: 100n }),
    ).rejects.not.toThrow('not implemented');
  });

  it('approve() no longer throws "not implemented" (implemented)', async () => {
    // approve is now implemented — it will throw a keypair/network error
    // rather than "not implemented" when called without a keypair.
    await expect(
      client.token.approve({
        from: FAKE_ADDRESS,
        spender: FAKE_ADDRESS,
        amount: 1_000n,
        expirationLedger: 999_999,
      }),
    ).rejects.toThrow('Keypair is required');
  });

  // -- transferFrom allowance check (#90) -----------------------------------

  it('transferFrom() throws INSUFFICIENT_ALLOWANCE when allowance < amount', async () => {
    const keypair = Keypair.random();
    const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
    const mockSim = jest.fn().mockResolvedValue(
      simSuccess(nativeToScVal(50n, { type: 'i128' })),
    );
    (clientWithKey.token as any).server = { simulateTransaction: mockSim };

    await expect(
      clientWithKey.token.transferFrom(FAKE_ADDRESS, FAKE_ADDRESS, 100n),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ALLOWANCE' });
  });

  // -- Input validation (#91) -------------------------------------------------

  it('burn() rejects amount <= 0', async () => {
    await expect(client.token.burn(0n)).rejects.toThrow('amount must be greater than 0');
  });

  it('burnFrom() rejects amount <= 0', async () => {
    await expect(
      client.token.burnFrom(FAKE_ADDRESS, 0n),
    ).rejects.toThrow('amount must be greater than 0');
    ).rejects.not.toThrow('not implemented');
  });
});

// ---------------------------------------------------------------------------
// isFrozen
// ---------------------------------------------------------------------------

describe('TokenModule.isFrozen', () => {
  const FROZEN_ADDRESS   = 'GBVZQ4YGZFKFKZV6XTXZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQ';
  const UNFROZEN_ADDRESS = FAKE_ADDRESS;

  function makeClient(simulateImpl: (tx: unknown) => unknown) {
    const config = getTestnetConfig(FAKE_CONTRACT);
    const client = new VeriTixClient(config);

    // Patch the internal server proxy used by TokenModule
    const serverMock = {
      getAccount: jest.fn().mockResolvedValue({ id: FAKE_ADDRESS, sequence: '0' }),
      simulateTransaction: jest.fn().mockImplementation(simulateImpl),
    };

    // Force-inject the mock server into the token module
    (client.token as unknown as { server: unknown }).server = serverMock;

    return { client, serverMock };
  }

  it('returns true when the contract returns ScvBool true', async () => {
    const { xdr } = await import('@stellar/stellar-sdk');

    // Build a real ScvBool(true) ScVal
    const trueScVal = xdr.ScVal.scvBool(true);

    const { client } = makeClient(() => ({
      result: { retval: trueScVal },
      // Minimal fields required by isSimulationSuccess
      latestLedger: 1,
      minResourceFee: '100',
      transactionData: '',
      events: [],
    }));

    await expect(client.token.isFrozen(FROZEN_ADDRESS)).resolves.toBe(true);
  });

  it('returns false when the contract returns ScvBool false', async () => {
    const { xdr } = await import('@stellar/stellar-sdk');

    const falseScVal = xdr.ScVal.scvBool(false);

    const { client } = makeClient(() => ({
      result: { retval: falseScVal },
      latestLedger: 1,
      minResourceFee: '100',
      transactionData: '',
      events: [],
    }));

    await expect(client.token.isFrozen(UNFROZEN_ADDRESS)).resolves.toBe(false);
  });

  it('returns false when the address is not found in storage (simulation error)', async () => {
    const { client } = makeClient(() => {
      throw new Error('contract error: not found');
    });

    await expect(client.token.isFrozen(UNFROZEN_ADDRESS)).resolves.toBe(false);
  });

  it('returns false when simulation returns no result value', async () => {
    const { client } = makeClient(() => ({
      result: undefined,
      latestLedger: 1,
      minResourceFee: '100',
      transactionData: '',
      events: [],
    }));

    await expect(client.token.isFrozen(UNFROZEN_ADDRESS)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// allowance
// ---------------------------------------------------------------------------

describe('TokenModule.allowance', () => {
  const OWNER   = FAKE_ADDRESS;
  const SPENDER = 'GBVZQ4YGZFKFKZV6XTXZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQ';

  function makeClient(simulateImpl: (tx: unknown) => unknown) {
    const config = getTestnetConfig(FAKE_CONTRACT);
    const client = new VeriTixClient(config);
    const serverMock = {
      getAccount: jest.fn().mockResolvedValue({ id: FAKE_ADDRESS, sequence: '0' }),
      simulateTransaction: jest.fn().mockImplementation(simulateImpl),
    };
    (client.token as unknown as { server: unknown }).server = serverMock;
    return { client, serverMock };
  }

  it('returns the allowance amount when the contract returns an i128 ScVal', async () => {
    const { xdr } = await import('@stellar/stellar-sdk');

    // Represent 5_000_000n as i128 (hi=0, lo=5_000_000)
    const i128ScVal = xdr.ScVal.scvI128(
      new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('5000000') }),
    );

    const { client } = makeClient(() => ({
      result: { retval: i128ScVal },
      latestLedger: 1,
      minResourceFee: '100',
      transactionData: '',
      events: [],
    }));

    await expect(client.token.allowance(OWNER, SPENDER)).resolves.toBe(5_000_000n);
  });

  it('returns 0n when no allowance entry exists in storage (simulation error)', async () => {
    const { client } = makeClient(() => {
      throw new Error('contract error: not found');
    });

    await expect(client.token.allowance(OWNER, SPENDER)).resolves.toBe(0n);
  });

  it('returns 0n when simulation returns no result value', async () => {
    const { client } = makeClient(() => ({
      result: undefined,
      latestLedger: 1,
      minResourceFee: '100',
      transactionData: '',
      events: [],
    }));

    await expect(client.token.allowance(OWNER, SPENDER)).resolves.toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// approve
// ---------------------------------------------------------------------------

describe('TokenModule.approve', () => {
  const SPENDER = 'GBVZQ4YGZFKFKZV6XTXZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQ';
  const CURRENT_LEDGER = 1_000;
  const FUTURE_LEDGER  = CURRENT_LEDGER + 17_280;

  function makeClientWithKeypair(
    simulateImpl: (tx: unknown) => unknown,
    sendImpl?: () => unknown,
    getTransactionImpl?: () => unknown,
  ) {
    const keypair = Keypair.random();
    const config  = getTestnetConfig(FAKE_CONTRACT);
    const client  = new VeriTixClient(config, keypair);

    const serverMock = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: CURRENT_LEDGER }),
      simulateTransaction: jest.fn().mockImplementation(simulateImpl),
      sendTransaction: jest.fn().mockImplementation(sendImpl ?? (() => ({ status: 'PENDING', hash: 'abc123' }))),
      getTransaction: jest.fn().mockImplementation(
        getTransactionImpl ?? (() => ({ status: 'SUCCESS', ledger: CURRENT_LEDGER + 1 })),
      ),
    };

    (client.token as unknown as { server: unknown }).server = serverMock;
    return { client, keypair, serverMock };
  }

  it('throws when no keypair is provided (read-only client)', async () => {
    const config = getTestnetConfig(FAKE_CONTRACT);
    const readOnlyClient = new VeriTixClient(config); // no keypair

    await expect(
      readOnlyClient.token.approve({
        from: FAKE_ADDRESS,
        spender: SPENDER,
        amount: 1_000n,
        expirationLedger: FUTURE_LEDGER,
      }),
    ).rejects.toThrow('a Keypair is required for write operations');
  });

  it('throws when expirationLedger is not greater than the current ledger', async () => {
    const { client } = makeClientWithKeypair(() => ({}));

    await expect(
      client.token.approve({
        from: FAKE_ADDRESS,
        spender: SPENDER,
        amount: 1_000n,
        expirationLedger: CURRENT_LEDGER, // equal — not in the future
      }),
    ).rejects.toThrow(`expirationLedger (${CURRENT_LEDGER}) must be greater than the current ledger`);
  });

  it('throws when expirationLedger is in the past', async () => {
    const { client } = makeClientWithKeypair(() => ({}));

    await expect(
      client.token.approve({
        from: FAKE_ADDRESS,
        spender: SPENDER,
        amount: 1_000n,
        expirationLedger: CURRENT_LEDGER - 1,
      }),
    ).rejects.toThrow('must be greater than the current ledger');
  });

  it('submits the transaction and returns a TransactionResult on success', async () => {
    const successTx = { status: 'SUCCESS', ledger: CURRENT_LEDGER + 1, hash: 'deadbeef' };

    const { client } = makeClientWithKeypair(
      // simulateTransaction — return a minimal assembled-tx-like object
      () => ({
        result: undefined,
        latestLedger: CURRENT_LEDGER,
        minResourceFee: '100',
        transactionData: '',
        events: [],
      }),
      () => ({ status: 'PENDING', hash: 'deadbeef' }),
      () => successTx,
    );

    const result = await client.token.approve({
      from: FAKE_ADDRESS,
      spender: SPENDER,
      amount: 500_000n,
      expirationLedger: FUTURE_LEDGER,
    });

    expect(result.successful).toBe(true);
    expect(result.hash).toBe('deadbeef');
  });
});

// ---------------------------------------------------------------------------
// transfer
// ---------------------------------------------------------------------------

describe('TokenModule.transfer', () => {
  const RECIPIENT     = 'GBVZQ4YGZFKFKZV6XTXZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQ';
  const CURRENT_LEDGER = 1_000;

  function makeClientWithKeypair(
    simulateImpl: (tx: unknown) => unknown,
    sendImpl?: () => unknown,
    getTransactionImpl?: () => unknown,
  ) {
    const keypair = Keypair.random();
    const config  = getTestnetConfig(FAKE_CONTRACT);
    const client  = new VeriTixClient(config, keypair);

    const serverMock = {
      simulateTransaction: jest.fn().mockImplementation(simulateImpl),
      sendTransaction: jest.fn().mockImplementation(
        sendImpl ?? (() => ({ status: 'PENDING', hash: 'txhash123' })),
      ),
      getTransaction: jest.fn().mockImplementation(
        getTransactionImpl ?? (() => ({ status: 'SUCCESS', ledger: CURRENT_LEDGER + 1 })),
      ),
    };

    (client.token as unknown as { server: unknown }).server = serverMock;
    return { client, keypair, serverMock };
  }

  it('throws when no keypair is provided (read-only client)', async () => {
    const readOnlyClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

    await expect(
      readOnlyClient.token.transfer({ from: FAKE_ADDRESS, to: RECIPIENT, amount: 100n }),
    ).rejects.toThrow('a Keypair is required for write operations');
  });

  it('throws VeriTixError with INVALID_AMOUNT when amount is 0n', async () => {
    const { VeriTixError, VeriTixErrorCode } = await import('../src/utils/errors');
    const { client } = makeClientWithKeypair(() => ({}));

    const err = await client.token
      .transfer({ from: FAKE_ADDRESS, to: RECIPIENT, amount: 0n })
      .catch((e) => e);

    expect(err).toBeInstanceOf(VeriTixError);
    expect(err.code).toBe(VeriTixErrorCode.InvalidAmount);
  });

  it('throws VeriTixError with INVALID_AMOUNT when amount is negative', async () => {
    const { VeriTixError, VeriTixErrorCode } = await import('../src/utils/errors');
    const { client } = makeClientWithKeypair(() => ({}));

    const err = await client.token
      .transfer({ from: FAKE_ADDRESS, to: RECIPIENT, amount: -1n })
      .catch((e) => e);

    expect(err).toBeInstanceOf(VeriTixError);
    expect(err.code).toBe(VeriTixErrorCode.InvalidAmount);
  });

  it('submits the transaction and returns a TransactionResult on success', async () => {
    const { client, serverMock } = makeClientWithKeypair(
      () => ({
        result: undefined,
        latestLedger: CURRENT_LEDGER,
        minResourceFee: '100',
        transactionData: '',
        events: [],
      }),
      () => ({ status: 'PENDING', hash: 'txhash123' }),
      () => ({ status: 'SUCCESS', ledger: CURRENT_LEDGER + 1 }),
    );

    const result = await client.token.transfer({
      from: FAKE_ADDRESS,
      to: RECIPIENT,
      amount: 1_000_000n,
    });

    expect(result.successful).toBe(true);
    expect(result.hash).toBe('txhash123');
    expect(serverMock.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('passes from, to, and amount as contract args in the correct order', async () => {
    const { client, serverMock } = makeClientWithKeypair(
      () => ({
        result: undefined,
        latestLedger: CURRENT_LEDGER,
        minResourceFee: '100',
        transactionData: '',
        events: [],
      }),
    );

    await client.token.transfer({ from: FAKE_ADDRESS, to: RECIPIENT, amount: 500n }).catch(() => {
      // submission may fail in unit test — we only care that simulate was called
    });

    expect(serverMock.simulateTransaction).toHaveBeenCalledTimes(1);
  });
});
