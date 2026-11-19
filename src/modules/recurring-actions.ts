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
import type { ContractInvoker } from '../types';
import { MAX_BATCH_SIZE } from '../utils/constants';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { assertValidAddress } from '../utils/network';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';

/** @deprecated Use {@link ContractInvoker} from the shared types module. */
export type RecurringInvoker = ContractInvoker;

/** Cancels a single recurring schedule. No further charges will execute. */
export async function cancel(invoker: ContractInvoker, id: bigint): Promise<void> {
  await invoker.invoke('cancel_recurring', [id]);
}

/**
 * Cancels multiple recurring schedules in one call. Per-id failures are
 * collected rather than aborting the whole batch on the first error, so a
 * caller can retry only the ones that actually failed.
 */
export async function cancelBatch(
  invoker: ContractInvoker,
  ids: bigint[]
): Promise<{ cancelled: bigint[]; failed: { id: bigint; error: string }[] }> {
  if (ids.length > MAX_BATCH_SIZE) {
    throw new VeriTixError(
      VeriTixErrorCode.BatchTooLarge,
      `cancelBatch supports at most ${MAX_BATCH_SIZE} ids (got ${ids.length})`,
    );
  }

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
export async function pauseRecurring(invoker: ContractInvoker, id: bigint): Promise<void> {
  await invoker.invoke('pause_recurring', [id]);
}

/** Resumes a previously paused recurring schedule. */
export async function resumeRecurring(invoker: ContractInvoker, id: bigint): Promise<void> {
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
 * @throws {VeriTixError} with code `InvalidInput` if neither `amount` nor
 *   `interval` is provided, since an empty amendment is a caller bug rather
 *   than a valid no-op request.
 */
export async function amendRecurring(
  invoker: ContractInvoker,
  id: bigint,
  amendment: RecurringAmendment
): Promise<void> {
  if (amendment.amount === undefined && amendment.interval === undefined) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidInput,
      'amendRecurring requires at least one of amount or interval',
    );
  }
  if (
    amendment.amount !== undefined &&
    (typeof amendment.amount !== 'bigint' || amendment.amount <= 0n)
  ) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidAmount,
      `amendRecurring: amount must be greater than zero, got ${String(amendment.amount)}`,
    );
  }
  if (
    amendment.interval !== undefined &&
    (typeof amendment.interval !== 'number' ||
      !Number.isInteger(amendment.interval) ||
      amendment.interval <= 0)
  ) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidInput,
      `amendRecurring: interval must be a positive integer, got ${String(amendment.interval)}`,
    );
  }
  await invoker.invoke('amend_recurring', [id, amendment.amount ?? null, amendment.interval ?? null]);
}

/**
 * Moves a recurring schedule to a new payer wallet — e.g. when a user
 * rotates their signing key.
 *
 * #849 — the contract entrypoint is `transfer_recurring_payer(caller,
 * recurring_id, new_payer)`, so this takes the authorising `caller` as its
 * first contract argument. There is no `transfer_payer` entrypoint, and
 * `caller` must be the address that signs the transaction (the contract
 * calls `caller.require_auth()`); the new payer authorises nothing itself.
 */
export async function transferPayer(
  invoker: ContractInvoker,
  caller: string,
  id: bigint,
  newPayer: string
): Promise<void> {
  assertValidAddress(newPayer, 'newPayer');
  await invoker.invoke('transfer_recurring_payer', [caller, id, newPayer]);
}
