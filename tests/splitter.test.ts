import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair, SorobanDataBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { VeriTixErrorCode } from '../src/utils/errors';
import * as transactionUtils from '../src/utils/transaction';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const ADDR_A = Keypair.random().publicKey();
const ADDR_B = Keypair.random().publicKey();

// A parsed Soroban simulation success that `SorobanRpc.assembleTransaction`
// can consume (transactionData.build(), result.auth, minResourceFee).
function parsedSuccess(retval: unknown = undefined): Record<string, unknown> {
  return {
    _parsed: true,
    latestLedger: 100,
    minResourceFee: '100',
    cost: { cpuInsns: '0', memBytes: '0' },
    transactionData: new SorobanDataBuilder(),
    result: { retval, auth: [] },
    events: [],
  };
}

// ---------------------------------------------------------------------------
// #464 — validateRecipients failure paths
// ---------------------------------------------------------------------------
describe('SplitterModule.validateRecipients', () => {
  // validateRecipients is synchronous / pure — no connection or keypair required.
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('is invalid for duplicate addresses', () => {
    const result = client.splitter.validateRecipients([
      { address: ADDR_A, shareBps: 5000 },
      { address: ADDR_A, shareBps: 5000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);
  });

  it('is invalid when BPS does not sum to 10000', () => {
    const result = client.splitter.validateRecipients([
      { address: ADDR_A, shareBps: 5000 },
      { address: ADDR_B, shareBps: 4000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('10 000'))).toBe(true);
  });

  it('is invalid for a zero-BPS recipient', () => {
    const result = client.splitter.validateRecipients([
      { address: ADDR_A, shareBps: 0 },
      { address: ADDR_B, shareBps: 10000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-positive'))).toBe(true);
  });

  it('is invalid for more than 20 recipients', () => {
    const recipients = Array.from({ length: 21 }, (_, i) => ({
      address: `${ADDR_A.slice(0, 55)}${i % 10}`,
      shareBps: i === 20 ? 1 : Math.floor(9999 / 20),
    }));
    const result = client.splitter.validateRecipients(recipients);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Too many recipients'))).toBe(true);
  });

  it('is valid for 2 recipients at 5000 bps each', () => {
    const result = client.splitter.validateRecipients([
      { address: ADDR_A, shareBps: 5000 },
      { address: ADDR_B, shareBps: 5000 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('populates the errors array for each violation', () => {
    // Duplicate address + non-positive share + wrong total → multiple errors.
    const result = client.splitter.validateRecipients([
      { address: ADDR_A, shareBps: 0 },
      { address: ADDR_A, shareBps: 5000 },
      { address: ADDR_B, shareBps: 4000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// #465 — createRevenueSplit BPS guard and encoding
// ---------------------------------------------------------------------------
describe('SplitterModule.createRevenueSplit', () => {
  const kp = Keypair.random();
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), kp);
  const mockServer = {
    simulateTransaction: jest.fn().mockResolvedValue(parsedSuccess()),
  };
  (client as unknown as { server: unknown }).server = mockServer;
  (client as unknown as { connected: boolean }).connected = true;

  beforeEach(() => {
    jest.restoreAllMocks();
    mockServer.simulateTransaction.mockResolvedValue(parsedSuccess());
  });

  it('throws SplitInvalidShares when organizerBps + artistBps >= 10000', async () => {
    const readOnly = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    await expect(
      readOnly.splitter.createRevenueSplit({
        organizer: ADDR_A,
        organizerBps: 6000,
        artist: ADDR_B,
        artistBps: 4000,
        platform: ADDR_A,
        totalAmount: 1_000_000n,
      }),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.SplitInvalidShares });
  });

  it('throws ReadOnlyClient when no keypair', async () => {
    const readOnly = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    await expect(
      readOnly.splitter.createRevenueSplit({
        organizer: ADDR_A,
        organizerBps: 5000,
        artist: ADDR_B,
        artistBps: 3000,
        platform: ADDR_A,
        totalAmount: 1_000_000n,
      }),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
  });

  it('succeeds with valid BPS', async () => {
    jest.spyOn(transactionUtils, 'buildContractCall');
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'split-hash',
      ledger: 10,
      successful: true,
    });

    const result = await client.splitter.createRevenueSplit({
      organizer: ADDR_A,
      organizerBps: 5000,
      artist: ADDR_B,
      artistBps: 3000,
      platform: ADDR_A,
      totalAmount: 1_000_000n,
    });
    expect(result.successful).toBe(true);
    expect(result.hash).toBe('split-hash');
  });

  it('submits with 3 recipients encoding', async () => {
    const buildCall = jest.spyOn(transactionUtils, 'buildContractCall');
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'split-encode-hash',
      ledger: 11,
      successful: true,
    });

    await client.splitter.createRevenueSplit({
      organizer: ADDR_A,
      organizerBps: 6000,
      artist: ADDR_B,
      artistBps: 3000,
      platform: ADDR_A,
      totalAmount: 2_000_000n,
    });

    const call = buildCall.mock.calls[0];
    expect(call[3]).toBe('create_split');
    const recipientsScVal = call[4][0];
    expect(recipientsScVal.switch()).toBe(xdr.ScValType.scvVec());
    expect(recipientsScVal.vec()).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// #466 — getSplitterStats correct field types
// ---------------------------------------------------------------------------
describe('SplitterModule.getSplitterStats', () => {
  function makeMockClient() {
    const c = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), Keypair.random());
    const mock = { simulateTransaction: jest.fn() };
    (c as unknown as { server: unknown }).server = mock;
    (c as unknown as { connected: boolean }).connected = true;
    return { client: c, mockServer: mock };
  }

  it('returns correct field types (number / bigint)', async () => {
    const { client, mockServer } = makeMockClient();
    const mapVal = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('total_splits'), val: xdr.ScVal.scvU32(25) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('distributed_count'), val: xdr.ScVal.scvU32(20) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('cancelled_count'), val: xdr.ScVal.scvU32(3) }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('total_distributed_value'),
        val: nativeToScVal(5000000n, { type: 'i128' }),
      }),
    ]);
    mockServer.simulateTransaction.mockResolvedValue(parsedSuccess(mapVal));

    const stats = await client.splitter.getSplitterStats();

    expect(typeof stats.totalSplits).toBe('number');
    expect(typeof stats.distributedCount).toBe('number');
    expect(typeof stats.cancelledCount).toBe('number');
    expect(typeof stats.totalDistributedValue).toBe('bigint');

    expect(stats.totalSplits).toBe(25);
    expect(stats.distributedCount).toBe(20);
    expect(stats.cancelledCount).toBe(3);
    expect(stats.totalDistributedValue).toBe(5000000n);
  });

  it('does not return bigints for count fields', async () => {
    const { client, mockServer } = makeMockClient();
    const mapVal = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('total_splits'), val: xdr.ScVal.scvU32(7) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('distributed_count'), val: xdr.ScVal.scvU32(5) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('cancelled_count'), val: xdr.ScVal.scvU32(1) }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('total_distributed_value'),
        val: nativeToScVal(0n, { type: 'i128' }),
      }),
    ]);
    mockServer.simulateTransaction.mockResolvedValue(parsedSuccess(mapVal));

    const stats = await client.splitter.getSplitterStats();
    expect(typeof stats.totalSplits).toBe('number');
    expect(typeof stats.distributedCount).toBe('number');
    expect(typeof stats.cancelledCount).toBe('number');
    expect(typeof stats.totalDistributedValue).toBe('bigint');
  });
});
