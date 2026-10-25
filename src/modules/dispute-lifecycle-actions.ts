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

/** Minimal capability these actions need — satisfied by `VeriTixClient`. */
export interface DisputeLifecycleInvoker {
  /** Simulates a read-only contract call and returns its decoded native value. */
  simulateRead(method: string, args: unknown[]): Promise<unknown>;
  /** Simulates, signs, and submits a state-changing contract call. */
  invoke(method: string, args: unknown[]): Promise<unknown>;
}

/**
 * Sweeps an abandoned dispute — one that's been open past its resolution
 * deadline with no arbiter action — transitioning it to `"expired"` so the
 * underlying escrow can be unblocked (#654).
 *
 * #852 — the contract entrypoint is `expire_dispute(caller, escrow_id)`: it is
 * keyed by the escrow the dispute is attached to, not by a dispute id, and
 * `caller` must be the address that signs the transaction (the contract calls
 * `caller.require_auth()`). The contract function returns nothing, so there is
 * no updated record to hand back — re-read the dispute if you need one.
 *
 * @throws {Error} for a negative escrow id, since ids are non-negative
 *   on-chain identifiers and a negative value can only be a caller bug.
 */
export async function expireDispute(
  invoker: DisputeLifecycleInvoker,
  caller: string,
  escrowId: bigint
): Promise<void> {
  if (escrowId < 0n) {
    throw new Error(`invalid escrow id: ${escrowId}`);
  }
  await invoker.invoke('expire_dispute', [caller, escrowId]);
}

/**
 * Appeals (escalates) the open dispute on `escrowId`, marking it pending so it
 * is handled through the appeal path rather than a normal resolution (#655).
 *
 * #852 — the contract entrypoint is `appeal_dispute(caller, escrow_id)`. The
 * previous `DisputeAppeal` evidence payload is gone: the contract takes no
 * evidence argument, keys the dispute by escrow id, and takes only the
 * authorising caller. `caller` must be the escrow's depositor or beneficiary
 * and the address that signs the transaction. The contract function returns
 * nothing, so this resolves to `void`.
 */
export async function appealDispute(
  invoker: DisputeLifecycleInvoker,
  caller: string,
  escrowId: bigint
): Promise<void> {
  await invoker.invoke('appeal_dispute', [caller, escrowId]);
}
