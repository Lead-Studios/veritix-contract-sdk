/**
 * @file tests/recurring.test.ts
 * Unit tests for RecurringModule.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { RecurringModule } from '../src/modules/recurring';
import { Keypair, SorobanDataBuilder } from '@stellar/stellar-sdk';
import { VeriTixErrorCode } from '../src/utils/errors';
import * as transactionUtils from '../src/utils/transaction';
import type { RecurringRecord } from '../src/types/index';
import { bigintToScVal } from '../src/utils/scval';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_PAYER = Keypair.random().publicKey();
const PAYEE = Keypair.random().publicKey();
const OTHER = Keypair.random().publicKey();

// A parsed Soroban simulation success that `SorobanRpc.assembleTransaction`
// can consume (transactionData.build(), result.auth, minResourceFee).
function parsedSuccess(): Record<string, unknown> {
  return {
    _parsed: true,
    latestLedger: 100,
    minResourceFee: '100',
    cost: { cpuInsns: '0', memBytes: '0' },
    transactionData: new SorobanDataBuilder(),
    result: { retval: undefined, auth: [] },
    events: [],
  };
}

function makeRecurringRecord(overrides: Partial<RecurringRecord> = {}): RecurringRecord {
  return {
    id: 1n,
    payer: FAKE_PAYER,
    payee: PAYEE,
    amount: 1_000_000n,
    interval: 100,
    active: true,
    paused: false,
    lastChargedLedger: 0,
    ...overrides,
  };
}

function makeRecurringClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn().mockResolvedValue(parsedSuccess()),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
  };
  (client as any).server = mockServer;
  (client as any).connected = true;
  return { client, mockServer };
}

function mockSubmit() {
  return jest.spyOn(transactionUtils, 'submitTransaction').mockResolvedValue({
    hash: 'tx-hash',
    ledger: 30,
    successful: true,
  });
}

// ---------------------------------------------------------------------------
// #467 — pauseRecurring / resumeRecurring
// ---------------------------------------------------------------------------
describe('RecurringModule.pauseRecurring', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('throws ReadOnlyClient when no keypair', async () => {
    const { client } = makeRecurringClient();
    await expect(client.recurring.pauseRecurring(1n)).rejects.toMatchObject({
      code: VeriTixErrorCode.ReadOnlyClient,
    });
  });

  it('submits with the correct recurring_id arg', async () => {
    const keypair = Keypair.random();
    const { client } = makeRecurringClient(keypair);
    const buildCall = jest.spyOn(transactionUtils, 'buildContractCall');
    mockSubmit();

    const result = await client.recurring.pauseRecurring(5n);
    expect(result.successful).toBe(true);

    const call = buildCall.mock.calls[0];
    expect(call[3]).toBe('pause_recurring');
    expect(call[4]).toHaveLength(1);
    expect(call[4][0]).toEqual(bigintToScVal(5n, 'u64'));
  });
});

describe('RecurringModule.resumeRecurring', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('throws ReadOnlyClient when no keypair', async () => {
    const { client } = makeRecurringClient();
    await expect(client.recurring.resumeRecurring(1n)).rejects.toMatchObject({
      code: VeriTixErrorCode.ReadOnlyClient,
    });
  });

  it('submits with the correct recurring_id arg', async () => {
    const keypair = Keypair.random();
    const { client } = makeRecurringClient(keypair);
    const buildCall = jest.spyOn(transactionUtils, 'buildContractCall');
    mockSubmit();

    const result = await client.recurring.resumeRecurring(9n);
    expect(result.successful).toBe(true);

    const call = buildCall.mock.calls[0];
    expect(call[3]).toBe('resume_recurring');
    expect(call[4]).toHaveLength(1);
    expect(call[4][0]).toEqual(bigintToScVal(9n, 'u64'));
  });
});

// ---------------------------------------------------------------------------
// Existing recurring behaviour kept in clean form
// ---------------------------------------------------------------------------
describe('RecurringModule.amendRecurring', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('throws when neither amount nor interval is provided', async () => {
    const { client } = makeRecurringClient(Keypair.random());
    await expect(client.recurring.amendRecurring(1n, {})).rejects.toThrow(
      'at least one of amount or interval must be provided',
    );
  });

  it('throws when no keypair is supplied', async () => {
    const { client } = makeRecurringClient();
    await expect(
      client.recurring.amendRecurring(1n, { amount: 2_000_000n }),
    ).rejects.toThrow('signing keypair required');
  });

  it('succeeds when only amount is updated', async () => {
    const { client } = makeRecurringClient(Keypair.random());
    jest.spyOn(transactionUtils, 'buildContractCall');
    mockSubmit();

    const result = await client.recurring.amendRecurring(1n, { amount: 2_000_000n });
    expect(result.successful).toBe(true);
    const buildMock = transactionUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe('amend_recurring');
  });
});

describe('RecurringModule.transferPayer', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('throws when no keypair is supplied', async () => {
    const { client } = makeRecurringClient();
    await expect(client.recurring.transferPayer(1n, OTHER)).rejects.toThrow(
      'signing keypair required',
    );
  });

  it('throws when new payer is the same as the current payer', async () => {
    const keypair = Keypair.random();
    const { client } = makeRecurringClient(keypair);
    await expect(client.recurring.transferPayer(1n, keypair.publicKey())).rejects.toThrow(
      'new payer must differ from the current payer',
    );
  });

  it('throws when the recurring payment is inactive', async () => {
    const { client } = makeRecurringClient(Keypair.random());
    jest
      .spyOn(client.recurring, 'getRecurring')
      .mockResolvedValue(makeRecurringRecord({ active: false }));

    await expect(client.recurring.transferPayer(1n, OTHER)).rejects.toThrow(
      'recurring payment is inactive',
    );
  });

  it('succeeds when payment is active', async () => {
    const { client } = makeRecurringClient(Keypair.random());
    jest.spyOn(client.recurring, 'getRecurring').mockResolvedValue(makeRecurringRecord());
    jest.spyOn(transactionUtils, 'buildContractCall');
    mockSubmit();

    const result = await client.recurring.transferPayer(1n, OTHER);
    expect(result.successful).toBe(true);
    const buildMock = transactionUtils.buildContractCall as jest.Mock;
    expect(buildMock.mock.calls[0][3]).toBe('transfer_payer');
  });
});

describe('RecurringModule.executeAllDue', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('returns empty arrays when no recurring payments exist', async () => {
    const { client } = makeRecurringClient(Keypair.random());
    const result = await client.recurring.executeAllDue(FAKE_PAYER);
    expect(result).toEqual({ executed: [], skipped: [], failed: [] });
  });

  it('skips inactive IDs', async () => {
    const { client } = makeRecurringClient(Keypair.random());
    jest.spyOn(client.recurring as any, 'getRecurringByPayer').mockResolvedValue([1n]);
    jest
      .spyOn(client.recurring, 'getRecurring')
      .mockResolvedValue(makeRecurringRecord({ active: false }));

    const result = await client.recurring.executeAllDue(FAKE_PAYER);
    expect(result.skipped).toEqual([1n]);
  });

  it('adds to executed when execute() succeeds', async () => {
    const { client } = makeRecurringClient(Keypair.random());
    jest.spyOn(client.recurring as any, 'getRecurringByPayer').mockResolvedValue([2n]);
    jest.spyOn(client.recurring, 'getRecurring').mockResolvedValue(makeRecurringRecord({ id: 2n }));
    jest
      .spyOn(client.recurring, 'execute')
      .mockResolvedValue({ hash: 'abc', ledger: 1, successful: true });

    const result = await client.recurring.executeAllDue(FAKE_PAYER);
    expect(result.executed).toEqual([2n]);
  });

  it('adds to failed when execute() throws', async () => {
    const { client } = makeRecurringClient(Keypair.random());
    jest.spyOn(client.recurring as any, 'getRecurringByPayer').mockResolvedValue([3n]);
    jest.spyOn(client.recurring, 'getRecurring').mockResolvedValue(makeRecurringRecord({ id: 3n }));
    jest
      .spyOn(client.recurring, 'execute')
      .mockRejectedValue(new Error('interval not elapsed'));

    const result = await client.recurring.executeAllDue(FAKE_PAYER);
    expect(result.failed).toEqual([3n]);
  });
});
