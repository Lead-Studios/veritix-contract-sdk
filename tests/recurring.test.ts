/**
 * @file tests/recurring.test.ts
 * Unit tests for RecurringModule — executeAllDue(), amendRecurring(), transferPayer().
 * Issues #119 / #141 / #263 / #468 / #469.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { RecurringModule } from '../src/modules/recurring';
import { Keypair, xdr } from '@stellar/stellar-sdk';
import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';
import { scValToBigint, scValToNumber } from '../src/utils/scval';
import * as transactionUtils from '../src/utils/transaction';
import type { RecurringRecord } from '../src/types/index';

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

  // ---------------------------------------------------------------------
  // #468 — executeAllDue() categorisation stress testing
  // ---------------------------------------------------------------------
  describe('executeAllDue()', () => {
    it('returns all empty arrays when the payer has no recurring payments', async () => {
      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result).toEqual({ executed: [], skipped: [], failed: [] });
    });

    it('returns all empty arrays when payer string is empty', async () => {
      const result = await recurring.executeAllDue('');
      expect(result).toEqual({ executed: [], skipped: [], failed: [] });
    });

    it('categorises 100 IDs: 50 due executed, 50 not-due skipped, none failed', async () => {
      const ids = Array.from({ length: 100 }, (_, i) => BigInt(i + 1));
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue(ids);
      jest
        .spyOn(recurring as any, 'isExecutable')
        .mockImplementation(async (id: unknown) => (id as bigint) <= 50n);
      jest.spyOn(recurring, 'execute').mockResolvedValue({ hash: 'h', ledger: 1, successful: true });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.executed).toHaveLength(50);
      expect(result.skipped).toHaveLength(50);
      expect(result.failed).toHaveLength(0);
      expect(result.executed).toEqual(Array.from({ length: 50 }, (_, i) => BigInt(i + 1)));
      expect(result.skipped).toEqual(Array.from({ length: 50 }, (_, i) => BigInt(i + 51)));
    });

    it('adds IDs that throw RecurringIntervalNotElapsed to skipped, not failed', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([7n]);
      jest.spyOn(recurring as any, 'isExecutable').mockResolvedValue(true);
      jest.spyOn(recurring, 'execute').mockRejectedValue(
        new VeriTixError(VeriTixErrorCode.RecurringIntervalNotElapsed, 'interval not elapsed'),
      );

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.skipped).toEqual([7n]);
      expect(result.failed).toEqual([]);
      expect(result.executed).toEqual([]);
    });

    it('adds IDs that throw a network error to failed, not skipped', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([8n]);
      jest.spyOn(recurring as any, 'isExecutable').mockResolvedValue(true);
      jest.spyOn(recurring, 'execute').mockRejectedValue(new Error('network error'));

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.failed).toEqual([8n]);
      expect(result.skipped).toEqual([]);
      expect(result.executed).toEqual([]);
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
  });

  // ---------------------------------------------------------------------
  // #469 — amendRecurring()
  // ---------------------------------------------------------------------
  describe('amendRecurring()', () => {
    it('throws when neither amount nor interval is provided', async () => {
      const keypair = Keypair.random();
      const c = makeRecurringClient(keypair);
      await expect(c.client.recurring.amendRecurring(1n, {})).rejects.toThrow(
        'at least one of amount or interval must be provided',
      );
    });

    it('throws ReadOnlyClient when no keypair is supplied', async () => {
      const c = makeRecurringClient();
      await expect(
        c.client.recurring.amendRecurring(1n, { amount: 2_000_000n }),
      ).rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
    });

    it('submits only the amount arg when only newAmount is provided', async () => {
      const c = makeRecurringClient(Keypair.random());
      const buildMock = jest
        .spyOn(transactionUtils, 'buildContractCall')
        .mockRejectedValue(new Error('stop'));
      await expect(
        c.client.recurring.amendRecurring(1n, { amount: 2_000_000n }),
      ).rejects.toThrow('stop');

      expect(buildMock).toHaveBeenCalled();
      expect(buildMock.mock.calls[0][3]).toBe('amend_recurring');
      const args = buildMock.mock.calls[0][4] as xdr.ScVal[];
      expect(args).toHaveLength(2);
      expect(scValToBigint(args[0])).toBe(1n);
      expect(scValToBigint(args[1])).toBe(2_000_000n);
    });

    it('submits only the interval arg when only newInterval is provided', async () => {
      const c = makeRecurringClient(Keypair.random());
      const buildMock = jest
        .spyOn(transactionUtils, 'buildContractCall')
        .mockRejectedValue(new Error('stop'));
      await expect(c.client.recurring.amendRecurring(1n, { interval: 200 })).rejects.toThrow('stop');

      expect(buildMock).toHaveBeenCalled();
      expect(buildMock.mock.calls[0][3]).toBe('amend_recurring');
      const args = buildMock.mock.calls[0][4] as xdr.ScVal[];
      expect(args).toHaveLength(2);
      expect(scValToBigint(args[0])).toBe(1n);
      expect(scValToNumber(args[1])).toBe(200);
    });

    it('submits amount and interval args when both fields are provided', async () => {
      const c = makeRecurringClient(Keypair.random());
      const buildMock = jest
        .spyOn(transactionUtils, 'buildContractCall')
        .mockRejectedValue(new Error('stop'));
      await expect(
        c.client.recurring.amendRecurring(1n, { amount: 3_000_000n, interval: 300 }),
      ).rejects.toThrow('stop');

      expect(buildMock).toHaveBeenCalled();
      expect(buildMock.mock.calls[0][3]).toBe('amend_recurring');
      const args = buildMock.mock.calls[0][4] as xdr.ScVal[];
      expect(args).toHaveLength(3);
      expect(scValToBigint(args[0])).toBe(1n);
      expect(scValToBigint(args[1])).toBe(3_000_000n);
      expect(scValToNumber(args[2])).toBe(300);
    });
  });

  // ---------------------------------------------------------------------
  // transferPayer()
  // ---------------------------------------------------------------------
  describe('transferPayer()', () => {
    it('throws when no keypair is supplied', async () => {
      const c = makeRecurringClient();
      await expect(
        c.client.recurring.transferPayer(1n, 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
      ).rejects.toThrow('signing keypair required');
    });

    it('throws when new payer is the same as the current payer', async () => {
      const keypair = Keypair.random();
      const c = makeRecurringClient(keypair);
      await expect(c.client.recurring.transferPayer(1n, keypair.publicKey())).rejects.toThrow(
        'new payer must differ from the current payer',
      );
    });

    it('throws when the recurring payment is inactive', async () => {
      const c = makeRecurringClient(Keypair.random());
      jest
        .spyOn(c.client.recurring, 'getRecurring')
        .mockResolvedValue(makeRecurringRecord({ active: false }));

      await expect(
        c.client.recurring.transferPayer(1n, 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
      ).rejects.toThrow('recurring payment is inactive');
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecurringClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', result: { retval: undefined } }),
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
    paused: false,
    lastChargedLedger: 0,
    ...overrides,
  };
}
