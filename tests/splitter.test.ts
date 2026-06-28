import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('SplitterModule.getSplitsBySender (stub)', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), Keypair.random());

  beforeAll(async () => {
    await client.connect();
  });

  it('returns empty array for unknown sender', async () => {
    const splits = await client.splitter.getSplitsBySender('GUNKNOWN...');
    expect(Array.isArray(splits)).toBe(true);
    expect(splits.length).toBe(0);
  });
});

// Tests for validateRecipients

describe('SplitterModule.validateRecipients', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), Keypair.random());

  beforeAll(async () => {
    await client.connect();
  });

  it('returns invalid when total bps < 10000', () => {
    const result = client.splitter.validateRecipients([
      { address: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', shareBps: 5000 },
      { address: 'GBZXN7PIRZGNMHGA76QJRYR3ERW7VH2MJL7G2P6CC6QH5M2LQJUSVQ6C', shareBps: 4000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Total basis points must equal 10 000, got 9000');
  });

  it('returns invalid when total bps > 10000', () => {
    const result = client.splitter.validateRecipients([
      { address: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', shareBps: 6000 },
      { address: 'GBZXN7PIRZGNMHGA76QJRYR3ERW7VH2MJL7G2P6CC6QH5M2LQJUSVQ6C', shareBps: 5000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('10 000'))).toBe(true);
  });

  it('returns valid when total bps = 10000', () => {
    const result = client.splitter.validateRecipients([
      { address: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', shareBps: 6000 },
      { address: 'GBZXN7PIRZGNMHGA76QJRYR3ERW7VH2MJL7G2P6CC6QH5M2LQJUSVQ6C', shareBps: 4000 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns invalid for duplicate addresses', () => {
    const addr = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
    const result = client.splitter.validateRecipients([
      { address: addr, shareBps: 5000 },
      { address: addr, shareBps: 5000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);
  });

  it('returns invalid when more than 20 recipients', () => {
    const recipients = Array.from({ length: 21 }, (_, i) => ({
      address: `G${'A'.repeat(54)}${i}`.slice(0, 56),
      shareBps: Math.floor(10000 / 21),
    }));
    // Fix totals so only the count error fires
    const result = client.splitter.validateRecipients(recipients);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Too many recipients'))).toBe(true);
  });

  it('returns invalid for a recipient with shareBps = 0', () => {
    const result = client.splitter.validateRecipients([
      { address: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', shareBps: 0 },
      { address: 'GBZXN7PIRZGNMHGA76QJRYR3ERW7VH2MJL7G2P6CC6QH5M2LQJUSVQ6C', shareBps: 10000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-positive'))).toBe(true);
  });

  it('returns valid for a single recipient with shareBps = 10000', () => {
    const result = client.splitter.validateRecipients([
      { address: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', shareBps: 10000 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// New tests for createRevenueSplit

describe('SplitterModule.createRevenueSplit (validation)', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), Keypair.random());

  beforeAll(async () => {
    await client.connect();
  });

  it('throws SplitInvalidShares when organizerBps + artistBps >= 10000', async () => {
    await expect(
      client.splitter.createRevenueSplit({
        organizer: 'GORG...',
        organizerBps: 6000,
        artist: 'GART...',
        artistBps: 4000,
        platform: 'GPLAT...',
        totalAmount: 1_000_000n,
      })
    ).rejects.toMatchObject({ code: VeriTixErrorCode.SplitInvalidShares });
  });
});
