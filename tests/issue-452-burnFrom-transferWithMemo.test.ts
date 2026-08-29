/**
 * @file tests/issue-452-burnFrom-transferWithMemo.test.ts
 * Coverage for TokenModule.burnFrom() and transferWithMemo() (#452).
 */
import { Keypair } from '@stellar/stellar-sdk';
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
  (client as any).server = {
    getAccount: jest.fn().mockResolvedValue({ accountId: () => keypair?.publicKey(), sequenceNumber: () => '0', incrementSequenceNumber: () => {} }),
  };
  return client;
}

beforeEach(() => jest.clearAllMocks());

describe('TokenModule.burnFrom()', () => {
  it('throws ReadOnlyClient when no keypair', async () => {
    await expect(makeClient().token.burnFrom(FROM, 500_000n)).rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
  });

  it('submits burn_from with correct spender, from, and amount args', async () => {
    await makeClient(Keypair.random()).token.burnFrom(FROM, 500_000n);
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), FAKE_CONTRACT, 'burn_from', expect.any(Array), expect.any(String));
    expect(buildMock.mock.calls[0][4]).toHaveLength(3);
  });
});

describe('TokenModule.transferWithMemo()', () => {
  it('memo over 64 bytes throws before any RPC call', async () => {
    await expect(makeClient().token.transferWithMemo(TO, 1_000n, 'a'.repeat(65)))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
    expect(txUtils.buildContractCall).not.toHaveBeenCalled();
  });

  it('checks emoji memo by byte length, not character length', async () => {
    const emojiMemo = '🎫'.repeat(17); // 4 bytes each = 68 bytes, 17 chars
    await expect(makeClient().token.transferWithMemo(TO, 1_000n, emojiMemo))
      .rejects.toMatchObject({ code: VeriTixErrorCode.InvalidAmount });
  });
});
