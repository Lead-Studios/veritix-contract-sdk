/**
 * @module modules/recurring-actions
 * Recurring-schedule write actions (#662, #663, #664, #665).
 *
 * Companion to `./recurring.ts`'s read-only `RecurringModule` — kept
 * separate since that file has an in-flight contribution from another
 * contributor on this batch.
 *
 * `pauseRecurring`/`resumeRecurring` are each defined exactly once in this
 * file (per #663's own title) — the repo's test suite has, in the past,
 * accumulated more than one conflicting definition of the same method
 * across parallel scaffolds; this module is written from a clean slate
 * against the current `RecurringRecord` type to avoid repeating that.
 */

/** Minimal capability these actions need — satisfied by `VeriTixClient`. */
export interface RecurringInvoker {
  /** Simulates, signs, and submits a state-changing contract call. */
  invoke(method: string, args: unknown[]): Promise<unknown>;
}

/** Cancels a single recurring schedule. No further charges will execute. */
export async function cancel(invoker: RecurringInvoker, id: bigint): Promise<void> {
  await invoker.invoke('cancel_recurring', [id]);
}

/**
 * Cancels multiple recurring schedules in one call. Per-id failures are
 * collected rather than aborting the whole batch on the first error, so a
 * caller can retry only the ones that actually failed.
 */
export async function cancelBatch(
  invoker: RecurringInvoker,
  ids: bigint[]
): Promise<{ cancelled: bigint[]; failed: { id: bigint; error: string }[] }> {
  const cancelled: bigint[] = [];
  const failed: { id: bigint; error: string }[] = [];

  for (const id of ids) {
    try {
      await cancel(invoker, id);
      cancelled.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { cancelled, failed };
}

/** Pauses a recurring schedule — charges stop executing until resumed. */
export async function pauseRecurring(invoker: RecurringInvoker, id: bigint): Promise<void> {
  await invoker.invoke('pause_recurring', [id]);
}

/** Resumes a previously paused recurring schedule. */
export async function resumeRecurring(invoker: RecurringInvoker, id: bigint): Promise<void> {
  await invoker.invoke('resume_recurring', [id]);
}

/** Fields an amendment may change. At least one must be provided. */
export interface RecurringAmendment {
  amount?: bigint;
  interval?: number;
}

/**
 * Changes a recurring schedule's amount and/or charge interval.
 *
 * @throws {Error} if neither `amount` nor `interval` is provided, since an
 *   empty amendment is a caller bug rather than a valid no-op request.
 */
export async function amendRecurring(
  invoker: RecurringInvoker,
  id: bigint,
  amendment: RecurringAmendment
): Promise<void> {
  if (amendment.amount === undefined && amendment.interval === undefined) {
    throw new Error('amendRecurring requires at least one of amount or interval');
  }
  await invoker.invoke('amend_recurring', [id, amendment.amount ?? null, amendment.interval ?? null]);
}

/**
 * Moves a recurring schedule to a new payer wallet — e.g. when a user
 * rotates their signing key. The new payer must authorize the transfer.
 */
export async function transferPayer(
  invoker: RecurringInvoker,
  id: bigint,
  newPayer: string
): Promise<void> {
  await invoker.invoke('transfer_payer', [id, newPayer]);
}
