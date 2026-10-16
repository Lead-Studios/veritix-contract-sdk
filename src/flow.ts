/**
 * @module client-extended
 * VeriTixClientExtended — derives a signing client from a read-only one
 * (issue #618).
 *
 * Importing the class alone must never change the source instance, so
 * `withKeypair()` returns a new instance that shares the config rather than
 * mutating `this`.
 */
import { Keypair } from '@stellar/stellar-sdk';

import { VeriTixClient } from './client';
import type { NetworkConfig } from './utils/network';

export class VeriTixClientExtended extends VeriTixClient {
  constructor(config: NetworkConfig, keypair?: Keypair) {
    super(config, keypair);
  }

  /**
   * Returns a new {@link VeriTixClientExtended} sharing this client's config
   * but signing with `keypair`. This instance is left unchanged.
   */
  withKeypair(keypair: Keypair): VeriTixClientExtended {
    if (!keypair) {
      throw new TypeError('withKeypair: a Keypair is required');
    }
    return new VeriTixClientExtended(this.config, keypair);
  }

  /** Whether this client has a keypair and can therefore sign writes. */
  canSign(): boolean {
    return this.getPublicKey() !== null;
  }
}