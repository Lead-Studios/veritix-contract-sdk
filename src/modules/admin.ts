import type { TransactionResult } from '../types';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { assertValidAddress } from '../utils/network';

/** Minimal capability `AdminModule` needs — satisfied by `VeriTixClient`. */
export interface AdminClient {
  simulate(method: string, args: unknown[]): Promise<unknown>;
  invoke(method: string, args: unknown[]): Promise<unknown>;
  /** The signer's public key, or `null` on a read-only client. */
  getPublicKey?(): string | null;
}

/**
 * Normalises any failure from an admin call to a typed
 * {@link VeriTixErrorCode.AdminUnauthorized} error, so callers can branch on
 * the code instead of parsing messages. On-chain authorization is still the
 * source of truth; this only gives the local failure a stable shape.
 */
function adminError(action: string, err: unknown): VeriTixError {
  if (err instanceof VeriTixError && err.code === VeriTixErrorCode.AdminUnauthorized) {
    return err;
  }
  const raw = err instanceof Error ? err.message : String(err);
  return new VeriTixError(
    VeriTixErrorCode.AdminUnauthorized,
    `AdminModule.${action}: caller is not authorized admin (${raw})`,
    raw,
    err,
  );
}

/**
 * Admin operations, each invoking the contract through `client.invoke()`
 * (reads go through `client.simulate()`).
 *
 * Authorization is enforced on-chain; every failure is mapped to
 * {@link VeriTixErrorCode.AdminUnauthorized} rather than a plain `Error`, and
 * no method fabricates local state (#832).
 */
export class AdminModule {
  constructor(private readonly client: AdminClient) {}

  /**
   * Asserts that `callerAddress` is the configured signer, throwing a typed
   * `AdminUnauthorized` otherwise. Kept as an explicit local guard; the
   * contract remains the final authority.
   */
  assertAdmin(callerAddress: string): void {
    const signer = this.client.getPublicKey?.() ?? null;
    if (!signer || signer !== callerAddress) {
      throw new VeriTixError(
        VeriTixErrorCode.AdminUnauthorized,
        'Caller is not authorized admin',
      );
    }
  }

  private async invokeAdmin(method: string, args: unknown[]): Promise<TransactionResult> {
    try {
      return (await this.client.invoke(method, args)) as TransactionResult;
    } catch (err) {
      throw adminError(method, err);
    }
  }

  async proposeAdmin(newAdmin: string): Promise<TransactionResult> {
    assertValidAddress(newAdmin, 'newAdmin');
    return this.invokeAdmin('propose_admin', [newAdmin]);
  }

  async acceptAdmin(newAdmin: string): Promise<TransactionResult> {
    assertValidAddress(newAdmin, 'newAdmin');
    return this.invokeAdmin('accept_admin', [newAdmin]);
  }

  /** The proposed successor admin, or `null` when no rotation is pending. */
  async getPendingAdmin(): Promise<string | null> {
    try {
      const raw = await this.client.simulate('get_pending_admin', []);
      return typeof raw === 'string' && raw.length > 0 ? raw : null;
    } catch (err) {
      throw adminError('getPendingAdmin', err);
    }
  }

  async freeze(address: string): Promise<TransactionResult> {
    assertValidAddress(address, 'address');
    return this.invokeAdmin('freeze', [address]);
  }

  async unfreeze(address: string): Promise<TransactionResult> {
    assertValidAddress(address, 'address');
    return this.invokeAdmin('unfreeze', [address]);
  }

  async clawback(from: string, amount: bigint): Promise<TransactionResult> {
    assertValidAddress(from, 'from');
    return this.invokeAdmin('clawback', [from, amount]);
  }

  async pause(): Promise<TransactionResult> {
    return this.invokeAdmin('pause', []);
  }

  async unpause(): Promise<TransactionResult> {
    return this.invokeAdmin('unpause', []);
  }
}
