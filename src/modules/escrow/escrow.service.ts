import { batchEscrowStatusResultSchema } from './escrow.schemas';
import type { BatchEscrowStatusResult, EscrowStatusUpdate, EscrowStatus } from './escrow.types';

export class EscrowModule {
  /**
   * Batch fetches escrow status fields without doing a full parse of the entire escrow data structure
   */
  public async batchGetEscrowStatus(escrowIds: string[]): Promise<BatchEscrowStatusResult> {
    const statuses: EscrowStatusUpdate[] = [];
    const failedIds: string[] = [];

    // Mocking the RPC call to fetch partial state
    for (const id of escrowIds) {
      if (id.startsWith('invalid')) {
        failedIds.push(id);
      } else {
        statuses.push({
          escrowId: id,
          status: 'FUNDED',
          lastUpdatedIso: new Date().toISOString(),
        });
      }
    }

    const result = { statuses, failedIds };
    return batchEscrowStatusResultSchema.parse(result);
  }
}
