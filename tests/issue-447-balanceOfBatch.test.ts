/**
 * @file tests/issue-447-balanceOfBatch.test.ts
 * Coverage for TokenModule.balanceOfBatch() — issue #447.
 */
import { Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const ADDR_A = Keypair.random().publicKey();
const ADDR_B = Keypair.random().publicKey();

function simSuccess(retval: ReturnType<typeof nativeToScVal>) {
  return { result: { retval }, latestLedger: 1, minResourceFee: '100', transactionData: '', events: [] };
}

describe('TokenModule.balanceOfBatch()', () => {
  let client: VeriTixClient;
  let mockSimulate: jest.Mock;

  beforeEach(() => {
    client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    mockSimulate = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client.token as any).server = { simulateTransaction: mockSimulate };
  });

  it('returns balances in input address order', async () => {
    mockSimulate
      .mockResolvedValueOnce(simSuccess(nativeToScVal(10n, { type: 'i128' })))
      .mockResolvedValueOnce(simSuccess(nativeToScVal(20n, { type: 'i128' })));

    const results = await client.token.balanceOfBatch([ADDR_A, ADDR_B]);
    expect(results).toEqual([10n, 20n]);
  });

  it('returns 0n for an address with no balance', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(0n, { type: 'i128' })));
    const results = await client.token.balanceOfBatch([ADDR_A]);
    expect(results).toEqual([0n]);
  });

  it('returns an empty array for empty input', async () => {
    expect(await client.token.balanceOfBatch([])).toEqual([]);
  });

  it('throws BATCH_TOO_LARGE for more than 100 addresses', async () => {
    const addrs = Array.from({ length: 101 }, () => ADDR_A);
    await expect(client.token.balanceOfBatch(addrs)).rejects.toMatchObject({
      code: VeriTixErrorCode.BatchTooLarge,
    });
  });
});
