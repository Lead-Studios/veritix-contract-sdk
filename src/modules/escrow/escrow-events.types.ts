export type EscrowEventType = 'CREATED' | 'FUNDED' | 'RELEASE_REQUESTED' | 'RELEASED' | 'DISPUTED' | 'REFUNDED';

export interface EscrowEventPayload {
  escrowId: string;
  eventType: EscrowEventType;
  timestampIso: string;
  txHash: string;
}

export interface WatchOptions {
  pollingIntervalMs?: number;
  maxEvents?: number;
}
