export type TxStatus = 'SUCCESS' | 'FAILED' | 'NOT_FOUND';

export interface PollingConfig {
  maxRetries: number;
  intervalMs: number;
}

export interface PollingResult {
  status: TxStatus;
  hash: string;
  error?: string;
}
