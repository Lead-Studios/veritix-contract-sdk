/**
 * @file tests/issue-459-transferBeneficiary-getEscrowStats.test.ts
 * Coverage for EscrowModule.transferBeneficiary() and getEscrowStats().
 * See issue #459.
 */

import { Keypair, SorobanRpc, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { VeriTixErrorCode } from '../src/utils/errors';
import * as transactionUtils from '../src/utils/transaction';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

function makeConnectedClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = { simulateTransaction: jest.fn(), sendTransaction: jest.fn(), getTransaction: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

function mapEntry(key: string, val: xdr.ScVal) {
  return new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });
}

describe('EscrowModule.transferBeneficiary / getEscrowStats (#459)', () => {
  it('transferBeneficiary throws ReadOnlyClient when no keypair is provided', async () => {
    const { client } = makeConnectedClient();
    await expect(client.escrow.transferBeneficiary(1n, FAKE_ADDRESS)).rejects.toMatchObject({
      code: VeriTixErrorCode.ReadOnlyClient,
    });
  });

  it('getEscrowStats returns total as a number and totalValue as a bigint', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.scvMap([
          mapEntry('total', nativeToScVal(10, { type: 'u32' })),
          mapEntry('active', nativeToScVal(4, { type: 'u32' })),
          mapEntry('released', nativeToScVal(5, { type: 'u32' })),
          mapEntry('refunded', nativeToScVal(1, { type: 'u32' })),
          mapEntry('total_value', nativeToScVal(9_000_000n, { type: 'i128' })),
          mapEntry('avg_value', nativeToScVal(900_000n, { type: 'i128' })),
        ]),
      },
    });

    const stats = await client.escrow.getEscrowStats();

    expect(stats.total).toBe(10);
    expect(typeof stats.total).toBe('number');
    expect(stats.totalValue).toBe(9_000_000n);
    expect(typeof stats.totalValue).toBe('bigint');
  });
});
