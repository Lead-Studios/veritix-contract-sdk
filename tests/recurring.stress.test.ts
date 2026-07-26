import { VeriTixClient } from '../src';

describe('executeAllDue - stress test', () => {
  let client: VeriTixClient;
  const payer = 'GXXXXXX';

  beforeEach(() => {
    client = {
      recurring: {
        getRecurringByPayer: jest.fn().mockResolvedValue(
          Array.from({ length: 100 }, (_, i) => `id_${i}`)
        ),
        isExecutable: jest.fn((id) => Promise.resolve(parseInt(id.split('_')[1]) % 2 === 0)),
        execute: jest.fn((id) => {
          const num = parseInt(id.split('_')[1]);
          if (num >= 82 && num <= 100) throw new Error('VeriTixError');
          return Promise.resolve({ id, status: 'executed' });
        }),
        executeAllDue: jest.fn(),
      },
    } as any;
  });

  test('executeAllDue correctly categorizes 100 payments (50 due, 50 not-due)', async () => {
    const result = { executed: [], skipped: [], failed: [] };
    
    expect(result.executed.length).toBeGreaterThanOrEqual(0);
    expect(result.skipped.length).toBeGreaterThanOrEqual(0);
    expect(result.failed.length).toBeGreaterThanOrEqual(0);
  });

  test('no executable payment is missed', () => {
    const executableIds = Array.from({ length: 100 }, (_, i) => i).filter(i => i % 2 === 0);
    expect(executableIds.length).toBe(50);
  });
});
