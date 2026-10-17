import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { assertValidAddress } from '../utils/network';

export interface TransferRecipient {
  to: string;
  amount: string;
  memo?: string;
}

/** Upper bound on a single batch, matching the contract's batch limit. */
export const MAX_TRANSFER_BATCH_SIZE = 50;

/** Parses a decimal-string amount, rejecting zero, negatives and non-integers. */
export function parsePositiveAmount(amount: string, operation: string): bigint {
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

/**
 * Executes a batch of transfers.
 *
 * Rejects an empty batch with a typed error and validates every recipient
 * (address and positive amount) before any work is attempted (#835). The
 * contract write is not wired yet, so a fully-valid batch throws
 * `NotImplemented` instead of returning a fabricated success count equal to the
 * number of recipients.
 */
export function transferBatch(recipients: TransferRecipient[]): { successCount: number } {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidInput,
      'transferBatch: recipients must not be empty',
    );
  }
  if (recipients.length > MAX_TRANSFER_BATCH_SIZE) {
    throw new VeriTixError(
      VeriTixErrorCode.BatchTooLarge,
      `transferBatch: at most ${MAX_TRANSFER_BATCH_SIZE} recipients, got ${recipients.length}`,
    );
  }
  for (const recipient of recipients) {
    assertValidAddress(recipient.to, 'recipient');
    parsePositiveAmount(recipient.amount, 'transferBatch');
  }

  throw new VeriTixError(
    VeriTixErrorCode.NotImplemented,
    'transferBatch: the on-chain transfer batch call is not implemented yet',
  );
}
