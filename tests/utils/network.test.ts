import { Keypair } from '@stellar/stellar-sdk';
import { isValidStellarAddress, assertValidAddress } from '../../src/utils/network';
import { VeriTixError, VeriTixErrorCode } from '../../src/utils/errors';

const VALID_ADDRESS = Keypair.random().publicKey();

describe('isValidStellarAddress', () => {
  it('returns true for a valid Ed25519 public key', () => {
    expect(isValidStellarAddress(VALID_ADDRESS)).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isValidStellarAddress('')).toBe(false);
  });

  it('returns false for an address starting with G but wrong length', () => {
    expect(isValidStellarAddress('GABC')).toBe(false);
  });

  it('returns false for a non-string value', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isValidStellarAddress(null as any)).toBe(false);
  });

  it('returns false for a contract ID (starts with C)', () => {
    expect(isValidStellarAddress('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4')).toBe(
      false,
    );
  });
});

describe('assertValidAddress', () => {
  it('does not throw for a valid address', () => {
    expect(() => assertValidAddress(VALID_ADDRESS, 'beneficiary')).not.toThrow();
  });

  it('throws VeriTixError with INVALID_ADDRESS for an invalid address', () => {
    expect(() => assertValidAddress('not-an-address', 'beneficiary')).toThrow(VeriTixError);
  });

  it('throws with code INVALID_ADDRESS', () => {
    try {
      assertValidAddress('bad', 'recipient');
    } catch (err) {
      expect(err).toBeInstanceOf(VeriTixError);
      expect((err as VeriTixError).code).toBe(VeriTixErrorCode.InvalidAddress);
    }
  });

  it('includes the fieldName in the error message', () => {
    try {
      assertValidAddress('bad', 'depositor');
    } catch (err) {
      expect((err as VeriTixError).message).toContain('depositor');
    }
  });
});
