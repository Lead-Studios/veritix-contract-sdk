import { EscrowModule } from '../../../src/modules/escrow/escrow.service';

describe('EscrowModule', () => {
  let module: EscrowModule;

  beforeEach(() => {
    module = new EscrowModule();
  });

  it('should return statuses for valid escrow IDs', async () => {
    const result = await module.batchGetEscrowStatus(['escrow_123', 'escrow_456']);
    expect(result.statuses.length).toBe(2);
    expect(result.failedIds.length).toBe(0);
    expect(result.statuses[0].status).toBe('FUNDED');
  });

  it('should return failedIds for invalid escrow IDs', async () => {
    const result = await module.batchGetEscrowStatus(['escrow_123', 'invalid_789']);
    expect(result.statuses.length).toBe(1);
    expect(result.failedIds.length).toBe(1);
    expect(result.failedIds[0]).toBe('invalid_789');
  });
});
