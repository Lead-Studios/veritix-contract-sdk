export type EscrowStatus = 'PENDING' | 'FUNDED' | 'RELEASED' | 'REFUNDED' | 'DISPUTED';

export interface EscrowStatusUpdate {
  escrowId: string;
  status: EscrowStatus;
  lastUpdatedIso: string;
}

export interface BatchEscrowStatusResult {
  statuses: EscrowStatusUpdate[];
  failedIds: string[];
}
