/**
 * @module modules/splitter
 * SplitterModule — read surface for on-chain payment-split records
 * (#667, #668).
 *
 * Mirrors `./dispute.ts`'s DisputeModule and `./recurring.ts`'s
 * RecurringModule shape: a small class built around a minimal read-only
 * capability rather than the full client, so it's unit-testable without
 * RPC mocking. Wiring a `readonly splitter = new SplitterModule(...)`
 * property into `VeriTixClient` is a follow-up left for a maintainer,
 * since `client.ts` is shared across several in-flight contributions on
 * this batch.
 */
import type { SplitRecipient, SplitRecord } from '../types';
import * as actions from './splitter-actions';
import type { SplitterInvoker, RevenueSharePreviewEntry } from './splitter-actions';

/** Minimal read capability a `SplitterModule` needs — satisfied by `VeriTixClient`. */
export interface SplitterReader {
  /** Simulates a read-only contract call and returns its decoded native value. */
  simulateRead(method: string, args: unknown[]): Promise<unknown>;
}

function decodeSplitRecipient(raw: unknown): SplitRecipient {
  const r = raw as Record<string, unknown>;
  const address = r.address;
  const shareBps = r.share_bps ?? r.shareBps;
  if (typeof address !== 'string' || typeof shareBps !== 'number') {
    throw new Error('split recipient is missing address or shareBps');
  }
  return { address, shareBps };
}

/**
 * Decodes a raw `scValToNative`-decoded split struct into a typed
 * {@link SplitRecord}, normalizing the contract's snake_case fields to the
 * SDK's camelCase surface — no stubs, all fields fully decoded (#668).
 *
 * @throws {Error} if `raw` is not an object, is missing a required field,
 *   or `recipients` isn't a vector.
 */
export function decodeSplitRecord(raw: unknown): SplitRecord {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('split record is not an object');
  }
  const r = raw as Record<string, unknown>;
  const id = r.id;
  const sender = r.sender;
  const recipientsRaw = r.recipients;
  const totalAmount = r.total_amount ?? r.totalAmount;
  const distributed = r.distributed;
  const cancelled = r.cancelled ?? false;

  if (
    typeof id !== 'bigint' ||
    typeof sender !== 'string' ||
    typeof totalAmount !== 'bigint' ||
    typeof distributed !== 'boolean' ||
    typeof cancelled !== 'boolean'
  ) {
    throw new Error('split record is missing one or more required fields');
  }
  if (!Array.isArray(recipientsRaw)) {
    throw new Error('split record recipients is not a vector');
  }

  return {
    id,
    sender,
    recipients: recipientsRaw.map(decodeSplitRecipient),
    totalAmount,
    distributed,
    cancelled,
  };
}

export class SplitterModule {
  constructor(
    private readonly reader: SplitterReader,
    private readonly invoker?: SplitterInvoker
  ) {}

  private requireInvoker(): SplitterInvoker {
    if (!this.invoker) {
      throw new Error('SplitterModule was constructed without a write capability');
    }
    return this.invoker;
  }

  createSplit(sender: string, recipients: SplitRecipient[], totalAmount: bigint): Promise<bigint> {
    return actions.createSplit(this.requireInvoker(), sender, recipients, totalAmount);
  }

  createRevenueSplit(
    sender: string,
    totalAmount: bigint,
    shares: Parameters<typeof actions.createRevenueSplit>[3]
  ): Promise<bigint> {
    return actions.createRevenueSplit(this.requireInvoker(), sender, totalAmount, shares);
  }

  getRevenueSharePreview(recipients: SplitRecipient[], totalAmount: bigint): RevenueSharePreviewEntry[] {
    return actions.getRevenueSharePreview(recipients, totalAmount);
  }

  distribute(caller: string, splitId: bigint): Promise<void> {
    return actions.distribute(this.requireInvoker(), caller, splitId);
  }

  bulkDistribute(caller: string, splitIds: bigint[]) {
    return actions.bulkDistribute(this.requireInvoker(), caller, splitIds);
  }

  /** Returns the split for `id`, or `null` on a contract miss. */
  async getSplit(id: bigint): Promise<SplitRecord | null> {
    const raw = await this.reader.simulateRead('get_split', [id]);
    if (raw === null || raw === undefined) {
      return null;
    }
    return decodeSplitRecord(raw);
  }

  /** Every split initiated by `sender` (#668's listing reads — no stubs). */
  async getSplitsBySender(sender: string): Promise<SplitRecord[]> {
    const raw = await this.reader.simulateRead('get_splits_by_sender', [sender]);
    if (raw === null || raw === undefined) {
      return [];
    }
    if (!Array.isArray(raw)) {
      throw new Error('get_splits_by_sender did not return a vector');
    }
    return raw.map(decodeSplitRecord);
  }

  /** Every split naming `recipientAddress` as one of its recipients. */
  async getSplitsByRecipient(recipientAddress: string): Promise<SplitRecord[]> {
    const raw = await this.reader.simulateRead('get_splits_by_recipient', [recipientAddress]);
    if (raw === null || raw === undefined) {
      return [];
    }
    if (!Array.isArray(raw)) {
      throw new Error('get_splits_by_recipient did not return a vector');
    }
    return raw.map(decodeSplitRecord);
  }

  /** Every split not yet fully distributed. */
  async getPendingSplits(): Promise<SplitRecord[]> {
    const raw = await this.reader.simulateRead('get_pending_splits', []);
    if (raw === null || raw === undefined) {
      return [];
    }
    if (!Array.isArray(raw)) {
      throw new Error('get_pending_splits did not return a vector');
    }
    return raw.map(decodeSplitRecord);
  }
}
