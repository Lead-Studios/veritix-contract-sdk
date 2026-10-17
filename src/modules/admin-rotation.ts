import type { TransactionResult } from '../types';
import { assertValidAddress } from '../utils/network';

/**
 * Cached view of the two-step rotation. `currentAdmin` mirrors the on-chain
 * owner and `pendingAdmin` mirrors the on-chain pending proposal, if any.
 */
export interface AdminRotationState {
  currentAdmin: string;
  pendingAdmin?: string | null;
}

/** Minimal capability {@link AdminRotationModule} needs — satisfied by `VeriTixClient`. */
export interface AdminRotationClient {
  invoke(method: string, args: unknown[]): Promise<TransactionResult>;
  simulate(method: string, args: unknown[]): Promise<unknown>;
}

/**
 * Two-step admin rotation performed against the contract (#831).
 *
 * Previously these helpers only edited a caller-supplied in-memory object, so
 * calling them rotated nothing on-chain. They now validate the proposed
 * address and drive the contract's `transfer_ownership(new_admin)` /
 * `accept_admin(new_admin)` entrypoints, reading the pending admin from chain
 * state.
 */
export class AdminRotationModule {
  constructor(private readonly client: AdminRotationClient) {}

  /** Proposes `newAdmin` as the successor owner. */
  async proposeAdmin(newAdmin: string): Promise<TransactionResult> {
    assertValidAddress(newAdmin, 'newAdmin');
    return this.client.invoke('transfer_ownership', [newAdmin]);
  }

  /** Accepts a pending ownership transfer as the proposed new admin. */
  async acceptAdmin(newAdmin: string): Promise<TransactionResult> {
    assertValidAddress(newAdmin, 'newAdmin');
    return this.client.invoke('accept_admin', [newAdmin]);
  }

  /** Reads the pending admin address from chain state, or `null` if none. */
  async getPendingAdmin(): Promise<string | null> {
    const raw = await this.client.simulate('get_pending_admin', []);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  }
}
