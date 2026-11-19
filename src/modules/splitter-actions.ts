/**
 * @module modules/splitter-actions
 * Split creation, preview, and distribution actions (#670, #671, #672, #673).
 *
 * Companion to `./splitter.ts`'s read-only `SplitterModule` — kept
 * separate since that file has an in-flight contribution from another
 * contributor on this batch.
 */
import type { ContractInvoker, SplitRecipient } from '../types';
import type { SplitRecipient } from '../types';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { isValidStellarAddress } from '../utils/network';
import { MAX_BATCH_SIZE } from '../utils/constants';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';

/** @deprecated Use {@link ContractInvoker} from the shared types module. */
export type SplitterInvoker = ContractInvoker;

const TOTAL_BPS = 10_000;

/**
 * Local pre-flight check for `recipients`: every address must be a valid
 * Stellar account, addresses must be unique, and shares must be positive
 * integers summing to exactly {@link TOTAL_BPS} (100%) — so a caller finds
 * out about a malformed split before spending a transaction on it (#669's
 * sibling validation, reused here as the guard `createSplit` runs first).
 *
 * Every problem is collected and reported together in one {@link VeriTixError};
 * the code reflects the first problem category found (invalid address,
 * duplicate address, empty/invalid input, or invalid shares).
 * @throws {VeriTixError} with code `InvalidInput` if `recipients` is empty,
 *   or `SplitInvalidShares` if any share is not a positive integer or the
 *   shares don't sum to exactly 10 000 bps.
 */
export function validateRecipients(recipients: SplitRecipient[]): void {
  const problems: { code: VeriTixErrorCode; message: string }[] = [];
  const seen = new Set<string>();
  let total = 0;

  if (recipients.length === 0) {
    problems.push({
      code: VeriTixErrorCode.InvalidInput,
      message: 'a split requires at least one recipient',
    });
    throw new VeriTixError(
      VeriTixErrorCode.InvalidInput,
      'a split requires at least one recipient',
    );
  }

  recipients.forEach(({ address, shareBps }, index) => {
    if (seen.has(address)) {
      problems.push({
        code: VeriTixErrorCode.InvalidInput,
        message: `duplicate recipient address: ${address}`,
      });
    } else {
      seen.add(address);
    }
    if (!isValidStellarAddress(address)) {
      problems.push({
        code: VeriTixErrorCode.InvalidAddress,
        message: `recipient ${index} has an invalid address: ${String(address)}`,
      });
    }
    if (!Number.isInteger(shareBps) || shareBps <= 0) {
      problems.push({
        code: VeriTixErrorCode.SplitInvalidShares,
        message: `recipient ${index} share must be a positive integer bps value, got ${shareBps}`,
      });
    } else {
      total += shareBps;
      throw new VeriTixError(
        VeriTixErrorCode.SplitInvalidShares,
        `recipient share must be a positive integer bps value, got ${shareBps}`,
      );
    }
  });

  if (recipients.length > 0 && total !== TOTAL_BPS) {
    problems.push({
      code: VeriTixErrorCode.SplitInvalidShares,
      message: `recipient shares must sum to ${TOTAL_BPS} bps, got ${total}`,
    });
  }

  if (problems.length > 0) {
    throw new VeriTixError(
      problems[0].code,
      `invalid split recipients: ${problems.map(({ message }) => message).join('; ')}`,
  if (total !== TOTAL_BPS) {
    throw new VeriTixError(
      VeriTixErrorCode.SplitInvalidShares,
      `recipient shares must sum to ${TOTAL_BPS} bps, got ${total}`,
    );
  }
}

/**
 * Creates a new payment split. Validates `recipients` locally first
 * (#669/#670) so a malformed split never reaches the network.
 *
 * @returns the new split's id.
 */
export async function createSplit(
  invoker: ContractInvoker,
  sender: string,
  recipients: SplitRecipient[],
  totalAmount: bigint
): Promise<bigint> {
  validateRecipients(recipients);
  const result = await invoker.invoke('create_split', [sender, recipients, totalAmount]);
  if (typeof result !== 'bigint') {
    throw new VeriTixError(
      VeriTixErrorCode.SplitNotFound,
      'create_split did not return a split id',
    );
  }
  return result;
}

/**
 * Convenience wrapper over {@link createSplit} for the common
 * organizer/artist/venue three-way revenue split (#671). Shares must each
 * be a positive integer bps value summing to 10 000; validated by the same
 * `validateRecipients` check `createSplit` runs.
 */
export async function createRevenueSplit(
  invoker: ContractInvoker,
  sender: string,
  totalAmount: bigint,
  shares: { organizer: { address: string; shareBps: number }; artist: { address: string; shareBps: number }; venue: { address: string; shareBps: number } }
): Promise<bigint> {
  const recipients: SplitRecipient[] = [shares.organizer, shares.artist, shares.venue];
  return createSplit(invoker, sender, recipients, totalAmount);
}

/** Previewed per-recipient payout for a not-yet-submitted split (#672). */
export interface RevenueSharePreviewEntry {
  address: string;
  shareBps: number;
  /** `floor(totalAmount * shareBps / 10_000)` — matches on-chain integer division. */
  amount: bigint;
}

/**
 * Computes what each recipient would receive from `totalAmount` under
 * `recipients`' bps shares, without submitting anything — so a UI can show
 * exact amounts before the user commits (#672).
 *
 * Remainder rule: each recipient is first assigned `floor(totalAmount *
 * shareBps / 10_000)` using integer division. The leftover stroops are then
 * assigned in full to the first recipient in `recipients`, so the previewed
 * amounts always sum to exactly `totalAmount` and the allocation is
 * deterministic for a given input order.
 */
export function getRevenueSharePreview(
  recipients: SplitRecipient[],
  totalAmount: bigint
): RevenueSharePreviewEntry[] {
  const amounts = recipients.map(
    ({ shareBps }) => (totalAmount * BigInt(shareBps)) / BigInt(TOTAL_BPS)
  );
  if (amounts.length === 0) {
    return [];
  }
  const remainder = totalAmount - amounts.reduce((sum, amount) => sum + amount, 0n);
  amounts[0] += remainder;
  return recipients.map(({ address, shareBps }, index) => ({
    address,
    shareBps,
    amount: amounts[index],
  }));
}

/**
 * Distributes a single split's funds to its recipients per their shares.
 *
 * #850 — the contract entrypoint is `distribute_split(caller, split_id)`
 * (`src/splitter.rs`), not `distribute`. It also takes the authorising
 * `caller` as its first argument; the contract requires that address's auth
 * and further checks it against the split's sender (or an admin), so
 * `caller` must be the address that signs the transaction.
 */
export async function distribute(
  invoker: ContractInvoker,
  caller: string,
  splitId: bigint
): Promise<void> {
  await invoker.invoke('distribute_split', [caller, splitId]);
}

/**
 * Distributes multiple splits in one call. Per-id failures are collected
 * rather than aborting the whole batch on the first error — no stubs,
 * per #673 (mirrors `cancelBatch`'s error-collection shape in
 * `recurring-actions.ts`).
 */
export async function bulkDistribute(
  invoker: ContractInvoker,
  caller: string,
  splitIds: bigint[]
): Promise<{ distributed: bigint[]; failed: { id: bigint; error: string }[] }> {
  if (splitIds.length > MAX_BATCH_SIZE) {
    throw new VeriTixError(
      VeriTixErrorCode.BatchTooLarge,
      `bulkDistribute supports at most ${MAX_BATCH_SIZE} split ids (got ${splitIds.length})`,
    );
  }

  const distributed: bigint[] = [];
  const failed: { id: bigint; error: string }[] = [];

  for (const id of splitIds) {
    try {
      await distribute(invoker, caller, id);
      distributed.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { distributed, failed };
}
