import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { assertValidAddress } from '../utils/network';

export interface MintItem {
  to: string;
  amount: string;
}

/** Upper bound on a single batch, matching the contract's batch limit. */
export const MAX_MINT_BATCH_SIZE = 50;

/** Parses a decimal-string amount, rejecting zero, negatives and non-integers. */
function parsePositiveAmount(amount: string, operation: string): bigint {
  if (typeof amount !== 'string' || !/^[0-9]+$/.test(amount)) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidAmount,
      `${operation}: amount must be a positive integer string, got "${String(amount)}"`,
    );
  }
  const value = BigInt(amount);
  if (value <= 0n) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidAmount,
      `${operation}: amount must be greater than zero`,
    );
  }
  return value;
}

/** Validates batch size, addresses and positive amounts up front. */
function validateItems(items: MintItem[], operation: string): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidInput,
      `${operation}: items must not be empty`,
    );
  }
  if (items.length > MAX_MINT_BATCH_SIZE) {
    throw new VeriTixError(
      VeriTixErrorCode.BatchTooLarge,
      `${operation}: at most ${MAX_MINT_BATCH_SIZE} items, got ${items.length}`,
    );
  }
  for (const item of items) {
    assertValidAddress(item.to, 'recipient');
    parsePositiveAmount(item.amount, operation);
  }
}

/**
 * Mints to a batch of recipients.
 *
 * Validates every address and positive amount up front (#834). The contract
 * write is not wired yet, so a validated batch throws `NotImplemented` rather
 * than returning the item *count* mislabelled as the amount minted. Once wired,
 * it returns the summed `bigint` amount actually minted.
 */
export function mintBatch(items: MintItem[]): { mintedTotal: bigint } {
  validateItems(items, 'mintBatch');
  throw new VeriTixError(
    VeriTixErrorCode.NotImplemented,
    'mintBatch: the on-chain batch mint call is not implemented yet',
  );
}

/**
 * Burns from a batch of accounts using the caller's allowance.
 *
 * Validates every address and positive amount up front (#834). The contract
 * write is not wired yet, so a validated batch throws `NotImplemented` rather
 * than returning the item *count* mislabelled as the amount burned.
 */
export function burnFromBatch(items: MintItem[]): { burnedTotal: bigint } {
  validateItems(items, 'burnFromBatch');
  throw new VeriTixError(
    VeriTixErrorCode.NotImplemented,
    'burnFromBatch: the on-chain batch burn call is not implemented yet',
  );
}
