/**
 * @file tests/utils/transaction.test.ts
 * Unit tests for submitTransaction polling and hash verification.
 * All Soroban RPC calls are mocked — no network access required.
 */

import { Account, Keypair, SorobanRpc } from '@stellar/stellar-sdk';

import { buildContractCall, submitTransaction } from '../../src/utils/transaction';
import { VeriTixError, VeriTixErrorCode } from '../../src/utils/errors';

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

async function buildTx(method: string) {
  return buildContractCall(
    makeMockServer(),
    sourceAccount,
    FAKE_CONTRACT_ID,
    method,
    [],
    NETWORK_PASSPHRASE,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// submitTransaction — polling behaviour (#478)
// ---------------------------------------------------------------------------

describe('submitTransaction', () => {
  it('throws immediately on a FAILED poll result without retrying', async () => {
    const tx = await buildTx('create_escrow');
    const hash = Buffer.from(tx.hash()).toString('hex');

    const getTransaction = jest
      .fn()
      .mockResolvedValue({ status: 'FAILED', ledger: 42, resultXdr: null });
    const server = makeMockServer({
      sendTransaction: jest.fn().mockResolvedValue({ status: 'PENDING', hash }),
      getTransaction,
    });

    await expect(submitTransaction(server, tx, keypair)).rejects.toBeInstanceOf(VeriTixError);
    expect(getTransaction).toHaveBeenCalledTimes(1);
  });

  it('retries on NOT_FOUND then succeeds on SUCCESS', async () => {
    const tx = await buildTx('create_escrow');
    const hash = Buffer.from(tx.hash()).toString('hex');

    const server = makeMockServer({
      sendTransaction: jest.fn().mockResolvedValue({ status: 'PENDING', hash }),
      getTransaction: jest
        .fn()
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'SUCCESS', ledger: 42 }),
    });

    const result = await submitTransaction(server, tx, keypair, { maxPollAttempts: 5 });

    expect(result.hash).toBe(hash);
    expect(result.ledger).toBe(42);
    expect(result.successful).toBe(true);
    expect(server.getTransaction).toHaveBeenCalledTimes(2);
  });

  it('throws TIMEOUT after MAX_POLL_ATTEMPTS', async () => {
    const tx = await buildTx('slow_method');
    const hash = Buffer.from(tx.hash()).toString('hex');

    const server = makeMockServer({
      sendTransaction: jest.fn().mockResolvedValue({ status: 'PENDING', hash }),
      getTransaction: jest.fn().mockResolvedValue({ status: 'NOT_FOUND' }),
    });

    await expect(
      submitTransaction(server, tx, keypair, { maxPollAttempts: 2 }),
    ).rejects.toThrow(/TIMEOUT/i);
    expect(server.getTransaction).toHaveBeenCalledTimes(2);
  });

  it('throws UnexpectedTransactionHash when the RPC returns a different hash', async () => {
    const tx = await buildTx('create_escrow');
    const server = makeMockServer({
      sendTransaction: jest
        .fn()
        .mockResolvedValue({ status: 'PENDING', hash: '0'.repeat(64) }),
    });

    await expect(submitTransaction(server, tx, keypair)).rejects.toMatchObject({
      code: VeriTixErrorCode.UnexpectedTransactionHash,
    });
    expect(server.getTransaction).not.toHaveBeenCalled();
  });

  it('throws READ_ONLY_CLIENT when no keypair is provided', async () => {
    const tx = await buildTx('create_escrow');
    const server = makeMockServer();

    await expect(submitTransaction(server, tx, undefined)).rejects.toMatchObject({
      code: VeriTixErrorCode.ReadOnlyClient,
    });
  });

  it('retries on RATE_LIMIT_EXCEEDED before succeeding', async () => {
    const tx = await buildTx('rate_limited_method');
    const hash = Buffer.from(tx.hash()).toString('hex');

    const rateLimitResponse = {
      status: 'ERROR',
      hash: '',
      errorResult: { toXDR: () => 'RATE_LIMIT exceeded' },
    };
    const pendingResponse = { status: 'PENDING', hash };

    const sendTransaction = jest
      .fn()
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(pendingResponse);
    const getTransaction = jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 100 });

    const server = makeMockServer({ sendTransaction, getTransaction });
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // zero jitter

    const result = await submitTransaction(server, tx, keypair, {
      maxRetries: 2,
      retryDelayMs: 1,
    });

    expect(result.hash).toBe(hash);
    expect(result.successful).toBe(true);
    expect(sendTransaction).toHaveBeenCalledTimes(2);
  });
});