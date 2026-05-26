/**
 * @file tests/token.test.ts
 * Unit tests for {@link TokenModule}.
 *
 * All tests currently verify that the stub methods throw "not implemented"
 * with the correct signature.  Replace each `rejects.toThrow` with real
 * assertions once the implementation is in place.
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS  = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

describe('TokenModule (stubs)', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('balance() throws "not implemented"', async () => {
    await expect(client.token.balance(FAKE_ADDRESS)).rejects.toThrow('not implemented');
  });

  it('allowance() throws "not implemented"', async () => {
    await expect(client.token.allowance(FAKE_ADDRESS, FAKE_ADDRESS)).rejects.toThrow(
      'not implemented',
    );
  });

  it('mint() throws "not implemented"', async () => {
    await expect(
      client.token.mint({ to: FAKE_ADDRESS, amount: 1_000_000n }),
    ).rejects.toThrow('not implemented');
  });

  it('burn() throws "not implemented"', async () => {
    await expect(
      client.token.burn({ from: FAKE_ADDRESS, amount: 500_000n }),
    ).rejects.toThrow('not implemented');
  });

  it('transfer() throws "not implemented"', async () => {
    await expect(
      client.token.transfer({ from: FAKE_ADDRESS, to: FAKE_ADDRESS, amount: 100n }),
    ).rejects.toThrow('not implemented');
  });

  it('approve() throws "not implemented"', async () => {
    await expect(
      client.token.approve({
        from: FAKE_ADDRESS,
        spender: FAKE_ADDRESS,
        amount: 1_000n,
        expirationLedger: 999_999,
      }),
    ).rejects.toThrow('not implemented');
  });
});
