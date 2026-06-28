/**
 * @file tests/recurring.test.ts
 * Unit tests for RecurringModule.executeAllDue() — issues #119 / #141.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { RecurringModule } from '../src/modules/recurring';

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
});
