import { pollingResultSchema } from './polling.schemas';
import type { PollingResult, TxStatus } from './polling.types';

export class PollingService {
  /**
   * Mocks a horizon check that distinguishes FAILED vs NOT_FOUND
   */
  public async checkStatus(hash: string): Promise<PollingResult> {
    let status: TxStatus = 'NOT_FOUND';
    let error: string | undefined;

    if (hash === 'success_hash') {
      status = 'SUCCESS';
    } else if (hash === 'failed_hash') {
      status = 'FAILED';
      error = 'Transaction failed on ledger';
    }

    if (status === 'FAILED') {
      throw new Error(`Transaction failed immediately: ${error}`);
    }

    return pollingResultSchema.parse({ status, hash, error });
  }
}
