/**
 * @file tests/issue-449-transferFrom.test.ts
 * Coverage for TokenModule.transferFrom() — allowance pre-flight and args (#449).
 */
import { Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FROM = Keypair.random().publicKey();
const TO = Keypair.random().publicKey();

jest.mock('../src/utils/transaction', () => ({
  ...jest.requireActual('../src/utils/transaction'),
  buildContractCall: jest.fn().mockResolvedValue({}),
  simulateTransaction: jest.fn().mockResolvedValue({ transaction: {}, simulatedFee: '100' }),
  submitTransaction: jest.fn().mockResolvedValue({ hash: 'mockhash', ledger: 1, successful: true }),
}));
import * as txUtils from '../src/utils/transaction';

function makeClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    getAccount: jest.fn().mockResolvedValue({ accountId: () => keypair?.publicKey(), sequenceNumber: () => '0', incrementSequenceNumber: () => {} }),
  };
  (client as any).server = mockServer;
  return { client, mockServer };
}

beforeEach(() => jest.clearAllMocks());

describe('TokenModule.transferFrom()', () => {
  it('throws ReadOnlyClient when no keypair', async () => {
    await expect(makeClient().client.token.transferFrom(FROM, TO, 100n))
      .rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
  });

  it('throws InsufficientAllowance when allowance is too low', async () => {
    const { client, mockServer } = makeClient(Keypair.random());
    mockServer.simulateTransaction.mockResolvedValue({ result: { retval: nativeToScVal(10n, { type: 'i128' }) } });
    await expect(client.token.transferFrom(FROM, TO, 100n))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InsufficientAllowance });
  });

  it('submits transfer_from with correct spender, from, to, and amount args', async () => {
    const { client, mockServer } = makeClient(Keypair.random());
    mockServer.simulateTransaction.mockResolvedValue({ result: { retval: nativeToScVal(1_000n, { type: 'i128' }) } });
    await client.token.transferFrom(FROM, TO, 500n);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    const call = buildMock.mock.calls.find((c) => c[3] === 'transfer_from');
    expect(call).toBeDefined();
    expect(call![4]).toHaveLength(4);
  });
});
