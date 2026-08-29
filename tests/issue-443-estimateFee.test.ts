/**
 * @file tests/issue-443-estimateFee.test.ts
 * Coverage for fee extraction from the simulation response — closes #443.
 *
 * NOTE: `VeriTixClient` has no `estimateFee()` method (that lives as a
 * standalone helper in `src/utils/transaction.ts`, already covered under
 * `tests/utils/transaction.test.ts`). The client-level surface that extracts
 * a fee from a simulation response is `simulate()`, so these tests target it.
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { SorobanRpc, xdr } from '@stellar/stellar-sdk';

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

function makeConnectedClient() {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
  const mockServer = { simulateTransaction: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

describe('VeriTixClient.simulate()', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns success:true with estimatedFee extracted from the simulation response', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({
      minResourceFee: '12345',
      result: { retval: xdr.ScVal.scvVoid() },
    });
    jest.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValue(false);
    jest.spyOn(SorobanRpc.Api, 'isSimulationSuccess').mockReturnValue(true);
    jest.spyOn(SorobanRpc, 'assembleTransaction').mockReturnValue({ build: () => ({}) } as any);

    const result = await client.simulate('get_escrow', []);

    expect(result.success).toBe(true);
    expect(result.estimatedFee).toBe('12345');
  });

  it('returns success:false with estimatedFee "0" when the simulation errors', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({ error: 'escrow not found' });
    jest.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValue(true);

    const result = await client.simulate('fail_method', []);

    expect(result.success).toBe(false);
    expect(result.estimatedFee).toBe('0');
  });

  it('throws if not connected', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
    await expect(client.simulate('ping', [])).rejects.toThrow('call connect()');
  });
});
