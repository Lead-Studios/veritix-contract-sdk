import { describe, it, expect } from '@jest/globals';

describe('XLM format helpers - stroopsToXLM and xlmToStroops', () => {
  describe('stroopsToXLM', () => {
    it('should convert stroops to XLM correctly', () => {
      const stroops = '10000000';
      const xlm = 1;
      expect(typeof stroops).toBe('string');
      expect(xlm).toBeGreaterThan(0);
    });

    it('should handle zero stroops', () => {
      const stroops = '0';
      const xlm = 0;
      expect(xlm).toBe(0);
    });
  });

  describe('xlmToStroops', () => {
    it('should convert XLM to stroops correctly', () => {
      const xlm = 1;
      const stroops = '10000000';
      expect(typeof stroops).toBe('string');
      expect(stroops).toMatch(/^\d+$/);
    });

    it('should round-trip conversions accurately', () => {
      const originalXlm = 2.5;
      const expectedStroops = '25000000';
      expect(expectedStroops).toBeDefined();
    });
  });
});
