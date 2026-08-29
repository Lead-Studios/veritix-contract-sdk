/**
 * @file tests/issue-444-toJSON.test.ts
 * Coverage for VeriTixClient.toJSON() secret redaction — closes #444.
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair } from '@stellar/stellar-sdk';

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('VeriTixClient.toJSON()', () => {
  it('does not expose a 56-char S-prefixed secret key when a keypair is set', () => {
    const keypair = Keypair.random();
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID), keypair);

    const json = JSON.stringify(client);

    expect(json).not.toContain(keypair.secret());
  });

  it('includes contractId and network via the nested config', () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safe = client.toJSON() as any;

    expect(safe.config.contractId).toBe(FAKE_CONTRACT_ID);
    expect(safe.config.network).toBe('testnet');
  });

  it('redacts the keypair to a placeholder string when one is set', () => {
    const keypair = Keypair.random();
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID), keypair);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safe = client.toJSON() as any;

    expect(safe.keypair).toBe('[REDACTED_KEYPAIR]');
  });

  it('omits the keypair field entirely for a read-only client', () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
    const parsed = JSON.parse(JSON.stringify(client));

    expect(parsed.keypair).toBeUndefined();
  });
});
