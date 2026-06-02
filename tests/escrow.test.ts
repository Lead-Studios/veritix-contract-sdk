/**
 * @file tests/escrow.test.ts
 * Unit tests for {@link EscrowModule}.
 */

import { Keypair, SorobanRpc, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../src/utils/errors';
import * as transactionUtils from '../src/utils/transaction';

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
