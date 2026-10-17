import type { TransactionResult } from '../types';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';

/** Legacy result shape, kept for backwards compatibility. */
export interface RefundResult {
  escrowId: string;
  refundedAmount: string;
  status: 'REFUNDED' | 'FAILED';
}

/** Minimal capability the refund helpers need — satisfied by `VeriTixClient`. */
export interface EscrowRefundClient {
  invoke(method: string, args: unknown[]): Promise<TransactionResult>;
}

/**
 * Admin refund writes (#829).
 *
 * Both helpers call the contract's `force_refund_escrow(escrow_id, reason)` and
 * return its confirmed {@link TransactionResult}. The previous implementation
 * ignored `reason` and returned a hard-coded `REFUNDED` success without
 * touching the contract, which reported a refund that never happened.
 */
export class EscrowRefundModule {
  constructor(private readonly client: EscrowRefundClient) {}

  /** Admin refund with a default reason. */
  async manualRefund(escrowId: bigint, reason = 'manual refund'): Promise<TransactionResult> {
    return this.forceRefundEscrow(escrowId, reason);
  }

  /** Admin refund that carries the supplied reason. */
  async forceRefundEscrow(escrowId: bigint, reason: string): Promise<TransactionResult> {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidInput,
        'forceRefundEscrow: a non-empty reason is required',
      );
    }
    if (escrowId < 0n || escrowId > 0xffff_ffffn) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidInput,
        `forceRefundEscrow: escrow id ${escrowId} is out of range for u32`,
      );
    }
    return this.client.invoke('force_refund_escrow', [escrowId, reason]);
  }
}
