import { FeeService } from '../../../src/core/fee/fee.service';

describe('FeeService', () => {
  let service: FeeService;

  beforeEach(() => {
    service = new FeeService();
  });

  it('should return a valid fee estimate payload', async () => {
    const result = await service.estimateFee({ type: 'invokeContract' });
    
    expect(result.totalFeeStroops).toBe('150000');
    expect(result.totalFeeXlm).toBe('0.0150000');
    expect(result.components.baseFee).toBe(100);
  });
});
