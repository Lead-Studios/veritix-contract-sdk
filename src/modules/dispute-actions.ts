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
