import { xdr } from '@stellar/stellar-sdk';

import { VeriTixError, VeriTixErrorCode } from './errors';
import { bigintToScVal } from './scval';

/** Largest escrow id the contract's `u32` argument can represent. */
const MAX_ESCROW_ID = 0xffff_ffffn;

/** Encodes an escrow id as the contract's `u32` type after validating its range. */
export function escrowIdToScVal(id: bigint): xdr.ScVal {
  if (id < 0n || id > MAX_ESCROW_ID) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidInput,
      `escrow id ${id} is out of range for u32`,
    );
  }
  return bigintToScVal(id, 'u32');
}
