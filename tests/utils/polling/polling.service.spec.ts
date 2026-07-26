import { PollingService } from '../../../src/utils/polling/polling.service';

describe('PollingService', () => {
  let service: PollingService;

  beforeEach(() => {
    service = new PollingService();
  });

  it('should return SUCCESS for a successful hash', async () => {
    const result = await service.checkStatus('success_hash');
    expect(result.status).toBe('SUCCESS');
  });

  it('should return NOT_FOUND for an unknown hash to allow retry', async () => {
    const result = await service.checkStatus('unknown_hash');
    expect(result.status).toBe('NOT_FOUND');
  });

  it('should throw immediately for a FAILED hash', async () => {
    await expect(service.checkStatus('failed_hash')).rejects.toThrow('Transaction failed immediately');
  });
});
