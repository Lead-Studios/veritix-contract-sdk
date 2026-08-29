/**
 * @file tests/issue-454-getEscrowsBatch.test.ts
 * Coverage for EscrowModule.getEscrowsBatch(): null for missing IDs and
 * preserved input order. Closes #454.
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import type { EscrowRecord } from '../src/types/index';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

function makeRecord(id: bigint): EscrowRecord {
  return {
    id,
    depositor: FAKE_ADDRESS,
    beneficiary: FAKE_ADDRESS,
    amount: 1_000_000n,
    released: false,
    refunded: false,
    expiryLedger: 1_000_000,
    memos: [],
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EscrowModule.getEscrowsBatch — missing IDs and ordering (#454)', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('returns null for a missing ID within the batch', async () => {
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValueOnce(null);

    const results = await client.escrow.getEscrowsBatch([999n]);

    expect(results).toEqual([null]);
  });

  it('returns [record, null, record] for [1n, 999n, 2n] where 999n is missing', async () => {
    const record1 = makeRecord(1n);
    const record2 = makeRecord(2n);
    jest
      .spyOn(client.escrow, 'getEscrow')
      .mockResolvedValueOnce(record1)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(record2);

    const results = await client.escrow.getEscrowsBatch([1n, 999n, 2n]);

    expect(results).toEqual([record1, null, record2]);
  });
});
