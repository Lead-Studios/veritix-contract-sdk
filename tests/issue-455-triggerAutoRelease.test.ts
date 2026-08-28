/**
 * @file tests/issue-455-triggerAutoRelease.test.ts
 * Coverage for EscrowModule.triggerAutoRelease() pre-flight ledger check.
 * Closes #455.
 */

import { SorobanRpc, xdr } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { VeriTixErrorCode } from '../src/utils/errors';
import * as transactionUtils from '../src/utils/transaction';
import type { EscrowRecord } from '../src/types/index';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const EXPIRY_LEDGER = 1_000_000;

function makeRecord(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  return {
    id: 1n,
    depositor: FAKE_ADDRESS,
    beneficiary: FAKE_ADDRESS,
    amount: 1_000_000n,
    released: false,
    refunded: false,
    expiryLedger: EXPIRY_LEDGER,
    memos: [],
    ...overrides,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EscrowModule.triggerAutoRelease — pre-flight ledger check (#455)', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('throws EscrowNotExpired when ledger has not yet reached expiry', async () => {
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(makeRecord());

    await expect(
      client.escrow.triggerAutoRelease(1n, EXPIRY_LEDGER - 1),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.EscrowNotExpired });
  });

  it('throws EscrowAlreadySettled when the escrow was already released', async () => {
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(makeRecord({ released: true }));

    await expect(
      client.escrow.triggerAutoRelease(1n, EXPIRY_LEDGER),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.EscrowAlreadySettled });
  });

  it('submits the auto-release transaction once the expiry ledger has passed', async () => {
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(makeRecord());
    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue({} as never);
    jest.spyOn(SorobanRpc, 'assembleTransaction').mockReturnValue({
      build: () => ({} as never),
    } as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'auto-release-hash',
      ledger: EXPIRY_LEDGER,
      successful: true,
    });

    const result = await client.escrow.triggerAutoRelease(1n, EXPIRY_LEDGER);

    expect(result).toMatchObject({ hash: 'auto-release-hash', successful: true });
  });
});
