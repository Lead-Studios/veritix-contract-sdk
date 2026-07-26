import { accountInfoSchema } from './account.schemas';
import type { AccountInfo } from './account.types';

export class VeriTixClient {
  /**
   * Fetches the Stellar account balance, sequence, and signers from Horizon
   */
  public async getAccountInfo(accountId: string): Promise<AccountInfo> {
    // Mocking the horizon call
    const result: AccountInfo = {
      accountId,
      sequenceNumber: '123456789012345678',
      balances: [
        { assetType: 'native', balance: '1000.0000000' },
      ],
      signers: [
        { key: accountId, weight: 1 },
      ],
    };

    return accountInfoSchema.parse(result);
  }
}
