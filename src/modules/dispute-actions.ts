/**
 * @module modules/dispute-actions
 * Dispute write actions and listing reads (#650, #651, #652, #653).
 *
 * Companion to `./dispute.ts`'s read-only `DisputeModule` — kept in a
 * separate file since `dispute.ts` has an in-flight contribution from
 * another contributor on this batch. Imports `decodeDisputeRecord` from it
 * (a read-only import, not an edit) so both files decode dispute structs
 * identically rather than drifting into two parallel implementations.
 */
import type { DisputeRecord } from '../types';
import { decodeDisputeRecord } from './dispute';

/** Minimal capability `DisputeActions` needs — satisfied by `VeriTixClient`. */
export interface DisputeInvoker {
  /** Simulates a read-only contract call and returns its decoded native value. */
  simulateRead(method: string, args: unknown[]): Promise<unknown>;
  /** Simulates, signs, and submits a state-changing contract call. */
  invoke(method: string, args: unknown[]): Promise<unknown>;
}

/**
 * Raises a dispute against `escrowId` on behalf of `caller`.
 *
 * #852 — the contract entrypoint is `raise_dispute(caller, escrow_id)`. There
 * is no `open_dispute` entrypoint, and the contract keys a dispute by the
 * escrow it is attached to, not by a dispute id: it derives the claimant from
 * `caller` (which must be the escrow's depositor or beneficiary) and rejects
 * an escrow that is already settled. `caller` must be the address that signs
 * the transaction, since the contract calls `caller.require_auth()`.
 *
 * The contract function returns nothing, so this resolves to `void` — the new
 * dispute has no separately-assigned id to hand back; it is identified by its
 * `escrowId`.
 */
export async function raiseDispute(
  invoker: DisputeInvoker,
  caller: string,
  escrowId: bigint
): Promise<void> {
  await invoker.invoke('raise_dispute', [caller, escrowId]);
}

/**
 * Resolves the dispute on `escrowId` in favour of `winner`.
 *
 * #852 — the contract entrypoint is `resolve_dispute(resolver, escrow_id,
 * winner)`. It is keyed by escrow rather than by a dispute id, and it takes
 * the winning party as an `Address` rather than a `favorClaimant` boolean, so
 * "who won" is an arbitrary account and not just the claimant or the
 * beneficiary. The contract also enforces that `resolver` is the configured
 * arbiter; there is no per-dispute resolver to nominate at raise time.
 *
 * `resolver` must be the address that signs the transaction.
 */
export async function resolveDispute(
  invoker: DisputeInvoker,
  resolver: string,
  escrowId: bigint,
  winner: string
): Promise<void> {
  await invoker.invoke('resolve_dispute', [resolver, escrowId, winner]);
}

/**
 * Returns every dispute id ever opened against `escrowId`, in the order
 * the contract stored them (#651).
 */
export async function getDisputeHistory(
  invoker: DisputeInvoker,
  escrowId: bigint
): Promise<bigint[]> {
  const raw = await invoker.simulateRead('get_dispute_history', [escrowId]);
  if (raw === null || raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('get_dispute_history did not return a vector');
  }
  return raw.map((entry) => {
    if (typeof entry !== 'bigint') {
      throw new Error('get_dispute_history returned a non-bigint dispute id');
    }
    return entry;
  });
}

/** Every dispute currently in `"open"` status, contract-wide (#650). */
export async function getOpenDisputes(invoker: DisputeInvoker): Promise<DisputeRecord[]> {
  const raw = await invoker.simulateRead('get_open_disputes', []);
  if (raw === null || raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('get_open_disputes did not return a vector');
  }
  return raw.map(decodeDisputeRecord);
}

/** Every dispute assigned to `resolver`, regardless of status (#650). */
export async function getDisputesByResolver(
  invoker: DisputeInvoker,
  resolver: string
): Promise<DisputeRecord[]> {
  const raw = await invoker.simulateRead('get_disputes_by_resolver', [resolver]);
  if (raw === null || raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('get_disputes_by_resolver did not return a vector');
  }
  return raw.map(decodeDisputeRecord);
}
