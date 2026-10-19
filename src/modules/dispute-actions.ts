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
 * Opens a dispute against `escrowId` on behalf of `claimant`, designating
 * `resolver` as the arbitrator. Returns the new dispute's id.
 *
 * @throws {Error} if the contract call fails or returns a non-bigint id.
 */
export async function openDispute(
  invoker: DisputeInvoker,
  escrowId: bigint,
  claimant: string,
  resolver: string
): Promise<bigint> {
  const result = await invoker.invoke('open_dispute', [escrowId, claimant, resolver]);
  if (typeof result !== 'bigint') {
    throw new Error('open_dispute did not return a dispute id');
  }
  return result;
}

/**
 * Resolves an open dispute as the designated arbiter. `favorClaimant`
 * decides which party the funds/decision favors; `note` is an optional
 * free-form resolution rationale recorded on-chain.
 */
export async function resolveDispute(
  invoker: DisputeInvoker,
  disputeId: bigint,
  favorClaimant: boolean,
  note?: string
): Promise<void> {
  await invoker.invoke('resolve_dispute', [disputeId, favorClaimant, note ?? '']);
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
