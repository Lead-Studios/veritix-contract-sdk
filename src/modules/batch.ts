import { MAX_BATCH_SIZE } from '../utils/constants';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';

export { MAX_BATCH_SIZE };

/** Minimal capability `BatchModule` needs — satisfied by `VeriTixClient`. */
export interface BatchClient {
  invoke(method: string, args: unknown[]): Promise<unknown>;
}

export interface BatchMintItem {
  to: string;
  amount: bigint;
}

export interface BatchTransferItem {
  address: string;
  amount: bigint;
  memo?: string;
}

/** Batched token operations; every method validates the batch size first. */
export class BatchModule {
  constructor(private readonly client?: BatchClient) {}

  public validateBatchSize(itemsCount: number): boolean {
    if (itemsCount <= 0 || itemsCount > MAX_BATCH_SIZE) {
      throw new VeriTixError(
        VeriTixErrorCode.BatchTooLarge,
        `Batch size must be between 1 and ${MAX_BATCH_SIZE}`,
      );
    }
    return true;
  }

  private call(method: string, items: unknown[]): Promise<unknown> {
    this.validateBatchSize(items.length);
    if (!this.client) {
      throw new VeriTixError(
        VeriTixErrorCode.NotConnected,
        'BatchModule was constructed without a client',
      );
    }
    return this.client.invoke(method, [items]);
  }

  async mintBatch(items: BatchMintItem[]): Promise<void> {
    await this.call('mint_batch', items);
  }

  async burnFromBatch(items: BatchMintItem[]): Promise<void> {
    await this.call('burn_from_batch', items);
  }

  async transferBatch(items: BatchTransferItem[]): Promise<void> {
    await this.call('transfer_batch', items);
  }

  async transferBatchWithMemo(items: (BatchTransferItem & { memo: string })[]): Promise<void> {
    await this.call('transfer_batch_with_memo', items);
  }

  async freezeBatch(addresses: string[]): Promise<void> {
    await this.call('freeze_batch', addresses);
  }

  async unfreezeBatch(addresses: string[]): Promise<void> {
    await this.call('unfreeze_batch', addresses);
  }
}
