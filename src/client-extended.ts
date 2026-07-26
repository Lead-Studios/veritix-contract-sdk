/**
 * VeriTixClient Extensions
 * Provides additional client management utilities
 */

import { VeriTixClient } from './client';
import { Keypair } from 'stellar-sdk';
import { NetworkConfig } from './types';

/**
 * Extended VeriTixClient with multi-account support
 */
export class VeriTixClientExtended extends VeriTixClient {
  /**
   * Clone the client with a different keypair for multi-account flows
   *
   * @param keypair - The new keypair to use for signing
   * @returns A new VeriTixClient instance with the same config but different keypair
   *
   * @example
   * const client = new VeriTixClient(config, keypair1);
   * const client2 = client.withKeypair(keypair2); // Same config, different signer
   * await client2.escrow.createEscrow(...); // Signed by keypair2
   */
  withKeypair(keypair: Keypair): VeriTixClientExtended {
    const newClient = new VeriTixClientExtended(this.config, keypair);
    return newClient;
  }

  /**
   * Get current keypair public key
   * @returns The public key of the currently configured keypair
   */
  getPublicKey(): string | null {
    return this.keypair?.publicKey() || null;
  }

  /**
   * Check if client has signing capability
   * @returns true if keypair is configured
   */
  canSign(): boolean {
    return this.keypair !== null;
  }
}
