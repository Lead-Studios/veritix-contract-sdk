import { StrKey } from '@stellar/stellar-sdk';
import { DUMMY_PUBLIC_KEY } from '../../src/utils/network';

describe('DUMMY_PUBLIC_KEY constant (issue #201)', () => {
  it('is exported as a string', () => {
    expect(typeof DUMMY_PUBLIC_KEY).toBe('string');
  });

  it('passes Stellar StrKey Ed25519 public key validation', () => {
    expect(StrKey.isValidEd25519PublicKey(DUMMY_PUBLIC_KEY)).toBe(true);
  });

  it('starts with the account prefix "G"', () => {
    expect(DUMMY_PUBLIC_KEY.startsWith('G')).toBe(true);
  });

  it('is exactly 56 characters long', () => {
    // Stellar Ed25519 public keys are 56 characters including the "G" prefix.
    expect(DUMMY_PUBLIC_KEY.length).toBe(56);
  });

  it('is a deterministic, non-empty constant (no Keypair.random() per call)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const second = require('../../src/utils/network').DUMMY_PUBLIC_KEY;
    expect(second).toBe(DUMMY_PUBLIC_KEY);
    expect(second.length).toBeGreaterThan(0);
  });
});
