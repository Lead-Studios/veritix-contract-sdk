/**
 * @file tests/issue-450-isFrozen-getHolders.test.ts
 * Coverage for isFrozen() / getHolders() / totalHolders() return types (#450).
 * Reuses the mockSimulate pattern established in tests/token.test.ts.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS = Keypair.random().publicKey();

function simSuccess(retval: xdr.ScVal) {
  return { result: { retval }, latestLedger: 1, minResourceFee: '100', transactionData: '', events: [] };
}

describe('TokenModule isFrozen/getHolders/totalHolders', () => {
  let client: VeriTixClient;
  let mockSimulate: jest.Mock;

  beforeEach(() => {
    client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    mockSimulate = jest.fn();
    (client.token as any).server = { simulateTransaction: mockSimulate };
  });

  it('isFrozen() returns true for a frozen address', async () => {
    mockSimulate.mockResolvedValue(simSuccess(xdr.ScVal.scvBool(true)));
    await expect(client.token.isFrozen(FAKE_ADDRESS)).resolves.toBe(true);
  });

  it('isFrozen() returns false for an unfrozen address', async () => {
    mockSimulate.mockResolvedValue(simSuccess(xdr.ScVal.scvBool(false)));
    await expect(client.token.isFrozen(FAKE_ADDRESS)).resolves.toBe(false);
  });

  it('isFrozen() for the contract address returns false without an RPC call', async () => {
    await expect(client.token.isFrozen(FAKE_CONTRACT)).resolves.toBe(false);
    expect(mockSimulate).not.toHaveBeenCalled();
  });

  it('getHolders() returns an array of address strings', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal([FAKE_ADDRESS, FAKE_ADDRESS], { type: 'string[]' })));
    const holders = await client.token.getHolders(0, 2);
    expect(Array.isArray(holders)).toBe(true);
    expect(holders.every((h) => typeof h === 'string')).toBe(true);
  });

  it('getHolders() with limit over 100 throws BatchTooLarge', async () => {
    await expect(client.token.getHolders(0, 101)).rejects.toMatchObject({ code: VeriTixErrorCode.BatchTooLarge });
  });

  it('totalHolders() returns a bigint value', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(5n, { type: 'i128' })));
    const total = await client.token.totalHolders();
    expect(typeof total).toBe('bigint');
    expect(total).toBe(5n);
  });
});
