/**
 * @file tests/token.test.ts
 * Unit tests for {@link TokenModule}.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';

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
    (client.token as any).server = { simulateTransaction: mockSimulate };
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
    (clientWithKey.token as any).server = { simulateTransaction: mockSim };

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
});
