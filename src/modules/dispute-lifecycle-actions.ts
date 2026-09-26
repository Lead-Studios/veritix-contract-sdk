/**
 * @module modules/dispute-lifecycle-actions
 * Dispute expiry and appeal actions (#654, #655).
 *
 * A third companion to `./dispute.ts` (read-only DisputeModule) and
 * `./dispute-actions.ts` (open/resolve/listing) — kept separate since both
 * of those already have in-flight contributions from other contributors on
 * this batch. Imports the shared `DisputeInvoker` shape structurally
 * (TypeScript interfaces are duck-typed, so no runtime import is needed)
 * to stay consistent without creating a file dependency.
 */
import type { DisputeRecord } from '../types';

/** Minimal capability these actions need — satisfied by `VeriTixClient`. */
export interface DisputeLifecycleInvoker {
  /** Simulates a read-only contract call and returns its decoded native value. */
  simulateRead(method: string, args: unknown[]): Promise<unknown>;
  /** Simulates, signs, and submits a state-changing contract call. */
  invoke(method: string, args: unknown[]): Promise<unknown>;
}

function toDisputeRecord(raw: unknown): DisputeRecord {
  const r = raw as Record<string, unknown>;
  return {
    id: r.id as bigint,
    escrowId: (r.escrow_id ?? r.escrowId) as bigint,
    claimant: r.claimant as string,
    resolver: r.resolver as string,
    status: r.status as string,
    openedAt: (r.opened_at ?? r.openedAt) as number,
  };
}

/**
 * Sweeps an abandoned dispute — one that's been open past its resolution
 * deadline with no arbiter action — transitioning it to `"expired"` so the
 * underlying escrow can be unblocked (#654).
 *
 * @throws {Error} for a negative dispute id, since ids are non-negative
 *   on-chain identifiers and a negative value can only be a caller bug.
 */
export async function expireDispute(
  invoker: DisputeLifecycleInvoker,
  disputeId: bigint
): Promise<DisputeRecord> {
  if (disputeId < 0n) {
    throw new Error(`invalid dispute id: ${disputeId}`);
  }
  const raw = await invoker.invoke('expire_dispute', [disputeId]);
  return toDisputeRecord(raw);
}

/** Evidence payload accepted by {@link appealDispute}. */
export interface DisputeAppeal {
  /** New evidence justifying reopening a resolved/expired dispute. Required, non-empty. */
  newEvidence: string;
}

/**
 * Reopens a resolved (or expired) dispute given new evidence, transitioning
 * it to `"reopened"` so the original resolver — or a fresh arbitration
 * round — can reconsider it (#655).
 *
 * @throws {Error} if `appeal.newEvidence` is empty, since an appeal with no
 *   stated reason is indistinguishable from spam re-litigation.
 */
export async function appealDispute(
  invoker: DisputeLifecycleInvoker,
  disputeId: bigint,
  appeal: DisputeAppeal
): Promise<DisputeRecord> {
  if (appeal.newEvidence.trim().length === 0) {
    throw new Error('Evidence required');
  }
  const raw = await invoker.invoke('appeal_dispute', [disputeId, appeal.newEvidence]);
  return toDisputeRecord(raw);
}
