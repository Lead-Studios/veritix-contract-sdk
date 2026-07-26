import { VeriTixClient } from '../../../src/core/account/account.service';

describe('VeriTixClient', () => {
  let client: VeriTixClient;

  beforeEach(() => {
    client = new VeriTixClient();
  });

  it('should fetch account info for a valid public key', async () => {
    const pubKey = 'GD2ABC...';
    const result = await client.getAccountInfo(pubKey);
    
    expect(result.accountId).toBe(pubKey);
    expect(result.sequenceNumber).toBe('123456789012345678');
    expect(result.balances[0].assetType).toBe('native');
    expect(result.balances[0].balance).toBe('1000.0000000');
  });
});
