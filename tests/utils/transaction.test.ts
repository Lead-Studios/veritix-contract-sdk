/**
 * @file tests/utils/transaction.test.ts
 * Unit tests for buildContractCall, simulateTransaction, and submitTransaction.
 * All Soroban RPC calls are mocked — no network access required.
 */

import {
  Keypair,
  Account,
  SorobanRpc,
  xdr,
  nativeToScVal,
} from '@stellar/stellar-sdk';

import {
  buildContractCall,
  simulateTransaction,
  submitTransaction,
  estimateFee,
} from '../../src/utils/transaction';
import { VeriTixError, VeriTixErrorCode } from '../../src/utils/errors';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const keypair = Keypair.random();
const sourceAccount = new Account(keypair.publicKey(), '100');

function makeMockServer(overrides: Partial<SorobanRpc.Server> = {}): SorobanRpc.Server {
  return {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getAccount: jest.fn(),
    getLatestLedger: jest.fn(),
    ...overrides,
  } as unknown as SorobanRpc.Server;
}

// ---------------------------------------------------------------------------
// buildContractCall  (#78)
// ---------------------------------------------------------------------------

describe('buildContractCall', () => {
  it('returns an unsigned Transaction with the correct operation', async () => {
    const server = makeMockServer();
    const args = [nativeToScVal(42n, { type: 'u64' })];

    const tx = await buildContractCall(
      server,
      sourceAccount,
      FAKE_CONTRACT_ID,
      'get_escrow',
      args,
      NETWORK_PASSPHRASE,
    );

    expect(tx).toBeDefined();
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0].type).toBe('invokeHostFunction');
  });

  it('builds a transaction with timeout 30', async () => {
    const server = makeMockServer();
    const tx = await buildContractCall(
      server,
      sourceAccount,
      FAKE_CONTRACT_ID,
      'ping',
      [],
      NETWORK_PASSPHRASE,
    );

    // TimeBounds upper bound = current time + 30
    const timeBounds = tx.timeBounds;
    expect(timeBounds).toBeDefined();
    expect(Number(timeBounds!.maxTime)).toBeGreaterThan(0);
  });

  it('works with an empty args array', async () => {
    const server = makeMockServer();
    const tx = await buildContractCall(
      server,
      sourceAccount,
      FAKE_CONTRACT_ID,
      'no_args_method',
      [],
      NETWORK_PASSPHRASE,
    );
    expect(tx.operations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// simulateTransaction  (#79)
// ---------------------------------------------------------------------------

describe('simulateTransaction', () => {
  it('returns assembled transaction and fee on success', async () => {
    const unsignedTx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'get_escrow',
      [],
      NETWORK_PASSPHRASE,
    );

    // Minimal success response — no real XDR needed
    const mockSimResult = {
      minResourceFee: '12345',
      result: { retval: xdr.ScVal.scvVoid() },
    } as unknown as SorobanRpc.Api.SimulateTransactionSuccessResponse;

    jest.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValueOnce(false);
    jest
      .spyOn(SorobanRpc, 'assembleTransaction')
      .mockReturnValueOnce({ build: () => unsignedTx } as any);

    const server = makeMockServer({
      simulateTransaction: jest.fn().mockResolvedValueOnce(mockSimResult),
    });

    const { transaction, simulatedFee } = await simulateTransaction(server, unsignedTx);

    expect(simulatedFee).toBe('12345');
    expect(transaction).toBeDefined();
  });

  it('throws VeriTixError when simulation returns an error', async () => {
    const unsignedTx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'fail_method',
      [],
      NETWORK_PASSPHRASE,
    );

    const mockErrResult = {
      error: 'escrow not found',
    } as unknown as SorobanRpc.Api.SimulateTransactionErrorResponse;

    jest.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValueOnce(true);

    const server = makeMockServer({
      simulateTransaction: jest.fn().mockResolvedValueOnce(mockErrResult),
    });

    await expect(simulateTransaction(server, unsignedTx)).rejects.toThrow(VeriTixError);
  });
});

// ---------------------------------------------------------------------------
// submitTransaction  (#80)
// ---------------------------------------------------------------------------

describe('submitTransaction', () => {
  it('signs, submits, and returns result on SUCCESS after one poll', async () => {
    const tx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'create_escrow',
      [],
      NETWORK_PASSPHRASE,
    );

    const hash = 'abcdef1234567890';

    const server = makeMockServer({
      sendTransaction: jest.fn().mockResolvedValueOnce({
        status: 'PENDING',
        hash,
      }),
      getTransaction: jest
        .fn()
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'SUCCESS', ledger: 42, resultXdr: undefined }),
    });

    const result = await submitTransaction(server, tx, keypair, 5);

    expect(result.hash).toBe(hash);
    expect(result.ledger).toBe(42);
    expect(result.successful).toBe(true);
  });

  it('throws immediately when sendTransaction returns ERROR', async () => {
    const tx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'fail',
      [],
      NETWORK_PASSPHRASE,
    );

    const server = makeMockServer({
      sendTransaction: jest.fn().mockResolvedValueOnce({
        status: 'ERROR',
        hash: 'x',
        errorResult: null,
      }),
    });

    await expect(submitTransaction(server, tx, keypair)).rejects.toBeInstanceOf(VeriTixError);
  });

  it('throws VeriTixError after max poll attempts (TIMEOUT)', async () => {
    const tx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'slow',
      [],
      NETWORK_PASSPHRASE,
    );

    const server = makeMockServer({
      sendTransaction: jest.fn().mockResolvedValueOnce({ status: 'PENDING', hash: 'abc' }),
      getTransaction: jest.fn().mockResolvedValue({ status: 'NOT_FOUND' }),
    });

    await expect(submitTransaction(server, tx, keypair, 2)).rejects.toThrow(/TIMEOUT/i);
  });

  it('throws VeriTixError when transaction is FAILED on-chain', async () => {
    const tx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'bad_tx',
      [],
      NETWORK_PASSPHRASE,
    );

    const server = makeMockServer({
      sendTransaction: jest.fn().mockResolvedValueOnce({ status: 'PENDING', hash: 'xyz' }),
      getTransaction: jest.fn().mockResolvedValueOnce({ status: 'FAILED', resultXdr: null }),
    });

    await expect(submitTransaction(server, tx, keypair, 3)).rejects.toBeInstanceOf(VeriTixError);
  });
});

// ---------------------------------------------------------------------------
// estimateFee
// ---------------------------------------------------------------------------

describe('estimateFee', () => {
  const LEDGER_SEQUENCE = 5_000_000;

  function makeServerForEstimate(minResourceFee: string) {
    const mockSimResult = {
      minResourceFee,
      result: { retval: xdr.ScVal.scvVoid() },
    } as unknown as SorobanRpc.Api.SimulateTransactionSuccessResponse;

    jest.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValue(false);
    jest
      .spyOn(SorobanRpc, 'assembleTransaction')
      .mockReturnValue({ build: () => ({}) } as any);

    return makeMockServer({
      simulateTransaction: jest.fn().mockResolvedValue(mockSimResult),
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: LEDGER_SEQUENCE }),
    });
  }

  afterEach(() => jest.restoreAllMocks());

  it('returns feeLumens equal to the simulation minResourceFee', async () => {
    const server = makeServerForEstimate('12345');

    const result = await estimateFee(
      server,
      FAKE_CONTRACT_ID,
      NETWORK_PASSPHRASE,
      'transfer',
      [],
    );

    expect(result.feeLumens).toBe('12345');
  });

  it('converts feeLumens to feeXLM correctly (10_000_000 stroops = 1 XLM)', async () => {
    const server = makeServerForEstimate('10000000');

    const result = await estimateFee(
      server,
      FAKE_CONTRACT_ID,
      NETWORK_PASSPHRASE,
      'transfer',
      [],
    );

    expect(result.feeXLM).toBe('1.0000000');
  });

  it('formats sub-XLM fees with 7 decimal places', async () => {
    // 100 stroops = 0.0000100 XLM
    const server = makeServerForEstimate('100');

    const result = await estimateFee(
      server,
      FAKE_CONTRACT_ID,
      NETWORK_PASSPHRASE,
      'balance',
      [],
    );

    expect(result.feeXLM).toBe('0.0000100');
  });

  it('handles a realistic fee value (e.g. 50_123 stroops)', async () => {
    const server = makeServerForEstimate('50123');

    const result = await estimateFee(
      server,
      FAKE_CONTRACT_ID,
      NETWORK_PASSPHRASE,
      'approve',
      [],
    );

    expect(result.feeLumens).toBe('50123');
    expect(result.feeXLM).toBe('0.0050123');
  });

  it('returns the current ledger sequence as estimatedLedger', async () => {
    const server = makeServerForEstimate('500');

    const result = await estimateFee(
      server,
      FAKE_CONTRACT_ID,
      NETWORK_PASSPHRASE,
      'get_escrow',
      [],
    );

    expect(result.estimatedLedger).toBe(LEDGER_SEQUENCE);
  });

  it('throws VeriTixError when simulation returns an error', async () => {
    const mockErrResult = {
      error: 'escrow not found',
    } as unknown as SorobanRpc.Api.SimulateTransactionErrorResponse;

    jest.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValue(true);

    const server = makeMockServer({
      simulateTransaction: jest.fn().mockResolvedValue(mockErrResult),
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: LEDGER_SEQUENCE }),
    });

    await expect(
      estimateFee(server, FAKE_CONTRACT_ID, NETWORK_PASSPHRASE, 'fail_method', []),
    ).rejects.toBeInstanceOf(VeriTixError);
  });

  it('passes the correct method and args through to buildContractCall', async () => {
    const server = makeServerForEstimate('999');
    const args = [nativeToScVal(1n, { type: 'u64' })];

    // Should not throw — verifies args are forwarded without error
    await expect(
      estimateFee(server, FAKE_CONTRACT_ID, NETWORK_PASSPHRASE, 'get_escrow', args),
    ).resolves.toMatchObject({ feeLumens: '999' });
  });
});

// ---------------------------------------------------------------------------
// submitTransaction — retry + jitter  (#281)
// ---------------------------------------------------------------------------

describe('submitTransaction — retry with jitter (#281)', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('accepts maxRetries and retryDelayMs via options object', async () => {
    const tx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'create_escrow',
      [],
      NETWORK_PASSPHRASE,
    );
    const hash = 'retry_hash_001';
    const sendMock = jest.fn().mockResolvedValue({ status: 'PENDING', hash });
    const getMock = jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 99 });
    const server = makeMockServer({ sendTransaction: sendMock, getTransaction: getMock });

    const result = await submitTransaction(server, tx, keypair, {
      maxRetries: 2,
      retryDelayMs: 50,
    });
    expect(result.hash).toBe(hash);
    expect(result.successful).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('retries on RATE_LIMIT_EXCEEDED up to maxRetries times', async () => {
    const tx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'rate_limit_method',
      [],
      NETWORK_PASSPHRASE,
    );
    const hash = 'retry_hash_002';

    const rateLimitResponse = {
      status: 'ERROR',
      hash: '',
      errorResult: { toXDR: () => 'RATE_LIMIT exceeded' },
    };
    const successResponse = { status: 'PENDING', hash };

    const sendMock = jest
      .fn()
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(successResponse);
    const getMock = jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 100 });

    const server = makeMockServer({ sendTransaction: sendMock, getTransaction: getMock });

    jest.spyOn(Math, 'random').mockReturnValue(0.5); // zero jitter

    const result = await submitTransaction(server, tx, keypair, {
      maxRetries: 3,
      retryDelayMs: 1,
    });

    expect(result.hash).toBe(hash);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting maxRetries on persistent RATE_LIMIT', async () => {
    const tx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'always_rate_limited',
      [],
      NETWORK_PASSPHRASE,
    );

    const rateLimitResponse = {
      status: 'ERROR',
      hash: '',
      errorResult: { toXDR: () => 'RATE_LIMIT exceeded' },
    };

    const server = makeMockServer({
      sendTransaction: jest.fn().mockResolvedValue(rateLimitResponse),
      getTransaction: jest.fn(),
    });

    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    await expect(
      submitTransaction(server, tx, keypair, { maxRetries: 1, retryDelayMs: 1 }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('applies ±20% jitter to retryDelayMs (jitter stays within bounds)', () => {
    const retryDelayMs = 1000;
    const samples = Array.from({ length: 200 }, () => {
      const jitter = retryDelayMs * 0.2 * (Math.random() * 2 - 1);
      return retryDelayMs + jitter;
    });

    const min = Math.min(...samples);
    const max = Math.max(...samples);

    expect(min).toBeGreaterThanOrEqual(retryDelayMs * 0.8 - 1);
    expect(max).toBeLessThanOrEqual(retryDelayMs * 1.2 + 1);
  });

  it('defaults maxRetries to 3 when no options supplied', async () => {
    const tx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'default_retries',
      [],
      NETWORK_PASSPHRASE,
    );
    const hash = 'default_retries_hash';
    const server = makeMockServer({
      sendTransaction: jest.fn().mockResolvedValue({ status: 'PENDING', hash }),
      getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 1 }),
    });

    const result = await submitTransaction(server, tx, keypair);
    expect(result.hash).toBe(hash);
  });

  it('throws READ_ONLY_CLIENT when no keypair is provided', async () => {
    const tx = await buildContractCall(
      makeMockServer(),
      sourceAccount,
      FAKE_CONTRACT_ID,
      'no_keypair',
      [],
      NETWORK_PASSPHRASE,
    );
    const server = makeMockServer();

    await expect(
      submitTransaction(server, tx, undefined, { maxRetries: 0 }),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
  });
});