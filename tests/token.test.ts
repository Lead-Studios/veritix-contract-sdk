/**
 * @file tests/token.test.ts
 * Unit tests for {@link TokenModule}.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import * as txUtils from '../src/utils/transaction';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS  = Keypair.random().publicKey();

function simSuccess(retval: ReturnType<typeof nativeToScVal>) {
  return { result: { retval }, latestLedger: 1, minResourceFee: '100', transactionData: '', events: [] };
}

describe('TokenModule', () => {
  let client: VeriTixClient;
  let mockSimulate: jest.Mock;

  beforeEach(() => {
    client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    mockSimulate = jest.fn();
    (client as any).setServer({ simulateTransaction: mockSimulate });
  });

  // -- Read methods ----------------------------------------------------------

  it('balance() returns bigint from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(1_000_000n, { type: 'i128' })));
    expect(await client.token.balance(FAKE_ADDRESS)).toBe(1_000_000n);
  });

  it('name() returns string from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal('VeriTix Token')));
    expect(await client.token.name()).toBe('VeriTix Token');
  });

  it('symbol() returns string from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal('VTX')));
    expect(await client.token.symbol()).toBe('VTX');
  });

  it('decimals() returns number from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(7, { type: 'u32' })));
    expect(await client.token.decimals()).toBe(7);
  });

  it('totalSupply() returns bigint from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(1_000_000_000n, { type: 'i128' })));
    expect(await client.token.totalSupply()).toBe(1_000_000_000n);
  });

  it('totalHolders() returns a number (u32) from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(42, { type: 'u32' })));
    const count = await client.token.totalHolders();
    expect(typeof count).toBe('number');
    expect(count).toBe(42);
  });

  it('totalHolders() returns 0 when contract returns no result', async () => {
    mockSimulate.mockResolvedValue({ result: { retval: undefined }, latestLedger: 1, minResourceFee: '100', transactionData: '', events: [] });
    await expect(client.token.totalHolders()).resolves.toBe(0);
  });

  // -- Write methods — keypair guard -----------------------------------------

  it('mint() throws without keypair', async () => {
    await expect(
      client.token.mint({ to: FAKE_ADDRESS, amount: 1_000_000n }),
    ).rejects.toThrow('Keypair is required');
  });

  it('burn() throws without keypair', async () => {
    await expect(client.token.burn(500_000n)).rejects.toThrow('Keypair is required');
  });

  it('burnFrom() throws without keypair', async () => {
    await expect(client.token.burnFrom(FAKE_ADDRESS, 500_000n)).rejects.toThrow('Keypair is required');
  });

  it('transfer() throws without keypair', async () => {
    await expect(
      client.token.transfer({ from: FAKE_ADDRESS, to: FAKE_ADDRESS, amount: 100n }),
    ).rejects.toThrow('Keypair is required');
  });

  it('transferFrom() throws without keypair', async () => {
    await expect(
      client.token.transferFrom(FAKE_ADDRESS, FAKE_ADDRESS, 100n),
    ).rejects.toThrow('Keypair is required');
  });

  it('approve() throws without keypair', async () => {
    await expect(
      client.token.approve({ from: FAKE_ADDRESS, spender: FAKE_ADDRESS, amount: 1_000n, expirationLedger: 999_999 }),
    ).rejects.toThrow('Keypair is required');
  });

  // -- transferFrom allowance check ------------------------------------------

  it('transferFrom() throws INSUFFICIENT_ALLOWANCE when allowance < amount', async () => {
    const { VeriTixErrorCode } = await import('../src/utils/errors');
    const keypair = Keypair.random();
    const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
    const mockSim = jest.fn().mockResolvedValue(simSuccess(nativeToScVal(50n, { type: 'i128' })));
    (clientWithKey as any).setServer({ simulateTransaction: mockSim });

    await expect(
      clientWithKey.token.transferFrom(FAKE_ADDRESS, FAKE_ADDRESS, 100n),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.InsufficientAllowance });
  });

  // -- Input validation ------------------------------------------------------

  it('burn() rejects amount <= 0', async () => {
    await expect(client.token.burn(0n)).rejects.toThrow('amount must be greater than 0');
  });

  it('burnFrom() rejects amount <= 0', async () => {
    await expect(client.token.burnFrom(FAKE_ADDRESS, 0n)).rejects.toThrow('amount must be greater than 0');
  });

  // -- balanceOfBatch (#93) --------------------------------------------------

  describe('balanceOfBatch()', () => {
    it('throws BATCH_TOO_LARGE when more than 100 addresses supplied', async () => {
      const { VeriTixErrorCode } = await import('../src/utils/errors');
      const addrs = Array.from({ length: 101 }, () => FAKE_ADDRESS);
      await expect(client.token.balanceOfBatch(addrs)).rejects.toMatchObject({
        code: VeriTixErrorCode.BatchTooLarge,
      });
    });

    it('returns balances in input order', async () => {
      mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(42n, { type: 'i128' })));
      const results = await client.token.balanceOfBatch([FAKE_ADDRESS, FAKE_ADDRESS]);
      expect(results).toEqual([42n, 42n]);
    });

    it('returns empty array for empty input', async () => {
      const results = await client.token.balanceOfBatch([]);
      expect(results).toEqual([]);
    });
  });

  // -- transferWithMemo (#94) ------------------------------------------------

  describe('transferWithMemo()', () => {
    it('throws when memo exceeds 64 bytes', async () => {
      const { VeriTixError } = await import('../src/utils/errors');
      const longMemo = 'a'.repeat(65);
      await expect(
        client.token.transferWithMemo(FAKE_ADDRESS, 1_000n, longMemo),
      ).rejects.toBeInstanceOf(VeriTixError);
    });

    it('throws without keypair', async () => {
      await expect(
        client.token.transferWithMemo(FAKE_ADDRESS, 1_000n, 'ticket-123'),
      ).rejects.toThrow('Keypair is required');
    });

    it('accepts memo exactly 64 bytes without throwing memo validation error', async () => {
      const memo64 = 'a'.repeat(64);
      // Without keypair it throws ReadOnlyClient, not memo validation
      await expect(
        client.token.transferWithMemo(FAKE_ADDRESS, 1_000n, memo64),
      ).rejects.toThrow('Keypair is required');
    });
  });

  // -- isFrozen --------------------------------------------------------------

  it('isFrozen() returns true when contract returns ScvBool true', async () => {
    mockSimulate.mockResolvedValue({
      result: { retval: xdr.ScVal.scvBool(true) },
      latestLedger: 1, minResourceFee: '100', transactionData: '', events: [],
    });
    await expect(client.token.isFrozen(FAKE_ADDRESS)).resolves.toBe(true);
  });

  it('isFrozen() returns false when contract returns ScvBool false', async () => {
    mockSimulate.mockResolvedValue({
      result: { retval: xdr.ScVal.scvBool(false) },
      latestLedger: 1, minResourceFee: '100', transactionData: '', events: [],
    });
    await expect(client.token.isFrozen(FAKE_ADDRESS)).resolves.toBe(false);
  });

  it('isFrozen() returns false on simulation error', async () => {
    mockSimulate.mockRejectedValue(new Error('contract error: not found'));
    await expect(client.token.isFrozen(FAKE_ADDRESS)).resolves.toBe(false);
  });

  // -- allowance -------------------------------------------------------------

  it('allowance() returns 0n on simulation error', async () => {
    mockSimulate.mockRejectedValue(new Error('not found'));
    await expect(client.token.allowance(FAKE_ADDRESS, FAKE_ADDRESS)).resolves.toBe(0n);
  });

  it('allowance() returns 0n when no result value', async () => {
    mockSimulate.mockResolvedValue({ result: undefined, latestLedger: 1, minResourceFee: '100', transactionData: '', events: [] });
    await expect(client.token.allowance(FAKE_ADDRESS, FAKE_ADDRESS)).resolves.toBe(0n);
  });

  it('allowance() returns bigint from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(5_000_000n, { type: 'i128' })));
    expect(await client.token.allowance(FAKE_ADDRESS, FAKE_ADDRESS)).toBe(5_000_000n);
  });

  // -- getHolders ------------------------------------------------------------

  it('getHolders() returns address array from simulation', async () => {
    const addr1 = Keypair.random().publicKey();
    const addr2 = Keypair.random().publicKey();
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal([addr1, addr2], { type: 'string[]' })));
    const holders = await client.token.getHolders(0, 2);
    expect(holders).toEqual([addr1, addr2]);
  });

  it('getHolders() throws BATCH_TOO_LARGE when limit > 100', async () => {
    const { VeriTixErrorCode } = await import('../src/utils/errors');
    await expect(client.token.getHolders(0, 101)).rejects.toMatchObject({
      code: VeriTixErrorCode.BatchTooLarge,
    });
  });

  // -- expirationLedgerFromDuration -------------------------------------------

  it('expirationLedgerFromDuration() converts seconds to ledger when currentLedger provided', async () => {
    const result = await client.token.expirationLedgerFromDuration(300, 1000);
    expect(result).toBeGreaterThan(1000);
  });

  it('expirationLedgerFromDuration() queries ledger when currentLedger not provided', async () => {
    (client as any).setServer({
      simulateTransaction: mockSimulate,
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 2000 }),
    });
    const result = await client.token.expirationLedgerFromDuration(300);
    expect(result).toBeGreaterThan(2000);
  });

  // -- Comprehensive read decoding tests -------------------------------------

  describe('Read decoding correctness', () => {
    it('decodes balance from i128 ScVal', async () => {
      mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(9_999_999_999n, { type: 'i128' })));
      expect(await client.token.balance(FAKE_ADDRESS)).toBe(9_999_999_999n);
    });

    it('decodes balance from number ScVal', async () => {
      mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(12345, { type: 'i128' })));
      expect(await client.token.balance(FAKE_ADDRESS)).toBe(12345n);
    });

    it('decodes decimals from u32 ScVal', async () => {
      mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(18, { type: 'u32' })));
      expect(await client.token.decimals()).toBe(18);
    });

    it('decodes totalSupply from i128 as bigint', async () => {
      mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(1_000_000_000_000n, { type: 'i128' })));
      expect(await client.token.totalSupply()).toBe(1_000_000_000_000n);
    });

    it('decodes allowance from i128 as bigint', async () => {
      mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(100_000n, { type: 'i128' })));
      expect(await client.token.allowance(FAKE_ADDRESS, FAKE_ADDRESS)).toBe(100_000n);
    });

    it('decodes totalHolders from u32 as number', async () => {
      mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(999, { type: 'u32' })));
      expect(await client.token.totalHolders()).toBe(999);
    });

    it('decodes getHolders string array correctly', async () => {
      const addrs = [Keypair.random().publicKey(), Keypair.random().publicKey()];
      mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(addrs, { type: 'string[]' })));
      expect(await client.token.getHolders(0, 2)).toEqual(addrs);
    });
  });

  // -- Write argument building tests -----------------------------------------

  describe('Write argument building', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(txUtils, 'submitTransaction').mockResolvedValue({
        hash: 'test-hash',
        ledger: 100,
        successful: true,
      });
    });

    it('mint() builds correct arguments', async () => {
      const keypair = Keypair.random();
      const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
      const mockServer = {
        simulateTransaction: jest.fn().mockResolvedValue(simSuccess(xdr.ScVal.scvVoid())),
        getAccount: jest.fn().mockResolvedValue({
          accountId: () => keypair.publicKey(),
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {},
        }),
        sendTransaction: jest.fn().mockResolvedValue({ hash: 'test-hash', status: 'PENDING' }),
        getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 100 }),
      };
      (clientWithKey as any).setServer(mockServer);

      await clientWithKey.token.mint({ to: FAKE_ADDRESS, amount: 5_000_000n });

      const buildMock = txUtils.buildContractCall as jest.Mock;
      expect(buildMock).toHaveBeenCalledTimes(1);
      expect(buildMock.mock.calls[0][3]).toBe('mint');
      expect(buildMock.mock.calls[0][4]).toHaveLength(2); // [to, amount]
    });

    it('transfer() builds correct arguments', async () => {
      const keypair = Keypair.random();
      const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
      const mockServer = {
        simulateTransaction: jest.fn().mockResolvedValue(simSuccess(xdr.ScVal.scvVoid())),
        getAccount: jest.fn().mockResolvedValue({
          accountId: () => keypair.publicKey(),
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {},
        }),
        sendTransaction: jest.fn().mockResolvedValue({ hash: 'test-hash', status: 'PENDING' }),
        getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 100 }),
      };
      (clientWithKey as any).setServer(mockServer);

      await clientWithKey.token.transfer({ from: FAKE_ADDRESS, to: FAKE_ADDRESS, amount: 1_000n });

      const buildMock = txUtils.buildContractCall as jest.Mock;
      expect(buildMock).toHaveBeenCalledTimes(1);
      expect(buildMock.mock.calls[0][3]).toBe('transfer');
      expect(buildMock.mock.calls[0][4]).toHaveLength(3); // [from, to, amount]
    });

    it('burn() builds correct arguments', async () => {
      const keypair = Keypair.random();
      const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
      const mockServer = {
        simulateTransaction: jest.fn().mockResolvedValue(simSuccess(xdr.ScVal.scvVoid())),
        getAccount: jest.fn().mockResolvedValue({
          accountId: () => keypair.publicKey(),
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {},
        }),
        sendTransaction: jest.fn().mockResolvedValue({ hash: 'test-hash', status: 'PENDING' }),
        getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 100 }),
      };
      (clientWithKey as any).setServer(mockServer);

      await clientWithKey.token.burn(500_000n);

      const buildMock = txUtils.buildContractCall as jest.Mock;
      expect(buildMock).toHaveBeenCalledTimes(1);
      expect(buildMock.mock.calls[0][3]).toBe('burn');
      expect(buildMock.mock.calls[0][4]).toHaveLength(2); // [caller, amount]
    });

    it('approve() builds correct arguments', async () => {
      const keypair = Keypair.random();
      const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
      const mockServer = {
        simulateTransaction: jest.fn().mockResolvedValue(simSuccess(xdr.ScVal.scvVoid())),
        getAccount: jest.fn().mockResolvedValue({
          accountId: () => keypair.publicKey(),
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {},
        }),
        sendTransaction: jest.fn().mockResolvedValue({ hash: 'test-hash', status: 'PENDING' }),
        getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 100 }),
      };
      (clientWithKey as any).setServer(mockServer);

      await clientWithKey.token.approve({
        from: FAKE_ADDRESS,
        spender: FAKE_ADDRESS,
        amount: 10_000n,
        expirationLedger: 999_999,
      });

      const buildMock = txUtils.buildContractCall as jest.Mock;
      expect(buildMock).toHaveBeenCalledTimes(1);
      expect(buildMock.mock.calls[0][3]).toBe('approve');
      expect(buildMock.mock.calls[0][4]).toHaveLength(4); // [from, spender, amount, expirationLedger]
    });

    it('transferFrom() builds correct arguments', async () => {
      const keypair = Keypair.random();
      const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
      const mockServer = {
        simulateTransaction: jest.fn().mockResolvedValue(simSuccess(nativeToScVal(1000n, { type: 'i128' }))),
        getAccount: jest.fn().mockResolvedValue({
          accountId: () => keypair.publicKey(),
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {},
        }),
        sendTransaction: jest.fn().mockResolvedValue({ hash: 'test-hash', status: 'PENDING' }),
        getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 100 }),
      };
      (clientWithKey as any).setServer(mockServer);

      await clientWithKey.token.transferFrom(FAKE_ADDRESS, FAKE_ADDRESS, 500n);

      const buildMock = txUtils.buildContractCall as jest.Mock;
      expect(buildMock).toHaveBeenCalledTimes(1);
      expect(buildMock.mock.calls[0][3]).toBe('transfer_from');
      expect(buildMock.mock.calls[0][4]).toHaveLength(4); // [spender, from, to, amount]
    });

    it('burnFrom() builds correct arguments', async () => {
      const keypair = Keypair.random();
      const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
      const mockServer = {
        simulateTransaction: jest.fn().mockResolvedValue(simSuccess(nativeToScVal(1000n, { type: 'i128' }))),
        getAccount: jest.fn().mockResolvedValue({
          accountId: () => keypair.publicKey(),
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {},
        }),
        sendTransaction: jest.fn().mockResolvedValue({ hash: 'test-hash', status: 'PENDING' }),
        getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 100 }),
      };
      (clientWithKey as any).setServer(mockServer);

      await clientWithKey.token.burnFrom(FAKE_ADDRESS, 1_000n);

      const buildMock = txUtils.buildContractCall as jest.Mock;
      expect(buildMock).toHaveBeenCalledTimes(1);
      expect(buildMock.mock.calls[0][3]).toBe('burn_from');
      expect(buildMock.mock.calls[0][4]).toHaveLength(3); // [spender, from, amount]
    });

    it('transferWithMemo() builds correct arguments', async () => {
      const keypair = Keypair.random();
      const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
      const mockServer = {
        simulateTransaction: jest.fn().mockResolvedValue(simSuccess(xdr.ScVal.scvVoid())),
        getAccount: jest.fn().mockResolvedValue({
          accountId: () => keypair.publicKey(),
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {},
        }),
        sendTransaction: jest.fn().mockResolvedValue({ hash: 'test-hash', status: 'PENDING' }),
        getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 100 }),
      };
      (clientWithKey as any).setServer(mockServer);

      await clientWithKey.token.transferWithMemo(FAKE_ADDRESS, 1_000n, 'ticket-123');

      const buildMock = txUtils.buildContractCall as jest.Mock;
      expect(buildMock).toHaveBeenCalledTimes(1);
      expect(buildMock.mock.calls[0][3]).toBe('transfer_with_memo');
      expect(buildMock.mock.calls[0][4]).toHaveLength(4); // [caller, to, amount, memo]
    });
  });

  // -- Read-only client write guards -----------------------------------------

  describe('Read-only client write guards', () => {
    it('read-only client throws on mint()', async () => {
      const readOnlyClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
      (readOnlyClient as any).setServer({ simulateTransaction: mockSimulate });
      await expect(
        readOnlyClient.token.mint({ to: FAKE_ADDRESS, amount: 1_000n }),
      ).rejects.toThrow('Keypair is required');
    });

    it('read-only client throws on transfer()', async () => {
      const readOnlyClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
      (readOnlyClient as any).setServer({ simulateTransaction: mockSimulate });
      await expect(
        readOnlyClient.token.transfer({ from: FAKE_ADDRESS, to: FAKE_ADDRESS, amount: 100n }),
      ).rejects.toThrow('Keypair is required');
    });

    it('read-only client throws on burn()', async () => {
      const readOnlyClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
      (readOnlyClient as any).setServer({ simulateTransaction: mockSimulate });
      await expect(readOnlyClient.token.burn(500n)).rejects.toThrow('Keypair is required');
    });

    it('read-only client throws on burnFrom()', async () => {
      const readOnlyClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
      (readOnlyClient as any).setServer({ simulateTransaction: mockSimulate });
      await expect(readOnlyClient.token.burnFrom(FAKE_ADDRESS, 500n)).rejects.toThrow('Keypair is required');
    });

    it('read-only client throws on approve()', async () => {
      const readOnlyClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
      (readOnlyClient as any).setServer({ simulateTransaction: mockSimulate });
      await expect(
        readOnlyClient.token.approve({
          from: FAKE_ADDRESS,
          spender: FAKE_ADDRESS,
          amount: 1_000n,
          expirationLedger: 999_999,
        }),
      ).rejects.toThrow('Keypair is required');
    });

    it('read-only client throws on transferFrom()', async () => {
      const readOnlyClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
      (readOnlyClient as any).setServer({ simulateTransaction: mockSimulate });
      await expect(
        readOnlyClient.token.transferFrom(FAKE_ADDRESS, FAKE_ADDRESS, 100n),
      ).rejects.toThrow('Keypair is required');
    });

    it('read-only client throws on transferWithMemo()', async () => {
      const readOnlyClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
      (readOnlyClient as any).setServer({ simulateTransaction: mockSimulate });
      await expect(
        readOnlyClient.token.transferWithMemo(FAKE_ADDRESS, 1_000n, 'memo'),
      ).rejects.toThrow('Keypair is required');
    });
  });
});
