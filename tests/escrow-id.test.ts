jest.mock('@stellar/stellar-sdk', () => ({
  nativeToScVal: (value: bigint): { u32: number } => ({ u32: Number(value) }),
  xdr: {
    ScVal: { scvU32: (value: number): { u32: number } => ({ u32: value }) },
  },
}));

import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';
import { escrowIdToScVal } from '../src/utils/escrow-id';

describe('escrowIdToScVal', () => {
  it('encodes the full u32 range', () => {
    expect(escrowIdToScVal(0n)).toEqual({ u32: 0 });
    expect(escrowIdToScVal(0xffff_ffffn)).toEqual({ u32: 0xffff_ffff });
  });

  it.each([-1n, 0x1_0000_0000n, 0x1_0000_0000_0000n])(
    'rejects out-of-range id %s with InvalidInput',
    (id) => {
      try {
        escrowIdToScVal(id);
        throw new Error('expected escrowIdToScVal to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(VeriTixError);
        expect((err as VeriTixError).code).toBe(VeriTixErrorCode.InvalidInput);
      }
    },
  );
});
