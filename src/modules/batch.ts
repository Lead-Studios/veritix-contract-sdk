export const MAX_BATCH_SIZE = 100;

export class BatchModule {
  public validateBatchSize(itemsCount: number): boolean {
    if (itemsCount <= 0 || itemsCount > MAX_BATCH_SIZE) {
      throw new Error(`Batch size must be between 1 and ${MAX_BATCH_SIZE}`);
    }
    return true;
  }
}
