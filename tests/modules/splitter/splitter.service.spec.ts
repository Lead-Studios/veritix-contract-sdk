import { SplitterModule } from '../../../src/modules/splitter/splitter.service';

describe('SplitterModule', () => {
  let module: SplitterModule;

  beforeEach(() => {
    module = new SplitterModule();
  });

  it('should validate a correct split configuration and calculate platform share', () => {
    const result = module.createRevenueSplit({ organizerBps: 8000, artistBps: 1000 });
    expect(result.isValid).toBe(true);
    expect(result.platformBps).toBe(1000); // 10000 - 9000
  });

  it('should reject a split configuration that exceeds 10000 BPS in total', () => {
    const result = module.createRevenueSplit({ organizerBps: 6000, artistBps: 5000 });
    expect(result.isValid).toBe(false);
    expect(result.platformBps).toBe(0);
    expect(result.error).toContain('exceeds 10000');
  });
});
