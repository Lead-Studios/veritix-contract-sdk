import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { assertValidAddress } from '../utils/network';

export interface BatchFreezeOptions {
  addresses: string[];
}

/** Upper bound on a single freeze/unfreeze batch. */
export const MAX_FREEZE_BATCH_SIZE = 50;

/** Validates the batch size and every address before any work is attempted. */
function validateOptions(options: BatchFreezeOptions, operation: string): void {
  const addresses = options?.addresses;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidInput,
      `${operation}: addresses must not be empty`,
    );
  }
  if (addresses.length > MAX_FREEZE_BATCH_SIZE) {
    throw new VeriTixError(
      VeriTixErrorCode.BatchTooLarge,
      `${operation}: at most ${MAX_FREEZE_BATCH_SIZE} addresses, got ${addresses.length}`,
    );
  }
  for (const address of addresses) {
    assertValidAddress(address, 'address');
  }
}

/**
 * Freezes a batch of accounts.
 *
 * Validates every address and the batch-size limit up front (#833). The
 * contract write is not wired yet, so a validated batch throws `NotImplemented`
 * instead of returning a count while freezing nothing. Once wired, each address
 * is frozen via the contract's `freeze_until` entrypoint.
 */
export function freezeBatch(options: BatchFreezeOptions): { frozenCount: number } {
  validateOptions(options, 'freezeBatch');
  throw new VeriTixError(
    VeriTixErrorCode.NotImplemented,
    'freezeBatch: the on-chain freeze call is not implemented yet',
  );
}

/**
 * Unfreezes a batch of accounts.
 *
 * Validates every address and the batch-size limit up front (#833). The
 * contract write is not wired yet, so a validated batch throws `NotImplemented`
 * instead of returning a count while unfreezing nothing.
 */
export function unfreezeBatch(options: BatchFreezeOptions): { unfrozenCount: number } {
  validateOptions(options, 'unfreezeBatch');
  throw new VeriTixError(
    VeriTixErrorCode.NotImplemented,
    'unfreezeBatch: the on-chain unfreeze call is not implemented yet',
  );
}
