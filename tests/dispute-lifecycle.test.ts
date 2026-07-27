/**
 * Unit tests for DisputeModule.expireDispute and appealDispute
 */

import { DisputeModule } from '../src/modules/dispute';

describe('DisputeModule Lifecycle Tests', () => {
  let disputeModule: DisputeModule;

  beforeEach(() => {
    disputeModule = new DisputeModule();
  });

  describe('expireDispute', () => {
    it('should expire a dispute after timeout', async () => {
      const disputeId = 1n;
      const result = await disputeModule.expireDispute(disputeId);
      expect(result).toBeDefined();
    });

    it('should throw error for invalid dispute ID', async () => {
      await expect(disputeModule.expireDispute(-1n)).rejects.toThrow();
    });

    it('should transition dispute to expired state', async () => {
      const disputeId = 2n;
      const result = await disputeModule.expireDispute(disputeId);
      expect(result.status).toBe('expired');
    });
  });

  describe('appealDispute', () => {
    it('should allow appeal of closed dispute', async () => {
      const disputeId = 1n;
      const result = await disputeModule.appealDispute(disputeId, {
        newEvidence: 'Supporting documents',
      });
      expect(result).toBeDefined();
    });

    it('should require valid evidence for appeal', async () => {
      await expect(
        disputeModule.appealDispute(1n, { newEvidence: '' })
      ).rejects.toThrow('Evidence required');
    });

    it('should create appeal with reopened status', async () => {
      const result = await disputeModule.appealDispute(1n, {
        newEvidence: 'New evidence',
      });
      expect(result.status).toBe('reopened');
    });
  });
});
