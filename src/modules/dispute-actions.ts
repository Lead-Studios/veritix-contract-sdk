/**
 * @module modules/dispute-actions
 * Dispute write actions and listing reads (#650, #651, #652, #653).
 *
 * Companion to `./dispute.ts`'s read-only `DisputeModule` — kept in a
 * separate file since `dispute.ts` has an in-flight contribution from
 * another contributor on this batch.
 */
import type { DisputeRecord } from '../types';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';

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
 * Returns every dispute id ever raised against `escrowId`, in the order the
 * contract stored them (#651).
 *
 * #853 — the contract entrypoint is `get_dispute_history_for_escrow(escrow_id)`,
 * not `get_dispute_history`. The previous call did not exist, so every read
 * failed. The return type is unchanged: the contract returns `Vec<u32>`, which
 * is already what this method hands back.
 */
export async function getDisputeHistory(
  invoker: DisputeInvoker,
  escrowId: bigint
): Promise<bigint[]> {
  const raw = await invoker.simulateRead('get_dispute_history_for_escrow', [escrowId]);
  if (raw === null || raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('get_dispute_history_for_escrow did not return a vector');
  }
  return raw.map((entry) => {
    if (typeof entry !== 'bigint') {
      throw new Error('get_dispute_history_for_escrow returned a non-bigint dispute id');
    }
    return entry;
  });
}

/**
 * Every dispute currently in `"open"` status, contract-wide (#650).
 *
 * #853 — the contract has no contract-wide listing of open disputes.
 * `get_dispute_stats()` exists but returns only aggregate counters (`open`,
 * `resolved_for_beneficiary`, `resolved_for_depositor`, `expired`), and
 * `is_dispute_open(escrow_id)` is a per-escrow boolean that needs an id to
 * start from. There is no way to enumerate open disputes, so rather than call
 * a function that does not exist and fail with an opaque RPC error, this
 * throws `NotImplemented` naming the entrypoint the contract would need.
 */
export function getOpenDisputes(_invoker: DisputeInvoker): Promise<DisputeRecord[]> {
  return Promise.reject(
    new VeriTixError(
      VeriTixErrorCode.NotImplemented,
      'getOpenDisputes: the contract exposes no contract-wide open-dispute listing — ' +
        'get_dispute_stats() returns only counters. Missing contract function: ' +
        'get_open_disputes() -> Vec<DisputeRecord>',
    ),
  );
}

/**
 * Every dispute assigned to `resolver`, regardless of status (#650).
 *
 * #853 — the contract keeps no resolver-keyed dispute index. `get_disputes_by_resolver`
 * does not exist, and the closest real entrypoint, `get_resolver_stats(resolver)`,
 * returns counters (`resolver`, `total_resolved`, `for_beneficiary`,
 * `for_depositor`) rather than the disputes themselves. Throws `NotImplemented`
 * naming the entrypoint the contract would need.
 */
export function getDisputesByResolver(
  _invoker: DisputeInvoker,
  resolver: string
): Promise<DisputeRecord[]> {
  return Promise.reject(
    new VeriTixError(
      VeriTixErrorCode.NotImplemented,
      'getDisputesByResolver: the contract keeps no resolver-keyed dispute index — ' +
        'get_resolver_stats() returns only counters. Missing contract function: ' +
        `get_disputes_by_resolver(${resolver}) -> Vec<DisputeRecord>`,
    ),
  );
}
