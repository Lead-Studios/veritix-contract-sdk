/**
 * @file tests/recurring.test.ts
 * Unit tests for RecurringModule.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { RecurringModule } from '../src/modules/recurring';
import { Keypair, xdr } from '@stellar/stellar-sdk';
import * as transactionUtils from '../src/utils/transaction';
import type { RecurringRecord } from '../src/types/index';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_PAYER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const OTHER_PAYEE = 'GCDFK2Z4PKLELHFCEYURU52FQAGHABXZBCHP3C4RXIY5ZXNKSXJSGS4J';

/**
 * Builds a minimal but valid raw Soroban simulation-success response that
 * `SorobanRpc.assembleTransaction` can consume during write-op tests.
 */
function rawSimSuccess(): any {
  const resources = new (xdr as any).SorobanResources({
    footprint: new (xdr as any).LedgerFootprint({ readOnly: [], readWrite: [] }),
    instructions: 0,
    readBytes: 0,
    writeBytes: 0,
  });
  const sd = new (xdr as any).SorobanTransactionData({
    resources,
    resourceFee: xdr.Int64.fromString('0'),
    ext: (xdr as any).ExtensionPoint.fromXDR(Buffer.from([0, 0, 0, 0])),
  });
  return {
    id: '1',
    latestLedger: 100,
    transactionData: sd.toXDR('base64'),
    minResourceFee: '100',
    cost: { cpuInsns: '0', memBytes: '0' },
    results: [{ auth: [], xdr: xdr.ScVal.scvVoid().toXDR('base64') }],
  };
}

function makeRecurringClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn().mockResolvedValue(rawSimSuccess()),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

function makeRecurringRecord(overrides: Partial<RecurringRecord> = {}): RecurringRecord {
  return {
    id: 1n,
    payer: FAKE_PAYER,
    payee: OTHER_PAYEE,
    amount: 1_000_000n,
    interval: 100,
    active: true,
    paused: false,
    lastChargedLedger: 0,
    ...overrides,
  };
}

describe('RecurringModule', () => {
  let client: VeriTixClient;
  let recurring: RecurringModule;

  beforeEach(() => {
    client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    recurring = client.recurring;
    jest.restoreAllMocks();
  });

  // -- pauseRecurring (#421) ------------------------------------------------

  describe('pauseRecurring()', () => {
    it('throws ReadOnlyClient when no keypair is set', async () => {
      await expect(recurring.pauseRecurring(1n)).rejects.toThrow('signing keypair required');
    });

    it('invokes pause_recurring with the recurring id and returns the tx result', async () => {
      const keypair = Keypair.random();
      const { client: c } = makeRecurringClient(keypair);
      const buildSpy = jest.spyOn(transactionUtils, 'buildContractCall');
      jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
        hash: 'pause-hash',
        ledger: 30,
        successful: true,
      });

      const result = await c.recurring.pauseRecurring(5n);

      expect(result.successful).toBe(true);
      expect(result.hash).toBe('pause-hash');
      expect(buildSpy.mock.calls[0][3]).toBe('pause_recurring');
      const args = buildSpy.mock.calls[0][4] as xdr.ScVal[];
      expect(args[0].u64().toString()).toBe('5');
    });
  });

  // -- resumeRecurring (#421) -----------------------------------------------

  describe('resumeRecurring()', () => {
    it('throws ReadOnlyClient when no keypair is set', async () => {
      await expect(recurring.resumeRecurring(1n)).rejects.toThrow('signing keypair required');
    });

    it('invokes resume_recurring with the recurring id and returns the tx result', async () => {
      const keypair = Keypair.random();
      const { client: c } = makeRecurringClient(keypair);
      const buildSpy = jest.spyOn(transactionUtils, 'buildContractCall');
      jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
        hash: 'resume-hash',
        ledger: 32,
        successful: true,
      });

      const result = await c.recurring.resumeRecurring(9n);

      expect(result.successful).toBe(true);
      expect(result.hash).toBe('resume-hash');
      expect(buildSpy.mock.calls[0][3]).toBe('resume_recurring');
      const args = buildSpy.mock.calls[0][4] as xdr.ScVal[];
      expect(args[0].u64().toString()).toBe('9');
    });
  });

  // -- executeAllDue (#119 / #141) ------------------------------------------

  describe('executeAllDue()', () => {
    it('returns empty arrays when no recurring payments exist', async () => {
      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result).toEqual({ executed: [], skipped: [], failed: [] });
    });

    it('skips inactive IDs', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([1n]);
      jest
        .spyOn(recurring as any, 'getRecurring')
        .mockResolvedValue(makeRecurringRecord({ active: false }));

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.skipped).toEqual([1n]);
      expect(result.executed).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('adds to executed when execute() succeeds', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([2n]);
      jest
        .spyOn(recurring as any, 'getRecurring')
        .mockResolvedValue(makeRecurringRecord({ id: 2n, active: true }));
      jest
        .spyOn(recurring, 'execute')
        .mockResolvedValue({ hash: 'abc', ledger: 1, successful: true });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.executed).toEqual([2n]);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('adds to failed when execute() throws', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([3n]);
      jest
        .spyOn(recurring as any, 'getRecurring')
        .mockResolvedValue(makeRecurringRecord({ id: 3n, active: true }));
      jest.spyOn(recurring, 'execute').mockRejectedValue(new Error('interval not elapsed'));

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.failed).toEqual([3n]);
      expect(result.executed).toEqual([]);
    });

    it('handles mixed executed/skipped/failed in one call', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([1n, 2n, 3n]);
      jest
        .spyOn(recurring as any, 'getRecurring')
        .mockImplementation(async (id: unknown) =>
          makeRecurringRecord({ id: id as bigint, active: (id as bigint) !== 1n }),
        );
      jest.spyOn(recurring, 'execute').mockImplementation(async (id: bigint) => {
        if (id === 3n) throw new Error('fail');
        return { hash: 'x', ledger: 1, successful: true };
      });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.skipped).toEqual([1n]);
      expect(result.executed).toEqual([2n]);
      expect(result.failed).toEqual([3n]);
    });

    it('all payments due → all executed, failed: []', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([10n, 11n]);
      jest.spyOn(recurring as any, 'isExecutable').mockResolvedValue(true);
      jest
        .spyOn(recurring, 'execute')
        .mockResolvedValue({ hash: 'h', ledger: 1, successful: true });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.executed).toEqual([10n, 11n]);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('some not due (isExecutable === false) → correctly skipped', async () => {
      jest.spyOn(recurring as any, 'getRecurringByPayer').mockResolvedValue([20n, 21n]);
      jest
        .spyOn(recurring as any, 'isExecutable')
        .mockImplementation(async (id: unknown) => (id as bigint) === 20n);
      jest
        .spyOn(recurring, 'execute')
        .mockResolvedValue({ hash: 'h', ledger: 1, successful: true });

      const result = await recurring.executeAllDue(FAKE_PAYER);
      expect(result.executed).toEqual([20n]);
      expect(result.skipped).toEqual([21n]);
      expect(result.failed).toEqual([]);
    });
  });

  // -- amendRecurring (#263) ------------------------------------------------

  describe('amendRecurring()', () => {
    it('throws when neither amount nor interval is provided', async () => {
      const { client } = makeRecurringClient(Keypair.random());
      await expect(client.recurring.amendRecurring(1n, {})).rejects.toThrow(
        'at least one of amount or interval must be provided',
      );
    });

    it('throws when no keypair is supplied', async () => {
      const { client } = makeRecurringClient();
      await expect(client.recurring.amendRecurring(1n, { amount: 2_000_000n })).rejects.toThrow(
        'signing keypair required',
      );
    });

    it('succeeds when only amount is updated', async () => {
      const keypair = Keypair.random();
      const { client } = makeRecurringClient(keypair);
      const buildSpy = jest.spyOn(transactionUtils, 'buildContractCall');
      jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
        hash: 'amend-hash',
        ledger: 10,
        successful: true,
      });

      const result = await client.recurring.amendRecurring(1n, { amount: 2_000_000n });
      expect(result.hash).toBe('amend-hash');
      expect(result.successful).toBe(true);
      expect(buildSpy.mock.calls[0][3]).toBe('amend_recurring');
    });

    it('succeeds when only interval is updated', async () => {
      const keypair = Keypair.random();
      const { client } = makeRecurringClient(keypair);
      const buildSpy = jest.spyOn(transactionUtils, 'buildContractCall');
      jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
        hash: 'amend-interval-hash',
        ledger: 11,
        successful: true,
      });

      const result = await client.recurring.amendRecurring(1n, { interval: 200 });
      expect(result.hash).toBe('amend-interval-hash');
      expect(buildSpy.mock.calls[0][3]).toBe('amend_recurring');
    });

    it('succeeds when both amount and interval are updated', async () => {
      const keypair = Keypair.random();
      const { client } = makeRecurringClient(keypair);
      jest.spyOn(transactionUtils, 'buildContractCall');
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

  // -- transferPayer (#263) -------------------------------------------------

  describe('transferPayer()', () => {
    it('throws when no keypair is supplied', async () => {
      const { client } = makeRecurringClient();
      await expect(client.recurring.transferPayer(1n, OTHER_PAYEE)).rejects.toThrow(
        'signing keypair required',
      );
    });

    it('throws when new payer is the same as the current payer', async () => {
      const keypair = Keypair.random();
      const { client } = makeRecurringClient(keypair);
      await expect(client.recurring.transferPayer(1n, keypair.publicKey())).rejects.toThrow(
        'new payer must differ from the current payer',
      );
    });

    it('throws when the recurring payment is inactive', async () => {
      const keypair = Keypair.random();
      const { client } = makeRecurringClient(keypair);
      jest
        .spyOn(client.recurring, 'getRecurring')
        .mockResolvedValue(makeRecurringRecord({ active: false }));

      await expect(client.recurring.transferPayer(1n, OTHER_PAYEE)).rejects.toThrow(
        'recurring payment is inactive',
      );
    });

    it('succeeds when both payer auth is present and payment is active', async () => {
      const keypair = Keypair.random();
      const { client } = makeRecurringClient(keypair);
      jest
        .spyOn(client.recurring, 'getRecurring')
        .mockResolvedValue(makeRecurringRecord({ active: true }));
      const buildSpy = jest.spyOn(transactionUtils, 'buildContractCall');
      jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
        hash: 'transfer-payer-hash',
        ledger: 20,
        successful: true,
      });

      const result = await client.recurring.transferPayer(1n, OTHER_PAYEE);
      expect(result.hash).toBe('transfer-payer-hash');
      expect(result.successful).toBe(true);
      expect(buildSpy.mock.calls[0][3]).toBe('transfer_payer');
    });
  });
});

