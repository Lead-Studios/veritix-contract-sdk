/**
 * @file tests/escrow.test.ts
 * Unit tests for {@link EscrowModule}.
 */

import { Keypair, SorobanRpc, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../src/utils/errors';
import * as transactionUtils from '../src/utils/transaction';
import type { EscrowRecord } from '../src/types/index';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const FAKE_DEPOSITOR = 'GBZXN7PIRZGNMHGA76QJRYR3ERW7VH2MJL7G2P6CC6QH5M2LQJUSVQ6C';
const FAKE_ESCROW_ID = 1n;

function makeConnectedClient(keypair?: Keypair, currentLedger = 100) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: currentLedger }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

function mapEntry(key: string, val: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({
    key: xdr.ScVal.scvSymbol(key),
    val,
  });
}

function makeEscrowRecordFixtureXdr(): string {
  return xdr.ScVal.scvMap([
    mapEntry('id', nativeToScVal(FAKE_ESCROW_ID, { type: 'u64' })),
    mapEntry('depositor', xdr.ScVal.scvString(FAKE_DEPOSITOR)),
    mapEntry('beneficiary', xdr.ScVal.scvString(FAKE_ADDRESS)),
    mapEntry('amount', nativeToScVal(2_000_000n, { type: 'i128' })),
    mapEntry('released', xdr.ScVal.scvBool(false)),
    mapEntry('refunded', xdr.ScVal.scvBool(false)),
    mapEntry('expiry_ledger', nativeToScVal(1_005_000, { type: 'u64' })),
    mapEntry(
      'memos',
      xdr.ScVal.scvVec([xdr.ScVal.scvString('ticket-uuid-123'), xdr.ScVal.scvString('vip')]),
    ),
  ]).toXDR('base64');
}

const ESCROW_RECORD_XDR = makeEscrowRecordFixtureXdr();
const VOID_XDR = xdr.ScVal.scvVoid().toXDR('base64');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EscrowModule', () => {
  it('returns null when getEscrow returns no result', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: undefined,
      },
    });

    const escrow = await client.escrow.getEscrow(FAKE_ESCROW_ID);

    expect(escrow).toBeNull();
  });

  it('returns null when getEscrow returns void XDR', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.fromXDR(VOID_XDR, 'base64'),
      },
    });

    const escrow = await client.escrow.getEscrow(FAKE_ESCROW_ID);
    expect(escrow).toBeNull();
  });

describe('EscrowModule (stubs)', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('parses an escrow record from a mocked XDR fixture', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.fromXDR(ESCROW_RECORD_XDR, 'base64'),
      },
    });

    const escrow = await client.escrow.getEscrow(FAKE_ESCROW_ID);

    expect(escrow).toEqual({
      id: 1n,
      depositor: FAKE_DEPOSITOR,
      beneficiary: FAKE_ADDRESS,
      amount: 2_000_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_005_000,
      memos: ['ticket-uuid-123', 'vip'],
    });
  });

  it('returns escrow IDs for a depositor', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.scvVec([
          nativeToScVal(1n, { type: 'u64' }),
          nativeToScVal(7n, { type: 'u64' }),
          nativeToScVal(42n, { type: 'u64' }),
        ]),
      },
    });

    const escrowIds = await client.escrow.getEscrowsByDepositor(FAKE_DEPOSITOR);

    expect(escrowIds).toEqual([1n, 7n, 42n]);
  });

  it('returns an empty array when depositor lookup returns no result', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: undefined,
      },
    });

    const escrowIds = await client.escrow.getEscrowsByDepositor(FAKE_DEPOSITOR);

    expect(escrowIds).toEqual([]);
  });

  it('returns escrow IDs for a beneficiary', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.scvVec([
          nativeToScVal(3n, { type: 'u64' }),
          nativeToScVal(8n, { type: 'u64' }),
        ]),
      },
    });

    const escrowIds = await client.escrow.getEscrowsByBeneficiary(FAKE_ADDRESS);

    expect(escrowIds).toEqual([3n, 8n]);
  });

  it('returns an empty array when beneficiary lookup returns void', async () => {
    const { client, mockServer } = makeConnectedClient();
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.fromXDR(VOID_XDR, 'base64'),
      },
    });

    const escrowIds = await client.escrow.getEscrowsByBeneficiary(FAKE_ADDRESS);

    expect(escrowIds).toEqual([]);
  });

  it('rejects createEscrow without a signing keypair', async () => {
    const { client } = makeConnectedClient();

    await expect(
      client.escrow.createEscrow({
        beneficiary: FAKE_ADDRESS,
        amount: 1_000_000n,
        expiryLedger: 101,
      }),
    ).rejects.toThrow('signing keypair required');
  });

  it('rejects createEscrow when amount is not positive', async () => {
    const { client } = makeConnectedClient(Keypair.random());

    await expect(
      client.escrow.createEscrow({
        beneficiary: FAKE_ADDRESS,
        amount: 0n,
        expiryLedger: 101,
      }),
    ).rejects.toThrow('amount must be greater than zero');
  });

  it('rejects createEscrow when expiryLedger is not in the future', async () => {
    const { client } = makeConnectedClient(Keypair.random(), 100);

    await expect(
      client.escrow.createEscrow({
        beneficiary: FAKE_ADDRESS,
        amount: 1_000_000n,
        expiryLedger: 100,
      }),
    ).rejects.toThrow('expiryLedger must be greater than current ledger');
  });

  it('rejects createEscrow when beneficiary is not a valid Stellar address', async () => {
    const { client } = makeConnectedClient(Keypair.random());

    await expect(
      client.escrow.createEscrow({
        beneficiary: 'not-a-stellar-address',
        amount: 1_000_000n,
        expiryLedger: 101,
      }),
    ).rejects.toThrow('beneficiary must be a valid Stellar address');
  });

  it('creates an escrow and returns the decoded escrowId', async () => {
    const keypair = Keypair.random();
    const { client, mockServer } = makeConnectedClient(keypair, 100);
    const fakeTx = { id: 'unsigned' } as never;
    const fakeAssembledTx = { id: 'assembled' } as never;

    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue(fakeTx);
    jest.spyOn(SorobanRpc, 'assembleTransaction').mockReturnValue({
      build: () => fakeAssembledTx,
    } as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'fake-hash',
      ledger: 123,
      successful: true,
    });

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: nativeToScVal(77n, { type: 'u64' }),
      },
    });

    const result = await client.escrow.createEscrow({
      beneficiary: Keypair.random().publicKey(),
      amount: 2_000_000n,
      expiryLedger: 150,
      memos: ['ticket-uuid-123'],
    });

    expect(transactionUtils.buildContractCall).toHaveBeenCalledWith(
      mockServer,
      expect.anything(),
      FAKE_CONTRACT,
      'create_escrow',
      expect.any(Array),
      getTestnetConfig(FAKE_CONTRACT).networkPassphrase,
    );
    expect(transactionUtils.submitTransaction).toHaveBeenCalledWith(
      mockServer,
      fakeAssembledTx,
      keypair,
    );
    expect(result).toEqual({
      hash: 'fake-hash',
      ledger: 123,
      successful: true,
      returnValue: 77n,
      escrowId: 77n,
    });
  });

  it('createTicketEscrow() builds the ticket escrow and returns the escrow ID', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const spy = jest.spyOn(client.escrow, 'createEscrow').mockResolvedValue({
      hash: 'fake-hash',
      ledger: 42,
      successful: true,
      returnValue: 99n,
      escrowId: 99n,
    });

    const escrowId = await client.escrow.createTicketEscrow({
      organizer: FAKE_ADDRESS,
      ticketPrice: 2_000_000n,
      eventLedger: 1_000_000,
      ticketRef: 'ticket-uuid-123',
    });

    expect(escrowId).toBe(99n);
    expect(spy).toHaveBeenCalledWith({
      beneficiary: FAKE_ADDRESS,
      amount: 2_000_000n,
      expiryLedger: 1_005_000,
      memos: ['ticket-uuid-123'],
    });
  });

  it('releaseEscrow throws EscrowNotFound when escrow does not exist', async () => {
    const { client } = makeConnectedClient(Keypair.random());
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(null);

    await expect(client.escrow.releaseEscrow(FAKE_ESCROW_ID)).rejects.toMatchObject({
      code: VeriTixErrorCode.EscrowNotFound,
    });
  });

  it('refundEscrow throws EscrowNotFound when escrow does not exist', async () => {
    const { client } = makeConnectedClient(Keypair.random());
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(null);

    await expect(client.escrow.refundEscrow(FAKE_ESCROW_ID)).rejects.toMatchObject({
      code: VeriTixErrorCode.EscrowNotFound,
    });
  });

  it('releaseEscrow throws EscrowAlreadySettled when escrow is already released', async () => {
    const { client } = makeConnectedClient(Keypair.random());
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_DEPOSITOR,
      beneficiary: FAKE_ADDRESS,
      amount: 2_000_000n,
      released: true,
      refunded: false,
      expiryLedger: 1_005_000,
      memos: [],
    });

    await expect(client.escrow.releaseEscrow(FAKE_ESCROW_ID)).rejects.toMatchObject({
      code: VeriTixErrorCode.EscrowAlreadySettled,
    });
  });

  it('getEscrowsBatch() throws "not implemented"', async () => {
    await expect(client.escrow.getEscrowsBatch([1n, 2n])).rejects.toThrow('not implemented');
  });
});

// ---------------------------------------------------------------------------
// getEscrowsBatch validation tests
// ---------------------------------------------------------------------------

describe('EscrowModule.getEscrowsBatch', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('throws BATCH_TOO_LARGE error when more than 50 IDs are provided', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => BigInt(i + 1));
    await expect(client.escrow.getEscrowsBatch(ids)).rejects.toThrow(
      'Batch request exceeded maximum allowed size (50 items). Received 51 IDs.',
    );
  });

  it('throws BATCH_TOO_LARGE error with VeriTixErrorCode when more than 50 IDs are provided', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => BigInt(i + 1));
    try {
      await client.escrow.getEscrowsBatch(ids);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(VeriTixError);
      expect((error as VeriTixError).code).toBe(VeriTixErrorCode.BatchTooLarge);
    }
  });

  it('returns an empty array for empty batch', async () => {
    const result = await client.escrow.getEscrowsBatch([]);
    expect(result).toEqual([]);
  });

  it('falls back to individual getEscrow calls when contract method is not implemented', async () => {
    const ids = [1n, 2n, 3n];
    const mockEscrowRecord: EscrowRecord = {
      id: 1n,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    };

    const spy = jest
      .spyOn(client.escrow, 'getEscrow')
      .mockResolvedValueOnce(mockEscrowRecord)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockEscrowRecord);

    const results = await client.escrow.getEscrowsBatch(ids);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual(mockEscrowRecord);
    expect(results[1]).toBeNull();
    expect(results[2]).toEqual(mockEscrowRecord);
    expect(spy).toHaveBeenCalledTimes(3);

    spy.mockRestore();
  });

  it('preserves order of results matching input IDs', async () => {
    const ids = [5n, 3n, 7n, 1n];
    const record1: EscrowRecord = {
      id: 5n,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 500_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    };
    const record2: EscrowRecord = {
      id: 7n,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 700_000n,
      released: true,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    };

    const spy = jest
      .spyOn(client.escrow, 'getEscrow')
      .mockResolvedValueOnce(record1)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(record2)
      .mockResolvedValueOnce(null);

    const results = await client.escrow.getEscrowsBatch(ids);

    expect(results).toHaveLength(4);
    expect(results[0]?.id).toBe(5n);
    expect(results[1]).toBeNull();
    expect(results[2]?.id).toBe(7n);
    expect(results[3]).toBeNull();

    spy.mockRestore();
  });

  it('accepts exactly 50 IDs without throwing', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => BigInt(i + 1));
    const mockEscrowRecord: EscrowRecord = {
      id: 1n,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    };

    const spy = jest
      .spyOn(client.escrow, 'getEscrow')
      .mockResolvedValue(mockEscrowRecord);

    const results = await client.escrow.getEscrowsBatch(ids);

    expect(results).toHaveLength(50);
    expect(spy).toHaveBeenCalledTimes(50);

    spy.mockRestore();
  });
});

describe('EscrowModule.isSettled', () => {
  const keypair = Keypair.random();
  const FAKE_ESCROW_ID = 1n;

  it('returns true when escrow is released', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: true,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    });

    const settled = await client.escrow.isSettled(FAKE_ESCROW_ID);

    expect(settled).toBe(true);
  });

  it('returns true when escrow is refunded', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: true,
      expiryLedger: 1_000_000,
      memos: [],
    });

    const settled = await client.escrow.isSettled(FAKE_ESCROW_ID);

    expect(settled).toBe(true);
  });

  it('returns false when escrow is neither released nor refunded', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    });

    const settled = await client.escrow.isSettled(FAKE_ESCROW_ID);

    expect(settled).toBe(false);
  });

  it('throws error when escrow does not exist', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(null);

    await expect(client.escrow.isSettled(FAKE_ESCROW_ID)).rejects.toThrow('escrow 1 not found');
  });
});

describe('EscrowModule.isExpired', () => {
  const keypair = Keypair.random();
  const FAKE_ESCROW_ID = 1n;
  const EXPIRY_LEDGER = 1_000_000;

  it('returns true when current ledger >= expiry ledger', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: EXPIRY_LEDGER,
      memos: [],
    });

    const expired = await client.escrow.isExpired(FAKE_ESCROW_ID, EXPIRY_LEDGER);

    expect(expired).toBe(true);
  });

  it('returns true when current ledger > expiry ledger', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: EXPIRY_LEDGER,
      memos: [],
    });

    const expired = await client.escrow.isExpired(FAKE_ESCROW_ID, EXPIRY_LEDGER + 1);

    expect(expired).toBe(true);
  });

  it('returns false when current ledger < expiry ledger', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: EXPIRY_LEDGER,
      memos: [],
    });

    const expired = await client.escrow.isExpired(FAKE_ESCROW_ID, EXPIRY_LEDGER - 1);

    expect(expired).toBe(false);
  });

  it('fetches current ledger when not provided', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: EXPIRY_LEDGER,
      memos: [],
    });
    mockServer.getLatestLedger = jest
      .fn()
      .mockResolvedValue({ sequence: EXPIRY_LEDGER + 1000 });

    const expired = await client.escrow.isExpired(FAKE_ESCROW_ID);

    expect(expired).toBe(true);
    expect(mockServer.getLatestLedger).toHaveBeenCalledTimes(1);
  });

  it('throws error when escrow does not exist', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(null);

    await expect(client.escrow.isExpired(FAKE_ESCROW_ID, 1_000_000)).rejects.toThrow(
      'escrow 1 not found',
    );
  });
});

describe('EscrowModule.settleEvent', () => {
  const keypair = Keypair.random();

  it('throws error when no signing keypair is available', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    await expect(client.escrow.settleEvent([1n, 2n, 3n])).rejects.toThrow(
      'signing keypair required',
    );
  });

  it('returns empty result for empty escrow array', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const result = await client.escrow.settleEvent([]);
    expect(result).toEqual({
      settled: 0,
      failed: [],
      txHashes: [],
    });
    expect(mockServer.simulateTransaction).not.toHaveBeenCalled();
  });

  it('successfully settles a single chunk of escrows', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const escrowIds = [1n, 2n, 3n];

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvU64(xdr.Uint64.fromString('3')) },
    });
    mockServer.sendTransaction.mockResolvedValue({
      hash: 'tx-hash-1',
      status: 'OK',
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 100,
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.txHashes).toContain('tx-hash-1');
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('splits large escrow array into multiple transactions', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);

    // Create 125 escrow IDs (will split into 3 chunks: 50, 50, 25)
    const escrowIds = Array.from({ length: 125 }, (_, i) => BigInt(i + 1));

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvU64(xdr.Uint64.fromString('50')) },
    });
    mockServer.sendTransaction.mockResolvedValue({
      hash: 'tx-hash',
      status: 'OK',
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 100,
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.txHashes.length).toBe(3);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(3);
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(3);
  });

  it('collects transaction hashes from all chunks', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const escrowIds = Array.from({ length: 75 }, (_, i) => BigInt(i + 1));

    let hashCounter = 0;
    mockServer.sendTransaction.mockImplementation(() => {
      hashCounter++;
      return Promise.resolve({
        hash: `tx-hash-${hashCounter}`,
        status: 'OK',
      });
    });
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvU64(xdr.Uint64.fromString('50')) },
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 100,
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.txHashes).toEqual(['tx-hash-1', 'tx-hash-2']);
  });

  it('handles chunk failure gracefully', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const escrowIds = [1n, 2n, 3n];

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'ERROR',
      error: 'Contract error',
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.failed).toEqual(escrowIds);
    expect(result.settled).toBe(0);
    expect(result.txHashes.length).toBe(0);
  });

  it('aggregates results across multiple successful chunks', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const escrowIds = Array.from({ length: 101 }, (_, i) => BigInt(i + 1));

    let callCount = 0;
    mockServer.sendTransaction.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        hash: `tx-hash-${callCount}`,
        status: 'OK',
      });
    });

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvU64(xdr.Uint64.fromString('50')) },
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 100,
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.txHashes.length).toBe(3);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(3);
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(3);
  });
});

  it('refundEscrow throws EscrowAlreadySettled when escrow is already refunded', async () => {
    const { client } = makeConnectedClient(Keypair.random());
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_DEPOSITOR,
      beneficiary: FAKE_ADDRESS,
      amount: 2_000_000n,
      released: false,
      refunded: true,
      expiryLedger: 1_005_000,
      memos: [],
    });

    await expect(client.escrow.refundEscrow(FAKE_ESCROW_ID)).rejects.toMatchObject({
      code: VeriTixErrorCode.EscrowAlreadySettled,
    });
  });

  it('releaseEscrow submits the release transaction for an unsettled escrow', async () => {
    const keypair = Keypair.random();
    const { client, mockServer } = makeConnectedClient(keypair);
    const fakeTx = { id: 'unsigned-release' } as never;
    const fakeAssembledTx = { id: 'assembled-release' } as never;

    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_DEPOSITOR,
      beneficiary: FAKE_ADDRESS,
      amount: 2_000_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_005_000,
      memos: [],
    });
    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue(fakeTx);
    jest
      .spyOn(SorobanRpc, 'assembleTransaction')
      .mockReturnValue({ build: () => fakeAssembledTx } as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'release-hash',
      ledger: 200,
      successful: true,
    });
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.scvVoid(),
      },
    });

    const result = await client.escrow.releaseEscrow(FAKE_ESCROW_ID);

    expect(transactionUtils.buildContractCall).toHaveBeenCalledWith(
      mockServer,
      expect.anything(),
      FAKE_CONTRACT,
      'release_escrow',
      expect.any(Array),
      getTestnetConfig(FAKE_CONTRACT).networkPassphrase,
    );
    expect(transactionUtils.submitTransaction).toHaveBeenCalledWith(
      mockServer,
      fakeAssembledTx,
      keypair,
    );
    expect(result).toEqual({
      hash: 'release-hash',
      ledger: 200,
      successful: true,
      returnValue: xdr.ScVal.scvVoid(),
    });
  });

  it('refundEscrow submits the refund transaction for an unsettled escrow', async () => {
    const keypair = Keypair.random();
    const { client, mockServer } = makeConnectedClient(keypair);
    const fakeTx = { id: 'unsigned-refund' } as never;
    const fakeAssembledTx = { id: 'assembled-refund' } as never;

    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_DEPOSITOR,
      beneficiary: FAKE_ADDRESS,
      amount: 2_000_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_005_000,
      memos: [],
    });
    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue(fakeTx);
    jest
      .spyOn(SorobanRpc, 'assembleTransaction')
      .mockReturnValue({ build: () => fakeAssembledTx } as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'refund-hash',
      ledger: 201,
      successful: true,
    });
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.scvVoid(),
      },
    });

    const result = await client.escrow.refundEscrow(FAKE_ESCROW_ID);

    expect(transactionUtils.buildContractCall).toHaveBeenCalledWith(
      mockServer,
      expect.anything(),
      FAKE_CONTRACT,
      'refund_escrow',
      expect.any(Array),
      getTestnetConfig(FAKE_CONTRACT).networkPassphrase,
    );
    expect(transactionUtils.submitTransaction).toHaveBeenCalledWith(
      mockServer,
      fakeAssembledTx,
      keypair,
    );
    expect(result).toEqual({
      hash: 'refund-hash',
      ledger: 201,
      successful: true,
      returnValue: xdr.ScVal.scvVoid(),
    });
  });
});

describe('parseSorobanError', () => {
  it('maps "escrow not found" panic to EscrowNotFound', () => {
    const err = parseSorobanError('Contract panic: escrow not found');
    expect(err).toBeInstanceOf(VeriTixError);
    expect(err.code).toBe(VeriTixErrorCode.EscrowNotFound);
  });

  it('maps "DisputeAlreadyOpen" panic to DisputeAlreadyOpen', () => {
    const err = parseSorobanError('DisputeAlreadyOpen');
    expect(err.code).toBe(VeriTixErrorCode.DisputeAlreadyOpen);
  });

  it('maps "already settled" panic to EscrowAlreadySettled', () => {
    const err = parseSorobanError('already settled');
    expect(err.code).toBe(VeriTixErrorCode.EscrowAlreadySettled);
  });

  it('maps "account frozen" panic to AccountFrozen', () => {
    const err = parseSorobanError('account frozen');
    expect(err.code).toBe(VeriTixErrorCode.AccountFrozen);
  });

  it('returns Unknown for unrecognised panic strings', () => {
    const err = parseSorobanError('something totally unrecognised xyz');
    expect(err.code).toBe(VeriTixErrorCode.Unknown);
    expect(err.rawMessage).toBe('something totally unrecognised xyz');
  });

  it('accepts an Error object as input', () => {
    const err = parseSorobanError(new Error('contract paused'));
    expect(err.code).toBe(VeriTixErrorCode.ContractPaused);
  });
});
