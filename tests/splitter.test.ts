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
