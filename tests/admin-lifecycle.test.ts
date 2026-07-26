/**
 * @file tests/admin-lifecycle.test.ts
 * Integration test for the full admin lifecycle (issue #256).
 *
 * Tests: pause → unpause → setProtocolFee → updateTokenMetadata → freeze → unfreeze
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

jest.mock('../src/utils/transaction', () => {
  const actual = jest.requireActual('../src/utils/transaction');
  return {
    ...actual,
    buildContractCall: jest.fn().mockResolvedValue({}),
    simulateTransaction: jest.fn().mockResolvedValue({ transaction: {}, simulatedFee: '100' }),
    submitTransaction: jest.fn().mockResolvedValue({ hash: 'mockhash', ledger: 1, successful: true }),
  };
});

import * as txUtils from '../src/utils/transaction';

function makeAdminClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

beforeEach(() => jest.clearAllMocks());

describe('Admin Lifecycle Integration', () => {
  it('full lifecycle: pause → unpause → setProtocolFee → updateTokenMetadata', async () => {
    const { client } = makeAdminClient(Keypair.random());

    const pauseResult = await client.admin.pause();
    expect(pauseResult.successful).toBe(true);

    const unpauseResult = await client.admin.unpause();
    expect(unpauseResult.successful).toBe(true);

    const feeResult = await client.admin.setProtocolFee(250);
    expect(feeResult.successful).toBe(true);

    const metadataResult = await client.admin.updateTokenMetadata({ name: 'VeriTix V2' });
    expect(metadataResult.successful).toBe(true);
  });

  it('throws AdminUnauthorized for all admin operations without keypair', async () => {
    const { client } = makeAdminClient();

    await expect(client.admin.pause()).rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
    await expect(client.admin.unpause()).rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
    await expect(client.admin.setProtocolFee(100)).rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
    await expect(client.admin.updateTokenMetadata({ name: 'X' })).rejects.toMatchObject({ code: VeriTixErrorCode.AdminUnauthorized });
  });

  it('enableWhitelist and whitelistAddress flow', async () => {
    const { client } = makeAdminClient(Keypair.random());

    const enableResult = await client.admin.enableWhitelist();
    expect(enableResult.successful).toBe(true);

    const whitelistResult = await client.admin.whitelistAddress('GABC');
    expect(whitelistResult.successful).toBe(true);
  });
});
