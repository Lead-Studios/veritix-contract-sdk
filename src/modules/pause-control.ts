import type { TransactionResult } from '../types';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';

/** Minimal capability the pause controls need — satisfied by `VeriTixClient`. */
export interface PauseControlClient {
  invoke(method: string, args: unknown[]): Promise<TransactionResult>;
  simulate(method: string, args: unknown[]): Promise<unknown>;
  /** The signer's public key, or `null` on a read-only client. */
  getPublicKey(): string | null;
}

/** Last-known pause state, kept for backwards compatibility. */
export interface PauseState {
  isPaused: boolean;
  updatedAt: number;
}

/**
 * Emergency stop controls (#830).
 *
 * `pause()`/`unpause()` invoke the contract's `set_paused(admin, paused)` and
 * return the confirmed {@link TransactionResult} instead of a locally invented
 * `{ isPaused, updatedAt: Date.now() }` object — a local timestamp is not
 * chain state. {@link isPaused} reads the flag back from the contract.
 */
export class PauseControlModule {
  constructor(private readonly client: PauseControlClient) {}

  private admin(): string {
    const admin = this.client.getPublicKey();
    if (!admin) {
      throw new VeriTixError(
        VeriTixErrorCode.ReadOnlyClient,
        'pause/unpause require a signing keypair',
      );
    }
    return admin;
  }

  /** Pauses the contract and returns the confirmed transaction result. */
  async pause(): Promise<TransactionResult> {
    return this.client.invoke('set_paused', [this.admin(), true]);
  }

  /** Unpauses the contract and returns the confirmed transaction result. */
  async unpause(): Promise<TransactionResult> {
    return this.client.invoke('set_paused', [this.admin(), false]);
  }

  /** Reads the contract's current paused flag. */
  async isPaused(): Promise<boolean> {
    return (await this.client.simulate('is_paused', [])) === true;
  }
}
