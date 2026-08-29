import { Keypair, xdr, scValToNative } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { DisputeStatus } from '../src/types/index';
import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';
import * as transactionUtils from '../src/utils/transaction';

/** Minimal valid raw Soroban simulation-success used to drive assembleTransaction. */
function rawSimSuccess(): any {
  const resources = new (xdr as any).SorobanResources({
    footprint: new (xdr as any).LedgerFootprint({ readOnly: [], readWrite: [] }),
    instructions: 0,
    readBytes: 0,
    writeBytes: 0,
  });
  const sd = new (xdr as any).SorobanTransactionData({
    resources,
    resourceFee: xdr.Int64.fromString('0'),
    ext: (xdr as any).ExtensionPoint.fromXDR(Buffer.from([0, 0, 0, 0])),
  });
  return {
    id: '1',
    latestLedger: 100,
    transactionData: sd.toXDR('base64'),
    minResourceFee: '100',
    cost: { cpuInsns: '0', memBytes: '0' },
    results: [{ auth: [], xdr: xdr.ScVal.scvVoid().toXDR('base64') }],
  };
}
import { VeriTixErrorCode } from '../src/utils/errors';
import * as transactionUtils from '../src/utils/transaction';

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ESCROW_ID = 123n;

/**
 * Builds a `Server.simulateTransaction` response that satisfies the SDK's
 * `SorobanRpc.Api.isSimulationSuccess` gate (a `transactionData` key must be
 * present) so the mocked `retval` is actually surfaced by module methods.
 */
function simulationSuccess(retval: unknown): Record<string, unknown> {
  return {
    status: 'SUCCESS',
    latestLedger: 1,
    minResourceFee: '100',
    transactionData: '',
    events: [],
    result: { retval },
  };
}

function makeConnectedClient(keypair: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

function makeResolvedDispute(overrides: Partial<{ id: bigint; escrowId: bigint; claimant: string; resolver: string; status: DisputeStatus; openedAt: number }> = {}) {
  return {
    id: FAKE_ESCROW_ID,
    escrowId: 321n,
    claimant: Keypair.random().publicKey(),
    resolver: Keypair.random().publicKey(),
    status: DisputeStatus.Open,
    openedAt: 1,
    ...overrides,
  };
}

describe('DisputeModule', () => {
  const keypair = Keypair.random();
  const resolver = Keypair.random().publicKey();

  it('rejects when resolver is the same as the claimant', async () => {
    const { client } = makeConnectedClient(keypair);

    await expect(client.dispute.openDispute(FAKE_ESCROW_ID, keypair.publicKey())).rejects.toThrow(
      'resolver cannot be the claimant',
    );
  });

  it('rejects evidence that exceeds 128 bytes', async () => {
    const { client } = makeConnectedClient(keypair);
    const longEvidence = 'a'.repeat(129);

    await expect(
      client.dispute.openDispute(FAKE_ESCROW_ID, resolver, longEvidence),
    ).rejects.toThrow('evidence must be 128 bytes or less');
  });

  it('returns null when getDispute returns no result', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(simulationSuccess(undefined));

    const dispute = await client.dispute.getDispute(FAKE_ESCROW_ID);

    expect(dispute).toBeNull();
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns true when isDisputeOpen finds an open dispute', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvBool(true)),
    );

    const isOpen = await client.dispute.isDisputeOpen(FAKE_ESCROW_ID);

    expect(isOpen).toBe(true);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns false when isDisputeOpen finds no open dispute', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvBool(false)),
    );

    const isOpen = await client.dispute.isDisputeOpen(FAKE_ESCROW_ID);

    expect(isOpen).toBe(false);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns false when isDisputeOpen returns no result', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(simulationSuccess(undefined));

    const isOpen = await client.dispute.isDisputeOpen(FAKE_ESCROW_ID);

    expect(isOpen).toBe(false);
  });

  it('throws DisputeNotFound when resolving a non-existent dispute', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(null);

    await expect(client.dispute.resolveDispute(FAKE_ESCROW_ID, true)).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeNotFound,
    });
  });

  it('throws DisputeAlreadyResolved for a dispute that is not open', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(
      makeResolvedDispute({ status: DisputeStatus.ResolvedForDepositor, resolver: keypair.publicKey() }),
    );

    await expect(client.dispute.resolveDispute(FAKE_ESCROW_ID, false)).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeAlreadyResolved,
    });
  });

  it('resolves an open dispute and submits the transaction', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const fakeAssembledTx = { id: 'assembled' } as never;

    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(
      makeResolvedDispute({ resolver: keypair.publicKey() }),
    );
    jest.spyOn(transactionUtils, 'assembleTransaction').mockReturnValue({
      build: () => fakeAssembledTx,
    } as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'fake-hash',
      ledger: 100,
      successful: true,
    });
    (transactionUtils.submitTransaction as jest.Mock).mockClear();

    mockServer.simulateTransaction.mockResolvedValue(simulationSuccess(456n));

    const result = await client.dispute.resolveDispute(FAKE_ESCROW_ID, true, 'valid note');

    expect(result).toMatchObject({
      hash: 'fake-hash',
      ledger: 100,
      successful: true,
      returnValue: 456n,
    });
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(transactionUtils.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when getDisputeHistory finds no disputes', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(simulationSuccess(undefined));

    const history = await client.dispute.getDisputeHistory(FAKE_ESCROW_ID);

    expect(history).toEqual([]);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns an array of dispute IDs from getDisputeHistory', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(
        xdr.ScVal.scvVec([
          xdr.ScVal.scvU64(xdr.Uint64.fromString('1')),
          xdr.ScVal.scvU64(xdr.Uint64.fromString('2')),
          xdr.ScVal.scvU64(xdr.Uint64.fromString('3')),
        ]),
      ),
    );

    const history = await client.dispute.getDisputeHistory(FAKE_ESCROW_ID);

    expect(history).toEqual([1n, 2n, 3n]);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns a single dispute ID from getDisputeHistory', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(
        xdr.ScVal.scvVec([
          xdr.ScVal.scvU64(xdr.Uint64.fromString('42')),
        ]),
      ),
    );

    const history = await client.dispute.getDisputeHistory(FAKE_ESCROW_ID);

    expect(history).toEqual([42n]);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns dispute IDs in order from getDisputeHistory', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(
        xdr.ScVal.scvVec([
          xdr.ScVal.scvU64(xdr.Uint64.fromString('100')),
          xdr.ScVal.scvU64(xdr.Uint64.fromString('50')),
          xdr.ScVal.scvU64(xdr.Uint64.fromString('75')),
          xdr.ScVal.scvU64(xdr.Uint64.fromString('200')),
        ]),
      ),
    );

    const history = await client.dispute.getDisputeHistory(FAKE_ESCROW_ID);

    expect(history).toEqual([100n, 50n, 75n, 200n]);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array from getDisputeHistory when contract returns empty vector', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvVec([])),
    );

    const history = await client.dispute.getDisputeHistory(FAKE_ESCROW_ID);

    expect(history).toEqual([]);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('throws an error if getDisputeHistory does not return a vector', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvBool(true)),
    );

    await expect(client.dispute.getDisputeHistory(FAKE_ESCROW_ID)).rejects.toThrow(
      'Expected get_dispute_history_for_escrow to return a vector',
    );
  });

  describe('getOpenDisputes', () => {
    it('returns empty array when no open disputes exist', async () => {
      const { client, mockServer } = makeConnectedClient(keypair);
      mockServer.simulateTransaction.mockResolvedValue(
        simulationSuccess(xdr.ScVal.scvVec([])),
      );

      const disputes = await client.dispute.getOpenDisputes();

      expect(disputes).toEqual([]);
      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    });

    it('returns array of dispute IDs when open disputes exist', async () => {
      const { client, mockServer } = makeConnectedClient(keypair);
      mockServer.simulateTransaction.mockResolvedValue(
        simulationSuccess(
          xdr.ScVal.scvVec([
            xdr.ScVal.scvU64(xdr.Uint64.fromString('1')),
            xdr.ScVal.scvU64(xdr.Uint64.fromString('2')),
            xdr.ScVal.scvU64(xdr.Uint64.fromString('3')),
          ]),
        ),
      );

      const disputes = await client.dispute.getOpenDisputes();

      expect(disputes).toEqual([1n, 2n, 3n]);
      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when result is undefined', async () => {
      const { client, mockServer } = makeConnectedClient(keypair);
      mockServer.simulateTransaction.mockResolvedValue(simulationSuccess(undefined));

      const disputes = await client.dispute.getOpenDisputes();

      expect(disputes).toEqual([]);
    });

    it('throws error on simulation failure', async () => {
      const { client, mockServer } = makeConnectedClient(keypair);
      mockServer.simulateTransaction.mockResolvedValue({
        status: 'ERROR',
        error: 'Contract not found',
      });

      await expect(client.dispute.getOpenDisputes()).rejects.toThrow();
    });
  });

  describe('getDisputesByResolver', () => {
    it('returns empty array when resolver has no disputes', async () => {
      const { client, mockServer } = makeConnectedClient(keypair);
      mockServer.simulateTransaction.mockResolvedValue(
        simulationSuccess(xdr.ScVal.scvVec([])),
      );

      const disputes = await client.dispute.getDisputesByResolver(resolver);

      expect(disputes).toEqual([]);
      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    });

    it('returns array of dispute IDs assigned to resolver', async () => {
      const { client, mockServer } = makeConnectedClient(keypair);
      mockServer.simulateTransaction.mockResolvedValue(
        simulationSuccess(
          xdr.ScVal.scvVec([
            xdr.ScVal.scvU64(xdr.Uint64.fromString('5')),
            xdr.ScVal.scvU64(xdr.Uint64.fromString('10')),
          ]),
        ),
      );

      const disputes = await client.dispute.getDisputesByResolver(resolver);

      expect(disputes).toEqual([5n, 10n]);
      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when result is undefined', async () => {
      const { client, mockServer } = makeConnectedClient(keypair);
      mockServer.simulateTransaction.mockResolvedValue(simulationSuccess(undefined));

      const disputes = await client.dispute.getDisputesByResolver(resolver);

      expect(disputes).toEqual([]);
    });

    it('throws error on simulation failure', async () => {
      const { client, mockServer } = makeConnectedClient(keypair);
      mockServer.simulateTransaction.mockResolvedValue({
        status: 'ERROR',
        error: 'Invalid address',
      });

      await expect(client.dispute.getDisputesByResolver(resolver)).rejects.toThrow();
    });
  });
});

describe('DisputeModule.resolveDispute', () => {
  const keypair = Keypair.random();

  it('throws ReadOnlyClient when no keypair', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));

    await expect(client.dispute.resolveDispute(FAKE_ESCROW_ID, true)).rejects.toMatchObject({
      code: VeriTixErrorCode.ReadOnlyClient,
    });
  });

  it('throws DISPUTE_NOT_FOUND when dispute does not exist', async () => {
    const keypair = Keypair.random();
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(null);

    await expect(client.dispute.expireDispute(999n)).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeNotFound,
    });
  });

  it('throws DISPUTE_ALREADY_RESOLVED when dispute is not open', async () => {
    const keypair = Keypair.random();
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue({
      id: 1n,
      escrowId: 100n,
      claimant: Keypair.random().publicKey(),
      resolver: keypair.publicKey(),
      status: DisputeStatus.ResolvedForDepositor,
      openedAt: 1,
    });

    await expect(client.dispute.expireDispute(1n)).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeAlreadyResolved,
    });
  });
});

describe('DisputeModule.isDisputeExpired', () => {
  it('returns true when dispute is expired', async () => {
    const keypair = Keypair.random();
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvBool(true) },
  it('throws AdminUnauthorized when caller is not the assigned resolver', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(
      makeResolvedDispute({ resolver: Keypair.random().publicKey() }),
    );

    await expect(client.dispute.resolveDispute(FAKE_ESCROW_ID, true)).rejects.toMatchObject({
      code: VeriTixErrorCode.AdminUnauthorized,
    });
  });

  it('submits with correct dispute_id and release_to_beneficiary args', async () => {
    const disputeId = 5n;
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvBool(false) },
    const fakeTx = { id: 'unsigned' } as never;
    const fakeAssembledTx = { id: 'assembled' } as never;

    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(
      makeResolvedDispute({ id: disputeId, resolver: keypair.publicKey() }),
    );
    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue(fakeTx);
    jest.spyOn(transactionUtils, 'assembleTransaction').mockReturnValue({
      build: () => fakeAssembledTx,
    } as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'fake-hash',
      ledger: 100,
      successful: true,
    });
    (transactionUtils.buildContractCall as jest.Mock).mockClear();
    (transactionUtils.submitTransaction as jest.Mock).mockClear();
    mockServer.simulateTransaction.mockResolvedValue(simulationSuccess(456n));

    const result = await client.dispute.resolveDispute(disputeId, true);

    expect(transactionUtils.buildContractCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      FAKE_CONTRACT_ID,
      'resolve_dispute',
      expect.any(Array),
      getTestnetConfig(FAKE_CONTRACT_ID).networkPassphrase,
    );
    const buildMock = transactionUtils.buildContractCall as jest.Mock;
    const buildCalls = buildMock.mock.calls;
    const args = buildCalls[buildCalls.length - 1][4] as xdr.ScVal[];
    expect(args).toHaveLength(4);
    expect(scValToNative(args[1])).toBe(disputeId);
    expect(scValToNative(args[2])).toBe(true);
    expect(transactionUtils.submitTransaction).toHaveBeenCalledWith(
      expect.anything(),
      fakeAssembledTx,
      keypair,
    );
    expect(result).toMatchObject({
      hash: 'fake-hash',
      ledger: 100,
      successful: true,
      returnValue: 456n,
    });
  });
});

describe('DisputeModule.appealDispute', () => {
  const keypair = Keypair.random();
  const appealResolver = Keypair.random().publicKey();

  it('throws ReadOnlyClient when no keypair', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));

    await expect(client.dispute.appealDispute(FAKE_ESCROW_ID, appealResolver)).rejects.toMatchObject({
      code: VeriTixErrorCode.ReadOnlyClient,
    });
  });

  it('throws InvalidAddress for invalid Stellar address', async () => {
    const { client } = makeConnectedClient(keypair);

    await expect(
      client.dispute.appealDispute(FAKE_ESCROW_ID, 'not-a-valid-stellar-address'),
    ).rejects.toMatchObject({
      code: VeriTixErrorCode.InvalidAddress,
    });
  });

  it('throws when appealResolver equals caller', async () => {
    const { client } = makeConnectedClient(keypair);

    await expect(
      client.dispute.appealDispute(FAKE_ESCROW_ID, keypair.publicKey()),
    ).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeInvalidState,
    });
  });

  it('throws DisputeInvalidState when the dispute is still open', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(
      makeResolvedDispute({ status: DisputeStatus.Open }),
    );

    await expect(
      client.dispute.appealDispute(FAKE_ESCROW_ID, appealResolver),
    ).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeInvalidState,
    });
  });

  it('submits with correct dispute_id and appeal_resolver args', async () => {
    const disputeId = 7n;
    const { client, mockServer } = makeConnectedClient(keypair);
    const fakeTx = { id: 'unsigned' } as never;
    const fakeAssembledTx = { id: 'assembled' } as never;

    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(
      makeResolvedDispute({ id: disputeId, status: DisputeStatus.ResolvedForDepositor }),
    );
    jest.spyOn(transactionUtils, 'buildContractCall').mockResolvedValue(fakeTx);
    jest.spyOn(transactionUtils, 'assembleTransaction').mockReturnValue({
      build: () => fakeAssembledTx,
    } as never);
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'fake-hash',
      ledger: 100,
      successful: true,
    });
    (transactionUtils.buildContractCall as jest.Mock).mockClear();
    (transactionUtils.submitTransaction as jest.Mock).mockClear();
    mockServer.simulateTransaction.mockResolvedValue(simulationSuccess(456n));

    const result = await client.dispute.appealDispute(disputeId, appealResolver);

    expect(transactionUtils.buildContractCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      FAKE_CONTRACT_ID,
      'appeal_dispute',
      expect.any(Array),
      getTestnetConfig(FAKE_CONTRACT_ID).networkPassphrase,
    );
    const buildMock = transactionUtils.buildContractCall as jest.Mock;
    const buildCalls = buildMock.mock.calls;
    const args = buildCalls[buildCalls.length - 1][4] as xdr.ScVal[];
    expect(args).toHaveLength(3);
    expect(scValToNative(args[1])).toBe(disputeId);
    expect(scValToNative(args[2])).toBe(appealResolver);
    expect(transactionUtils.submitTransaction).toHaveBeenCalledWith(
      expect.anything(),
      fakeAssembledTx,
      keypair,
    );
    expect(result).toMatchObject({
      hash: 'fake-hash',
      ledger: 100,
      successful: true,
      returnValue: 456n,
    });
  });
});

describe('DisputeModule.isDisputeOpen', () => {
  const keypair = Keypair.random();

  it('returns true when dispute is in Open state', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvBool(true)),
    );

    const isOpen = await client.dispute.isDisputeOpen(FAKE_ESCROW_ID);

    expect(isOpen).toBe(true);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns false when dispute is resolved', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvBool(false)),
    );

    const isOpen = await client.dispute.isDisputeOpen(FAKE_ESCROW_ID);

    expect(isOpen).toBe(false);
  });
});

describe('DisputeModule.isDisputeExpired', () => {
  const keypair = Keypair.random();

  it('returns true when current ledger >= expiry', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvBool(true)),
    );

    const expired = await client.dispute.isDisputeExpired(FAKE_ESCROW_ID);

    expect(expired).toBe(true);
  });

  it('returns false for resolved disputes', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvBool(false)),
    );

    const expired = await client.dispute.isDisputeExpired(FAKE_ESCROW_ID);

    expect(expired).toBe(false);
  });

  it('returns false when no result', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue(simulationSuccess(undefined));

    const expired = await client.dispute.isDisputeExpired(FAKE_ESCROW_ID);

    expect(expired).toBe(false);
  });

  it('throws on simulation error', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'ERROR',
      error: 'contract panic',
    });

    await expect(client.dispute.isDisputeExpired(FAKE_ESCROW_ID)).rejects.toThrow();
  });
});

describe('DisputeModule.appealDispute', () => {
  const appealClaimant = Keypair.random();
  const appealResolver = Keypair.random().publicKey();

  it('throws when no signing keypair is available', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
    await expect(
      client.dispute.appealDispute(3n, appealResolver),
    ).rejects.toThrow('signing keypair required');
  });

  it('throws DISPUTE_INVALID_STATE when appealResolver equals the caller', async () => {
    const { client } = makeConnectedClient(appealClaimant);
    await expect(
      client.dispute.appealDispute(FAKE_ESCROW_ID, appealClaimant.publicKey()),
    ).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeInvalidState,
    });
  });

  it('submits appeal_dispute with the correct dispute_id and appeal_resolver args', async () => {
    const appealResolver = Keypair.random().publicKey();
    const { client, mockServer } = makeConnectedClient(appealClaimant);

    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      escrowId: 321n,
      claimant: appealClaimant.publicKey(),
      resolver: appealResolver,
      status: DisputeStatus.Open,
      openedAt: 1,
    });

    const buildSpy = jest.spyOn(transactionUtils, 'buildContractCall');
    jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
      hash: 'appeal-hash',
      ledger: 120,
      successful: true,
      returnValue: undefined,
    });

    mockServer.simulateTransaction.mockResolvedValue(rawSimSuccess());

    const result = await client.dispute.appealDispute(FAKE_ESCROW_ID, appealResolver);

    expect(result.hash).toBe('appeal-hash');
    expect(result.successful).toBe(true);

    expect(buildSpy).toHaveBeenCalled();
    const call = buildSpy.mock.calls[0];
    expect(call[3]).toBe('appeal_dispute');
    const args = call[4] as xdr.ScVal[];
    expect(scValToNative(args[1])).toBe(FAKE_ESCROW_ID);
    expect(scValToNative(args[2])).toBe(appealResolver);
  });
});

describe('DisputeModule.expireDispute', () => {
  const keypair = Keypair.random();

  it('throws when no signing keypair', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));

    await expect(client.dispute.expireDispute(1n)).rejects.toThrow('signing keypair required');
  });

  it('throws DISPUTE_NOT_FOUND when dispute does not exist', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(null);

    await expect(client.dispute.expireDispute(1n)).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeNotFound,
    });
  });

  it('throws DISPUTE_ALREADY_RESOLVED when dispute is not open', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(
      makeResolvedDispute({ status: DisputeStatus.ResolvedForBeneficiary }),
    );

    await expect(client.dispute.expireDispute(1n)).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeAlreadyResolved,
    });
  });
});
