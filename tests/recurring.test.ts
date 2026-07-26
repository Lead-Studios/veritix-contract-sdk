/**
 * @file tests/recurring.test.ts
 * Unit tests for RecurringModule.executeAllDue() — issues #119 / #141.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { RecurringModule } from '../src/modules/recurring';
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_PAYER    = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('RecurringModule', () => {
  let client: VeriTixClient;
  let recurring: RecurringModule;

  beforeEach(() => {
    client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    recurring = client.recurring;
    jest.restoreAllMocks();
  });

  describe('pauseRecurring()', () => {
    it('throws ReadOnlyClient when no keypair', async () => {
      await expect(recurring.pauseRecurring(1n)).rejects.toThrow('signing keypair required');
    });

    it('returns tx result on success', async () => {
      const kp = Keypair.random();
      const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), kp);
      const mockServer = { simulateTransaction: jest.fn(), sendTransaction: jest.fn(), getTransaction: jest.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).server = mockServer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).connected = true;

      const fakeTx = { sign: jest.fn().mockReturnValue([]) };
      mockServer.simulateTransaction.mockResolvedValue({
        status: 'SUCCESS',
        result: { retval: undefined },
      });
      mockServer.sendTransaction.mockResolvedValue({ hash: 'txhash', status: 'PENDING' });
      mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS', successful: true, ledger: 42 });

      const result = await c.recurring.pauseRecurring(5n);
      expect(result.successful).toBe(true);
      expect(result.hash).toBe('txhash');
    });
  });

  describe('resumeRecurring()', () => {
    it('throws ReadOnlyClient when no keypair', async () => {
      await expect(recurring.resumeRecurring(1n)).rejects.toThrow('signing keypair required');
    });

    it('returns tx result on success', async () => {
      const kp = Keypair.random();
      const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), kp);
      const mockServer = { simulateTransaction: jest.fn(), sendTransaction: jest.fn(), getTransaction: jest.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).server = mockServer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).connected = true;

      mockServer.simulateTransaction.mockResolvedValue({
        status: 'SUCCESS',
        result: { retval: undefined },
      });
      mockServer.sendTransaction.mockResolvedValue({ hash: 'txhash2', status: 'PENDING' });
      mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS', successful: true, ledger: 43 });

      const result = await c.recurring.resumeRecurring(5n);
      expect(result.successful).toBe(true);
      expect(result.hash).toBe('txhash2');
    });
  });

  describe('executeAllDue()', () => {
    it('returns empty arrays when no recurring payments exist', async () => {
      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result).toEqual({ executed: [], skipped: [], failed: [] });
    });

    it('skips inactive IDs', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([1n]);
      jest.spyOn(recurring as any, 'getRecurring').mockResolvedValue({
        id: 1n, payer: FAKE_PAYER, payee: 'GXYZ', amount: 100n,
        interval: 100, active: false, lastChargedLedger: 0,
      });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.skipped).toEqual([1n]);
      expect(result.executed).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('adds to executed when execute() succeeds', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([2n]);
      jest.spyOn(recurring as any, 'getRecurring').mockResolvedValue({
        id: 2n, payer: FAKE_PAYER, payee: 'GXYZ', amount: 100n,
        interval: 100, active: true, lastChargedLedger: 0,
      });
      jest.spyOn(recurring, 'execute').mockResolvedValue({ hash: 'abc', ledger: 1, successful: true });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.executed).toEqual([2n]);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('adds to failed when execute() throws', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([3n]);
      jest.spyOn(recurring as any, 'getRecurring').mockResolvedValue({
        id: 3n, payer: FAKE_PAYER, payee: 'GXYZ', amount: 100n,
        interval: 100, active: true, lastChargedLedger: 0,
      });
      jest.spyOn(recurring, 'execute').mockRejectedValue(new Error('interval not elapsed'));

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.failed).toEqual([3n]);
      expect(result.executed).toEqual([]);
    });

    it('handles mixed executed/skipped/failed in one call', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([1n, 2n, 3n]);
      jest.spyOn(recurring as any, 'getRecurring').mockImplementation(async (id: unknown) => ({
        id: id as bigint, payer: FAKE_PAYER, payee: 'GXYZ', amount: 100n,
        interval: 100, active: (id as bigint) !== 1n, lastChargedLedger: 0,
      }));
      jest.spyOn(recurring, 'execute').mockImplementation(async (id: bigint) => {
        if (id === 3n) throw new Error('fail');
        return { hash: 'x', ledger: 1, successful: true };
      });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.skipped).toEqual([1n]);
      expect(result.executed).toEqual([2n]);
      expect(result.failed).toEqual([3n]);
    });

    // --- Tests mocking isExecutable directly (issue #141) ---

    it('all payments due → all executed, failed: []', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([10n, 11n]);
      jest.spyOn(recurring as any, 'isExecutable').mockResolvedValue(true);
      jest.spyOn(recurring, 'execute').mockResolvedValue({ hash: 'h', ledger: 1, successful: true });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.executed).toEqual([10n, 11n]);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('some not due (isExecutable === false) → correctly skipped', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([20n, 21n]);
      jest.spyOn(recurring as any, 'isExecutable').mockImplementation(async (id: unknown) =>
        (id as bigint) === 20n,
      );
      jest.spyOn(recurring, 'execute').mockResolvedValue({ hash: 'h', ledger: 1, successful: true });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.executed).toEqual([20n]);
      expect(result.skipped).toEqual([21n]);
      expect(result.failed).toEqual([]);
    });
  });

  describe('transferPayer()', () => {
    it('throws ReadOnlyClient when no keypair', async () => {
      await expect(recurring.transferPayer(1n, 'GNEW')).rejects.toThrow('signing keypair required');
  describe('amendRecurring()', () => {
    it('throws ReadOnlyClient when no keypair', async () => {
      await expect(recurring.amendRecurring(1n, 100n, 100)).rejects.toThrow('signing keypair required');
    });

    it('returns tx result on success', async () => {
      const kp = Keypair.random();
      const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), kp);
      const mockServer = { simulateTransaction: jest.fn(), sendTransaction: jest.fn(), getTransaction: jest.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).server = mockServer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).connected = true;

      mockServer.simulateTransaction.mockResolvedValue({
        status: 'SUCCESS',
        result: { retval: undefined },
      });
      mockServer.sendTransaction.mockResolvedValue({ hash: 'transfer-hash', status: 'PENDING' });
      mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS', successful: true, ledger: 55 });

      const result = await c.recurring.transferPayer(3n, 'GNEWPAYER');
      expect(result.successful).toBe(true);
      expect(result.hash).toBe('transfer-hash');
      mockServer.sendTransaction.mockResolvedValue({ hash: 'amend-hash', status: 'PENDING' });
      mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS', successful: true, ledger: 50 });

      const result = await c.recurring.amendRecurring(2n, 500n, 3600);
      expect(result.successful).toBe(true);
      expect(result.hash).toBe('amend-hash');
    });
  });
});

// ---------------------------------------------------------------------------
// #263 — RecurringModule.amendRecurring and transferPayer
// ---------------------------------------------------------------------------

import { Keypair } from '@stellar/stellar-sdk';
import * as transactionUtils from '../src/utils/transaction';
import type { RecurringRecord } from '../src/types/index';

function makeRecurringClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn().mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: undefined },
    }),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
  };
  (client as any).server = mockServer;
  (client as any).connected = true;
  return { client, mockServer };
}

function makeRecurringRecord(overrides: Partial<RecurringRecord> = {}): RecurringRecord {
  return {
    id: 1n,
    payer: FAKE_PAYER,
    payee: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    amount: 1_000_000n,
    interval: 100,
    active: true,
    lastChargedLedger: 0,
    ...overrides,
  };
}

describe('RecurringModule.amendRecurring', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('throws when neither amount nor interval is provided', async () => {
    const { client } = makeRecurringClient(Keypair.random());
    await expect(client.recurring.amendRecurring(1n, {})).rejects.toThrow(
      'at least one of amount or interval must be provided',
    );
  });

  it('throws when no keypair is supplied', async () => {
    const { client } = makeRecurringClient();
    await expect(
      client.recurring.amendRecurring(1n, { amount: 2_000_000n }),
    ).rejects.toThrow('signing keypair required');
  });

  it('succeeds when only amount is updated', async () => {
    const keypair = Keypair.random();
    const { client } = makeRecurringClient(keypair);
    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue({} as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'amend-hash',
      ledger: 10,
      successful: true,
    });

    const result = await client.recurring.amendRecurring(1n, { amount: 2_000_000n });
    expect(result.hash).toBe('amend-hash');
    expect(result.successful).toBe(true);
    const buildMock = transactionUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe('amend_recurring');
  });

  it('succeeds when only interval is updated', async () => {
    const keypair = Keypair.random();
    const { client } = makeRecurringClient(keypair);
    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue({} as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'amend-interval-hash',
      ledger: 11,
      successful: true,
    });

    const result = await client.recurring.amendRecurring(1n, { interval: 200 });
    expect(result.hash).toBe('amend-interval-hash');
    const buildMock = transactionUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe('amend_recurring');
  });

  it('succeeds when both amount and interval are updated', async () => {
    const keypair = Keypair.random();
    const { client } = makeRecurringClient(keypair);
    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue({} as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'amend-both-hash',
      ledger: 12,
      successful: true,
    });

    const result = await client.recurring.amendRecurring(1n, {
      amount: 3_000_000n,
      interval: 300,
    });
    expect(result.hash).toBe('amend-both-hash');
  });
});

describe('RecurringModule.transferPayer', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('throws when no keypair is supplied', async () => {
    const { client } = makeRecurringClient();
    await expect(
      client.recurring.transferPayer(1n, 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
    ).rejects.toThrow('signing keypair required');
  });

  it('throws when new payer is the same as the current payer', async () => {
    const keypair = Keypair.random();
    const { client } = makeRecurringClient(keypair);
    await expect(
      client.recurring.transferPayer(1n, keypair.publicKey()),
    ).rejects.toThrow('new payer must differ from the current payer');
  });

  it('throws when the recurring payment is inactive', async () => {
    const keypair = Keypair.random();
    const { client } = makeRecurringClient(keypair);
    jest
      .spyOn(client.recurring, 'getRecurring')
      .mockResolvedValue(makeRecurringRecord({ active: false }));

    await expect(
      client.recurring.transferPayer(1n, 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
    ).rejects.toThrow('recurring payment is inactive');
  });

  it('succeeds when both payer auth is present and payment is active', async () => {
    const keypair = Keypair.random();
    const newPayerAddr = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
    const { client } = makeRecurringClient(keypair);
    jest
      .spyOn(client.recurring, 'getRecurring')
      .mockResolvedValue(makeRecurringRecord({ active: true }));
    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue({} as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'transfer-payer-hash',
      ledger: 20,
      successful: true,
    });

    const result = await client.recurring.transferPayer(1n, newPayerAddr);
    expect(result.hash).toBe('transfer-payer-hash');
    expect(result.successful).toBe(true);
    const buildMock = transactionUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe('transfer_payer');
  });
});
