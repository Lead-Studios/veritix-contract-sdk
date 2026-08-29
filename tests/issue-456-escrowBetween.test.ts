/**
 * @file tests/issue-456-escrowBetween.test.ts
 * Coverage for EscrowModule.escrowBetween() and
 * EscrowModule.getEscrowedValueForDepositor(). Closes #456.
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import type { EscrowRecord } from '../src/types/index';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const DEPOSITOR = 'GBZXN7PIRZGNMHGA76QJRYR3ERW7VH2MJL7G2P6CC6QH5M2LQJUSVQ6C';
const BENEFICIARY = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

function makeRecord(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  return {
    id: 1n,
    depositor: DEPOSITOR,
    beneficiary: BENEFICIARY,
    amount: 1_000_000n,
    released: false,
    refunded: false,
    expiryLedger: 1_000_000,
    memos: [],
    ...overrides,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EscrowModule.escrowBetween (#456)', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('returns the escrow ID as bigint when an active escrow is found', async () => {
    jest.spyOn(client.escrow, 'getEscrowsByDepositor').mockResolvedValue([1n]);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(makeRecord());

    await expect(client.escrow.escrowBetween(DEPOSITOR, BENEFICIARY)).resolves.toBe(1n);
  });

  it('returns null for settled escrows', async () => {
    jest.spyOn(client.escrow, 'getEscrowsByDepositor').mockResolvedValue([1n]);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(makeRecord({ released: true }));

    await expect(client.escrow.escrowBetween(DEPOSITOR, BENEFICIARY)).resolves.toBeNull();
  });
});

describe('EscrowModule.getEscrowedValueForDepositor (#456)', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('returns the sum of active escrow amounts', async () => {
    jest.spyOn(client.escrow, 'getEscrowsByDepositor').mockResolvedValue([1n, 2n]);
    jest
      .spyOn(client.escrow, 'getEscrow')
      .mockResolvedValueOnce(makeRecord({ id: 1n, amount: 1_000_000n }))
      .mockResolvedValueOnce(makeRecord({ id: 2n, amount: 2_000_000n }));

    await expect(client.escrow.getEscrowedValueForDepositor(DEPOSITOR)).resolves.toBe(3_000_000n);
  });

  it('returns 0n when the depositor has no escrows', async () => {
    jest.spyOn(client.escrow, 'getEscrowsByDepositor').mockResolvedValue([]);

    await expect(client.escrow.getEscrowedValueForDepositor(DEPOSITOR)).resolves.toBe(0n);
  });
});
