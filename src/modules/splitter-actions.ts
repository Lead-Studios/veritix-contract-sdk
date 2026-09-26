/**
 * @module modules/splitter-actions
 * Split creation, preview, and distribution actions (#670, #671, #672, #673).
 *
 * Companion to `./splitter.ts`'s read-only `SplitterModule` — kept
 * separate since that file has an in-flight contribution from another
 * contributor on this batch.
 */
import type { SplitRecipient } from '../types';

/** Minimal capability these actions need — satisfied by `VeriTixClient`. */
export interface SplitterInvoker {
  /** Simulates, signs, and submits a state-changing contract call. */
  invoke(method: string, args: unknown[]): Promise<unknown>;
}

const TOTAL_BPS = 10_000;

/**
 * Local pre-flight check that `recipients`' shares sum to exactly
 * {@link TOTAL_BPS} (100%) and every share is positive, so a caller finds
 * out about a malformed split before spending a transaction on it (#669's
 * sibling validation, reused here as the guard `createSplit` runs first).
 *
 * @throws {Error} if `recipients` is empty, any share is not a positive
 *   integer, or the shares don't sum to exactly 10 000 bps.
 */
export function validateRecipients(recipients: SplitRecipient[]): void {
  if (recipients.length === 0) {
    throw new Error('a split requires at least one recipient');
  }
  let total = 0;
  for (const { shareBps } of recipients) {
    if (!Number.isInteger(shareBps) || shareBps <= 0) {
      throw new Error(`recipient share must be a positive integer bps value, got ${shareBps}`);
    }
    total += shareBps;
  }
  if (total !== TOTAL_BPS) {
    throw new Error(`recipient shares must sum to ${TOTAL_BPS} bps, got ${total}`);
  }
}

/**
 * Creates a new payment split. Validates `recipients` locally first
 * (#669/#670) so a malformed split never reaches the network.
 *
 * @returns the new split's id.
 */
export async function createSplit(
  invoker: SplitterInvoker,
  sender: string,
  recipients: SplitRecipient[],
  totalAmount: bigint
): Promise<bigint> {
  validateRecipients(recipients);
  const result = await invoker.invoke('create_split', [sender, recipients, totalAmount]);
  if (typeof result !== 'bigint') {
    throw new Error('create_split did not return a split id');
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
  invoker: SplitterInvoker,
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
 * Uses `floor` division (matching typical on-chain integer arithmetic), so
 * the sum of previewed amounts can be up to `recipients.length - 1` stroops
 * less than `totalAmount` due to rounding; that remainder's on-chain
 * handling is `distribute`'s concern, not this preview's.
 */
export function getRevenueSharePreview(
  recipients: SplitRecipient[],
  totalAmount: bigint
): RevenueSharePreviewEntry[] {
  return recipients.map(({ address, shareBps }) => ({
    address,
    shareBps,
    amount: (totalAmount * BigInt(shareBps)) / BigInt(TOTAL_BPS),
  }));
}

/** Distributes a single split's funds to its recipients per their shares. */
export async function distribute(invoker: SplitterInvoker, splitId: bigint): Promise<void> {
  await invoker.invoke('distribute', [splitId]);
}

/**
 * Distributes multiple splits in one call. Per-id failures are collected
 * rather than aborting the whole batch on the first error — no stubs,
 * per #673 (mirrors `cancelBatch`'s error-collection shape in
 * `recurring-actions.ts`).
 */
export async function bulkDistribute(
  invoker: SplitterInvoker,
  splitIds: bigint[]
): Promise<{ distributed: bigint[]; failed: { id: bigint; error: string }[] }> {
  const distributed: bigint[] = [];
  const failed: { id: bigint; error: string }[] = [];

  for (const id of splitIds) {
    try {
      await distribute(invoker, id);
      distributed.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { distributed, failed };
}
