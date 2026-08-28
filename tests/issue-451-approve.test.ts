/**
 * @file tests/issue-451-approve.test.ts
 * Coverage for TokenModule.approve() — expirationLedger encoded as u32 (#451).
 */
import { Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const OWNER = Keypair.random().publicKey();
const SPENDER = Keypair.random().publicKey();

jest.mock('../src/utils/transaction', () => ({
  ...jest.requireActual('../src/utils/transaction'),
  buildContractCall: jest.fn().mockResolvedValue({}),
  simulateTransaction: jest.fn().mockResolvedValue({ transaction: {}, simulatedFee: '100' }),
  submitTransaction: jest.fn().mockResolvedValue({ hash: 'mockhash', ledger: 1, successful: true }),
}));
import * as txUtils from '../src/utils/transaction';

function makeClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  (client as any).server = {
    getAccount: jest.fn().mockResolvedValue({ accountId: () => keypair?.publicKey(), sequenceNumber: () => '0', incrementSequenceNumber: () => {} }),
  };
  return client;
}

beforeEach(() => jest.clearAllMocks());

describe('TokenModule.approve()', () => {
  it('throws ReadOnlyClient when no keypair', async () => {
    await expect(
      makeClient().token.approve({ from: OWNER, spender: SPENDER, amount: 1_000n, expirationLedger: 500_000 }),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
  });

  it('encodes expirationLedger as a u32 ScVal, not i128', async () => {
    const client = makeClient(Keypair.random());
    await client.token.approve({ from: OWNER, spender: SPENDER, amount: 2_000n, expirationLedger: 654_321 });
    const buildMock = txUtils.buildContractCall as jest.Mock;
    const args = buildMock.mock.calls[0][4] as { switch(): { name: string } }[];
    const expirationArg = args[3];
    expect(expirationArg.switch().name).toBe(nativeToScVal(654_321, { type: 'u32' }).switch().name);
    expect(expirationArg.switch().name).not.toBe('scvI128');
  });
});
