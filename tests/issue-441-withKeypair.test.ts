/**
 * @file tests/issue-441-withKeypair.test.ts
 * Coverage for VeriTixClientExtended.withKeypair() — closes #441.
 * Clones the client, reusing the same config/connection setup.
 */

import { VeriTixClient } from '../src/client';
import { VeriTixClientExtended } from '../src/client-extended';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair } from '@stellar/stellar-sdk';

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('VeriTixClientExtended.withKeypair()', () => {
  it('returns a new VeriTixClient instance sharing the same config', () => {
    const keypair1 = Keypair.random();
    const keypair2 = Keypair.random();
    const extended = new VeriTixClientExtended(getTestnetConfig(FAKE_CONTRACT_ID), keypair1);
    const clone = extended.withKeypair(keypair2);

    expect(clone).toBeInstanceOf(VeriTixClient);
    expect(clone).not.toBe(extended);
    expect(clone.config.contractId).toBe(extended.config.contractId);
  });

  it('is immediately usable without calling connect() — public key accessible synchronously', () => {
    const keypair1 = Keypair.random();
    const keypair2 = Keypair.random();
    const extended = new VeriTixClientExtended(getTestnetConfig(FAKE_CONTRACT_ID), keypair1);
    const clone = extended.withKeypair(keypair2);

    expect(() => clone.getPublicKey()).not.toThrow();
    expect(clone.getPublicKey()).toBe(keypair2.publicKey());
    expect(clone.isConnected()).toBe(false);
  });

  it('produces a writable client from a read-only client', () => {
    const readOnly = new VeriTixClientExtended(getTestnetConfig(FAKE_CONTRACT_ID));
    expect(readOnly.isReadOnly()).toBe(true);

    const writable = readOnly.withKeypair(Keypair.random());
    expect(writable.isReadOnly()).toBe(false);
  });
});
