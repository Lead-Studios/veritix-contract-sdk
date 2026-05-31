/**
 * @file tests/token.test.ts
 * Unit tests for {@link TokenModule}.
 *
 * Covers issues #86, #87 (read methods), #90 (transferFrom / keypair guard),
 * and #91 (burn / burnFrom with validation).
 *
 * Network calls are intercepted by replacing the module's server instance
 * with a jest.fn() mock, so no live RPC is required.
 */
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair, nativeToScVal } from '@stellar/stellar-sdk';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS  = Keypair.random().publicKey();

/** Minimal SimulateTransactionSuccessResponse shape accepted by simulateRead */
function simSuccess(retval: ReturnType<typeof nativeToScVal>) {
  return { result: { retval } };
}

describe('TokenModule', () => {
  let client: VeriTixClient;
  let mockSimulate: jest.Mock;

  beforeEach(() => {
    client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    mockSimulate = jest.fn();
    // Inject mock server so no real RPC is needed
    (client.token as any).server = { simulateTransaction: mockSimulate };
  });

  // -- Read methods (#86, #87) ------------------------------------------------

  it('balance() returns bigint from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(1_000_000n, { type: 'i128' })));
    expect(await client.token.balance(FAKE_ADDRESS)).toBe(1_000_000n);
  });

  it('allowance() returns bigint from simulation', async () => {
    mockSimulate.mockResolvedValue(simSuccess(nativeToScVal(500n, { type: 'i128' })));
    expect(await client.token.allowance(FAKE_ADDRESS, FAKE_ADDRESS)).toBe(500n);
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

  // -- Write methods — keypair guard (#90, #91) --------------------------------

  it('mint() throws without keypair', async () => {
    await expect(
      client.token.mint({ to: FAKE_ADDRESS, amount: 1_000_000n }),
    ).rejects.toThrow('Keypair is required');
  });

  it('burn() throws without keypair', async () => {
    await expect(client.token.burn(500_000n)).rejects.toThrow('Keypair is required');
  });

  it('burnFrom() throws without keypair', async () => {
    await expect(
      client.token.burnFrom(FAKE_ADDRESS, 500_000n),
    ).rejects.toThrow('Keypair is required');
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
      client.token.approve({
        from: FAKE_ADDRESS,
        spender: FAKE_ADDRESS,
        amount: 1_000n,
        expirationLedger: 999_999,
      }),
    ).rejects.toThrow('Keypair is required');
  });

  // -- transferFrom allowance check (#90) -----------------------------------

  it('transferFrom() throws INSUFFICIENT_ALLOWANCE when allowance < amount', async () => {
    const keypair = Keypair.random();
    const clientWithKey = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
    const mockSim = jest.fn().mockResolvedValue(
      simSuccess(nativeToScVal(50n, { type: 'i128' })),
    );
    (clientWithKey.token as any).server = { simulateTransaction: mockSim };

    await expect(
      clientWithKey.token.transferFrom(FAKE_ADDRESS, FAKE_ADDRESS, 100n),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ALLOWANCE' });
  });

  // -- Input validation (#91) -------------------------------------------------

  it('burn() rejects amount <= 0', async () => {
    await expect(client.token.burn(0n)).rejects.toThrow('amount must be greater than 0');
  });

  it('burnFrom() rejects amount <= 0', async () => {
    await expect(
      client.token.burnFrom(FAKE_ADDRESS, 0n),
    ).rejects.toThrow('amount must be greater than 0');
  });
});
