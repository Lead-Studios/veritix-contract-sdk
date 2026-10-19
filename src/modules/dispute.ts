/**
 * @module modules/dispute
 * DisputeModule — read surface for on-chain dispute records (#647, #648, #649).
 *
 * Mirrors the shape of {@link VeriTixClient}'s existing `escrow` property: a
 * small class holding just enough to decode and query dispute state,
 * constructed around a minimal read-only capability rather than the full
 * client, so it can be unit-tested without RPC mocking and wired into
 * `VeriTixClient` later (a one-line `readonly dispute = new DisputeModule(...)`
 * addition — left as a follow-up, out of scope for this single-file change,
 * since `client.ts` is shared across several in-flight contributions).
 */
import type { DisputeRecord } from '../types';
import * as actions from './dispute-actions';
import * as lifecycle from './dispute-lifecycle-actions';
import type { DisputeInvoker } from './dispute-actions';

/** Minimal read capability a `DisputeModule` needs — satisfied by `VeriTixClient`. */
export interface DisputeReader {
  /** Simulates a read-only contract call and returns its decoded native value. */
  simulateRead(method: string, args: unknown[]): Promise<unknown>;
}

/**
 * Decodes a raw `scValToNative`-decoded dispute struct into a typed
 * {@link DisputeRecord}. Soroban structs decode to snake_case keys, so this
 * is the single place that normalizes them to the SDK's camelCase surface.
 *
 * @throws {Error} if `raw` is not an object or is missing a required field.
 */
export function decodeDisputeRecord(raw: unknown): DisputeRecord {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('dispute record is not an object');
  }
  const r = raw as Record<string, unknown>;
  const id = r.id;
  const escrowId = r.escrow_id ?? r.escrowId;
  const claimant = r.claimant;
  const resolver = r.resolver;
  const status = r.status;
  const openedAt = r.opened_at ?? r.openedAt;

  if (
    typeof id !== 'bigint' ||
    typeof escrowId !== 'bigint' ||
    typeof claimant !== 'string' ||
    typeof resolver !== 'string' ||
    typeof status !== 'string' ||
    typeof openedAt !== 'number'
  ) {
    throw new Error('dispute record is missing one or more required fields');
  }

  return { id, escrowId, claimant, resolver, status, openedAt };
}

export class DisputeModule {
  constructor(
    private readonly reader: DisputeReader,
    private readonly invoker?: DisputeInvoker
  ) {}

  private requireInvoker(): DisputeInvoker {
    if (!this.invoker) {
      throw new Error('DisputeModule was constructed without a write capability');
    }
    return this.invoker;
  }

  /**
   * Raises a dispute against `escrowId` on behalf of `caller`.
   *
   * #852 — the contract entrypoint is `raise_dispute(caller, escrow_id)`, not
   * `open_dispute(escrowId, claimant, resolver)`. Disputes are keyed by the
   * escrow they are attached to and the claimant is the authorising caller, so
   * there is no resolver to nominate here and no dispute id is returned. See
   * `raiseDispute` in `./dispute-actions`.
   */
  raiseDispute(caller: string, escrowId: bigint): Promise<void> {
    return actions.raiseDispute(this.requireInvoker(), caller, escrowId);
  }

  /**
   * Resolves the dispute on `escrowId` in favour of `winner`.
   *
   * #852 — the contract entrypoint is `resolve_dispute(resolver, escrow_id,
   * winner)`: keyed by escrow, taking an `Address` winner rather than a
   * `favorClaimant` boolean, and resolving to nothing. There is no free-form
   * `note` parameter on the contract.
   */
  resolveDispute(resolver: string, escrowId: bigint, winner: string): Promise<void> {
    return actions.resolveDispute(this.requireInvoker(), resolver, escrowId, winner);
  }

  /**
   * Sweeps the dispute on `escrowId` past its resolution deadline.
   *
   * #852 — the contract entrypoint is `expire_dispute(caller, escrow_id)` and
   * returns nothing, so this no longer resolves to an updated
   * {@link DisputeRecord}.
   */
  expireDispute(caller: string, escrowId: bigint): Promise<void> {
    return lifecycle.expireDispute(this.requireInvoker(), caller, escrowId);
  }

  /**
   * Appeals the open dispute on `escrowId`.
   *
   * #852 — the contract entrypoint is `appeal_dispute(caller, escrow_id)`. It
   * takes no evidence argument and returns nothing, so the previous
   * `DisputeAppeal` parameter is gone.
   */
  appealDispute(caller: string, escrowId: bigint): Promise<void> {
    return lifecycle.appealDispute(this.requireInvoker(), caller, escrowId);
  }

  getOpenDisputes(): Promise<DisputeRecord[]> {
    return actions.getOpenDisputes(this.requireInvoker());
  }

  getDisputesByResolver(resolver: string): Promise<DisputeRecord[]> {
    return actions.getDisputesByResolver(this.requireInvoker(), resolver);
  }

  getDisputeHistory(escrowId: bigint): Promise<bigint[]> {
    return actions.getDisputeHistory(this.requireInvoker(), escrowId);
  }

  /**
   * Returns the dispute for `escrowId`, or `null` if the contract has no
   * dispute recorded for it (mirrors {@link VeriTixClient}'s `getEscrow`
   * null-on-miss convention, per #648).
   */
  async getDispute(escrowId: bigint): Promise<DisputeRecord | null> {
    const raw = await this.reader.simulateRead('get_dispute', [escrowId]);
    if (raw === null || raw === undefined) {
      return null;
    }
    return decodeDisputeRecord(raw);
  }

  /** True when `escrowId` has a dispute recorded with status `"open"`. */
  async isDisputeOpen(escrowId: bigint): Promise<boolean> {
    const dispute = await this.getDispute(escrowId);
    return dispute !== null && dispute.status === 'open';
  }

  /**
   * True when `escrowId`'s dispute is still open but was opened more than
   * `expiryWindowSecs` ago, accounting for ledger-close-time drift by
   * accepting the current time explicitly rather than assuming `Date.now()`
   * matches the ledger clock (#649).
   *
   * `openedAt` is a ledger sequence number, not a timestamp — this compares
   * ledger counts under the same "roughly N seconds per ledger" assumption
   * the rest of the SDK's expiry helpers use (see `escrowChanged`'s sibling
   * helpers in `client.ts`), via `ledgersPerSecond`.
   */
  async isDisputeExpired(
    escrowId: bigint,
    expiryWindowSecs: number,
    nowLedger: number,
    ledgersPerSecond = 1 / 5
  ): Promise<boolean> {
    const dispute = await this.getDispute(escrowId);
    if (dispute === null || dispute.status !== 'open') {
      return false;
    }
    const expiryWindowLedgers = Math.ceil(expiryWindowSecs * ledgersPerSecond);
    return nowLedger - dispute.openedAt >= expiryWindowLedgers;
  }
}
