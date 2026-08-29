/**
 * @file tests/issue-448-mint.test.ts
 * Coverage for TokenModule.mint() — issue #448.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

jest.mock('../src/utils/transaction', () => {
  const actual = jest.requireActual('../src/utils/transaction');
  return {
    ...actual,
    buildContractCall: jest.fn().mockResolvedValue({}),
    simulateTransaction: jest.fn().mockResolvedValue({ transaction: {}, simulatedFee: '100' }),
    submitTransaction: jest.fn().mockResolvedValue({ hash: 'mint-hash', ledger: 1, successful: true }),
  };
});

import * as txUtils from '../src/utils/transaction';

beforeEach(() => jest.clearAllMocks());

describe('TokenModule.mint()', () => {
  it('throws ReadOnlyClient (READ_ONLY_CLIENT guard) when no keypair is configured', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    await expect(
      client.token.mint({ to: Keypair.random().publicKey(), amount: 1_000_000n }),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
  });

  it('submits with the correct method name and to/amount arg encoding', async () => {
    const keypair = Keypair.random();
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
    const to = Keypair.random().publicKey();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client.token as any).server = {
      getAccount: jest.fn().mockResolvedValue({
        accountId: () => keypair.publicKey(),
        sequenceNumber: () => '0',
        incrementSequenceNumber: () => {},
      }),
    };

    const result = await client.token.mint({ to, amount: 5_000_000n });

    expect(result.hash).toBe('mint-hash');
    const buildMock = txUtils.buildContractCall as jest.Mock;
    expect(buildMock).toHaveBeenCalledTimes(1);
    expect(buildMock.mock.calls[0][3]).toBe('mint'); // contract method name
    expect(buildMock.mock.calls[0][4]).toHaveLength(2); // [to, amount] ScVal args
  });
});
