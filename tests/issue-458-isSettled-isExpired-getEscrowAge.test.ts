/**
 * @file tests/issue-458-isSettled-isExpired-getEscrowAge.test.ts
 * Coverage for EscrowModule.isSettled(), isExpired(), and getEscrowAge().
 * See issue #458.
 */

import { Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const ESCROW_ID = 1n;

function makeConnectedClient(currentLedger = 100) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), Keypair.random());
  const mockServer = {
    simulateTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: currentLedger }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

const record = (overrides = {}) => ({
  id: ESCROW_ID, depositor: FAKE_ADDRESS, beneficiary: FAKE_ADDRESS,
  amount: 1_000_000n, released: false, refunded: false, expiryLedger: 1_000_000, memos: [],
  ...overrides,
});

describe('EscrowModule isSettled/isExpired/getEscrowAge (#458)', () => {
  it('isSettled returns true when the released flag is set', async () => {
    const { client } = makeConnectedClient();
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(record({ released: true }));
    await expect(client.escrow.isSettled(ESCROW_ID)).resolves.toBe(true);
  });

  it('isExpired returns false when the current ledger has not passed expiryLedger', async () => {
    const { client } = makeConnectedClient();
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(record({ expiryLedger: 1_000_000 }));
    await expect(client.escrow.isExpired(ESCROW_ID, 999_999)).resolves.toBe(false);
  });

  it('getEscrowAge returns the ledger delta from get_escrow_age for an active escrow', async () => {
    const { client, mockServer } = makeConnectedClient();
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(record());
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: nativeToScVal(250, { type: 'u32' }) },
    });
    await expect(client.escrow.getEscrowAge(ESCROW_ID)).resolves.toBe(250);
  });
});
