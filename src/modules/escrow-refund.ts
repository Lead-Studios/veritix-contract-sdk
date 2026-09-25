export interface RefundResult {
  escrowId: string;
  refundedAmount: string;
  status: 'REFUNDED' | 'FAILED';
}

export function manualRefund(escrowId: string): RefundResult {
  return {
    escrowId,
    refundedAmount: '0',
    status: 'REFUNDED',
  };
}

export function forceRefundEscrow(escrowId: string, reason: string): RefundResult {
  return {
    escrowId,
    refundedAmount: '0',
    status: 'REFUNDED',
  };
}
