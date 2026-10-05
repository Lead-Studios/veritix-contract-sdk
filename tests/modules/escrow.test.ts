/**
 * @file tests/modules/escrow.test.ts
 * Unit tests for {@link EscrowModule}.
 */
import { VeriTixClient } from '../../src/client';
import { getTestnetConfig } from '../../src/utils/network';
import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

function simSuccess(retval: xdr.ScVal) {
  return { result: { retval }, latestLedger: 1, minResourceFee: '100', transactionData: '', events: [] };
}

describe('EscrowModule', () => {
  let client: VeriTixClient;
  let mockSimulate: jest.Mock;

  beforeEach(() => {
    client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    mockSimulate = jest.fn();
    (client as any).setServer({ simulateTransaction: mockSimulate });
  });

  describe('getEscrow()', () => {
    it('returns null when simulation returns no retval', async () => {
      mockSimulate.mockResolvedValue({ result: null });
      const result = await client.escrow.getEscrow(123n);
      expect(result).toBeNull();
    });

    it('returns EscrowRecord when simulation returns valid data', async () => {
      const escrowMap = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('id'), val: xdr.ScVal.scvU64(123) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('depositor'), val: xdr.ScVal.scvString('GDEPOSIT') }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('beneficiary'), val: xdr.ScVal.scvString('GBENEF') }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('amount'), val: xdr.ScVal.scvI128(1000) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('released'), val: xdr.ScVal.scvBool(false) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('refunded'), val: xdr.ScVal.scvBool(false) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('expiry_ledger'), val: xdr.ScVal.scvU32(1000) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('memos'), val: xdr.ScVal.scvVec([]) }),
      ]);
      mockSimulate.mockResolvedValue(simSuccess(escrowMap));

      const result = await client.escrow.getEscrow(123n);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(123n);
      expect(result?.depositor).toBe('GDEPOSIT');
      expect(result?.beneficiary).toBe('GBENEF');
      expect(result?.amount).toBe(1000n);
      expect(result?.released).toBe(false);
      expect(result?.refunded).toBe(false);
      expect(result?.expiryLedger).toBe(1000);
      expect(result?.memos).toEqual([]);
    });

    it('throws NotConnected when server is not set', async () => {
      const disconnectedClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
      await expect(disconnectedClient.escrow.getEscrow(123n)).rejects.toThrow('call connect()');
    });
  });
});
