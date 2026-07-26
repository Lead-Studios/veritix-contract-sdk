import { DisputeModule } from '../../../src/modules/dispute/dispute.service';

describe('DisputeModule', () => {
  let module: DisputeModule;

  beforeEach(() => {
    module = new DisputeModule();
  });

  it('should return a suggested resolver for a given category', async () => {
    const result = await module.suggestResolver('freelance');
    expect(result.resolvers.length).toBeGreaterThan(0);
    expect(result.resolvers[0].score).toBe(98);
    expect(result.resolvers[0].specialization).toContain('freelance');
  });
});
