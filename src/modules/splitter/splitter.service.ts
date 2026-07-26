import { splitConfigSchema, bpsValidationResultSchema } from './splitter.schemas';
import type { SplitConfig, BpsValidationResult } from './splitter.types';

export class SplitterModule {
  /**
   * Validates a split configuration ensuring the total allocated BPS does not exceed 10000.
   */
  public createRevenueSplit(config: SplitConfig): BpsValidationResult {
    splitConfigSchema.parse(config);
    
    const { organizerBps, artistBps } = config;
    const totalAllocated = organizerBps + artistBps;

    if (totalAllocated > 10000) {
      return bpsValidationResultSchema.parse({
        isValid: false,
        platformBps: 0,
        error: `Total allocated BPS (${totalAllocated}) exceeds 10000. Platform share would be negative.`,
      });
    }

    const platformBps = 10000 - totalAllocated;

    return bpsValidationResultSchema.parse({
      isValid: true,
      platformBps,
    });
  }
}
